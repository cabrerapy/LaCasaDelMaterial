import { BatchGetCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
// Never interpret throttled keys as missing balances.
export async function batchRead(client: DynamoDBDocumentClient, table: string, keys: readonly string[]): Promise<Record<string, unknown>[]> {
  const records: Record<string, unknown>[] = [];
  const unique = [...new Set(keys)];
  for (let offset = 0; offset < unique.length; offset += 100) {
    let pending = unique.slice(offset, offset + 100).map((pk) => ({ pk }));
    for (let attempt = 0; pending.length && attempt < 6; attempt++) {
      const response = await client.send(new BatchGetCommand({ RequestItems: { [table]: { Keys: pending, ConsistentRead: true } } }));
      records.push(...(response.Responses?.[table] ?? []));
      pending = (response.UnprocessedKeys?.[table]?.Keys ?? []) as { pk: string }[];
      if (pending.length) await new Promise((resolve) => setTimeout(resolve, 25 * 2 ** attempt));
    }
    if (pending.length) throw Object.assign(new Error('Consulta incompleta; vuelva a intentar'), { statusCode: 503 });
  }
  return records;
}
