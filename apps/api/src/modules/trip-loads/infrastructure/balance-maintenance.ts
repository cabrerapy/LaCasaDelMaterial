import { DynamoDBDocumentClient, ScanCommand, TransactWriteCommand, type TransactWriteCommandInput } from '@aws-sdk/lib-dynamodb';
import type { DeliveryReceipt } from '../../deliveries/domain/delivery.js';
import type { TripLoad } from '../domain/trip-load.js';

async function scan(c: DynamoDBDocumentClient, table: string, type: string) {
  const records: Record<string, unknown>[] = [];
  let key: Record<string, unknown> | undefined;
  do {
    const r = await c.send(new ScanCommand({ TableName: table, ConsistentRead: true, FilterExpression: 'entityType=:type', ExpressionAttributeValues: { ':type': type }, ...(key ? { ExclusiveStartKey: key } : {}) }));
    records.push(...(r.Items ?? [])); key = r.LastEvaluatedKey;
  } while (key);
  return records;
}

export async function maintainBalances(c: DynamoDBDocumentClient, table: string, deliveriesTable: string, rebuild: boolean): Promise<readonly string[]> {
  // Capture projection versions before reading historical sources.
  const actual = new Map((await scan(c, table, 'DELIVERY_BALANCE')).map(r => [String(r['pk']), r]));
  const expected = new Map<string, { saleId: string; saleItemId: string; allocated: number; delivered: number }>();
  const get = (saleId: string, saleItemId: string) => {
    const pk = `BALANCE#${saleId}#${saleItemId}`;
    let row = expected.get(pk);
    if (!row) { row = { saleId, saleItemId, allocated: 0, delivered: 0 }; expected.set(pk, row); }
    return row;
  };
  for (const record of await scan(c, table, 'TRIP_LOAD')) {
    const load = record['data'] as TripLoad;
    if (load.status === 'CONFIRMED') for (const line of load.lines) get(load.saleId, line.saleItemId).allocated += line.quantityBaseInternal;
  }
  for (const record of await scan(c, deliveriesTable, 'DELIVERY')) {
    const delivery = record['data'] as DeliveryReceipt;
    if (delivery.status !== 'CONFIRMED' && delivery.status !== 'VOIDED') continue;
    for (const line of delivery.lines) {
      const row = get(delivery.saleId, line.saleItemId);
      // Voiding reverses delivered quantities, not the original release of the load.
      row.allocated -= line.loadedQuantityBaseInternal;
      if (delivery.status === 'CONFIRMED') row.delivered += line.deliveredQuantityBaseInternal;
    }
  }
  const issues: string[] = [];
  const tx: NonNullable<TransactWriteCommandInput['TransactItems']> = [];
  for (const pk of new Set([...actual.keys(), ...expected.keys()])) {
    const old = actual.get(pk), row = expected.get(pk);
    if (!row || !old || !Number.isSafeInteger(old['soldQuantityBaseInternal'])) {
      issues.push(`${pk}: falta histórico o cantidad vendida; no se reconstruye automáticamente`); continue;
    }
    if (row.allocated < 0 || row.delivered < 0 || row.allocated + row.delivered > Number(old['soldQuantityBaseInternal'])) {
      issues.push(`${pk}: histórico inconsistente`); continue;
    }
    if (row.allocated !== Number(old['allocatedQuantityBaseInternal'] ?? 0) || row.delivered !== Number(old['deliveredQuantityBaseInternal'] ?? 0)) issues.push(`${pk}: asignado=${row.allocated}, entregado=${row.delivered}; proyección diferente`);
    if (rebuild) tx.push({ Put: { TableName: table, Item: { ...old, allocatedQuantityBaseInternal: row.allocated, deliveredQuantityBaseInternal: row.delivered, version: Number(old['version'] ?? 0) + 1 }, ConditionExpression: old['version'] === undefined ? 'attribute_not_exists(#version)' : '#version=:version', ExpressionAttributeNames: { '#version': 'version' }, ...(old['version'] === undefined ? {} : { ExpressionAttributeValues: { ':version': old['version'] } }) } });
  }
  if (!rebuild) return issues;
  // Do not partially repair incomplete history, or silently split an atomic rebuild.
  if (tx.length !== new Set([...actual.keys(), ...expected.keys()]).size) throw new Error(issues.join('\n'));
  if (tx.length > 100) throw new Error('Reconstrucción excede 100 saldos; requiere mantenimiento específico');
  if (tx.length) await c.send(new TransactWriteCommand({ TransactItems: tx }));
  return [];
}
