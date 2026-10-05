import { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, QueryCommand, TransactWriteCommand, type TransactWriteCommandInput } from '@aws-sdk/lib-dynamodb';
import type { Truck } from '../../trucks/domain/truck.js';
import type { Trip } from '../domain/trip.js';
import { TripConflictError, type TripListOptions, type TripRepository } from '../domain/trip.repository.js';

export class DynamoDbTripRepository implements TripRepository {
  constructor(private readonly client: DynamoDBDocumentClient, private readonly table: string, private readonly truckTable: string) {}
  async findById(id: string) { const result = await this.client.send(new GetCommand({ TableName: this.table, Key: { pk: `TRIP#${id}` }, ConsistentRead: true })); return result.Item?.['data'] as Trip ?? null; }
  async list(o: TripListOptions) {
    const values: Record<string, unknown> = { ':pk': 'TRIP' }; let condition = 'datePk=:pk';
    if (o.dateFrom || o.dateTo) { values[':from'] = o.dateFrom ?? '0000'; values[':to'] = `${o.dateTo ?? '9999'}\uffff`; condition += ' AND dateSk BETWEEN :from AND :to'; }
    const names: Record<string, string> = {}; const filters: string[] = [];
    for (const field of ['status', 'truckId', 'driverId', 'saleId'] as const) if (o[field]) { names[`#${field}`] = field; values[`:${field}`] = o[field]; filters.push(`#${field}=:${field}`); }
    if (o.search) { names['#search'] = 'searchText'; values[':search'] = o.search.toLocaleLowerCase('es'); filters.push('contains(#search,:search)'); }
    const result = await this.client.send(new QueryCommand({ TableName: this.table, IndexName: 'TripDateIndex', KeyConditionExpression: condition, ExpressionAttributeValues: values, ...(Object.keys(names).length ? { ExpressionAttributeNames: names } : {}), ...(filters.length ? { FilterExpression: filters.join(' AND ') } : {}), Limit: o.limit, ScanIndexForward: false, ...(o.nextToken ? { ExclusiveStartKey: decode(o.nextToken) } : {}) }));
    return { items: (result.Items ?? []).map((record) => record['data'] as Trip), ...(result.LastEvaluatedKey ? { nextToken: encode(result.LastEvaluatedKey) } : {}) };
  }
  async create(trip: Trip) { await this.write([{ Put: { TableName: this.table, Item: item(trip), ConditionExpression: 'attribute_not_exists(pk)' } }, { Put: { TableName: this.table, Item: { pk: `NUMBER#${trip.tripNumber}`, entityType: 'NUMBER' }, ConditionExpression: 'attribute_not_exists(pk)' } }]); }
  async replace(trip: Trip, expected: string) { await this.put(trip, expected); }
  async activate(trip: Trip, expected: string) { await this.write([{ Put: { TableName: this.table, Item: item(trip), ConditionExpression: 'updatedAt=:expected', ExpressionAttributeValues: { ':expected': expected } } }, lock(`TRUCK#${trip.truckId}`, trip.id, this.table), lock(`DRIVER#${trip.driverId}`, trip.id, this.table)]); }
  async release(trip: Trip, expected: string) { await this.write([{ Put: { TableName: this.table, Item: item(trip), ConditionExpression: 'updatedAt=:expected', ExpressionAttributeValues: { ':expected': expected } } }, { Delete: { TableName: this.table, Key: { pk: `ACTIVE_TRUCK#${trip.truckId}` } } }, { Delete: { TableName: this.table, Key: { pk: `ACTIVE_DRIVER#${trip.driverId}` } } }]); }
  async deliver(trip: Trip, expected: string, truck: Truck) { await this.write([{ Put: { TableName: this.table, Item: item(trip), ConditionExpression: 'updatedAt=:expected', ExpressionAttributeValues: { ':expected': expected } } }, { Delete: { TableName: this.table, Key: { pk: `ACTIVE_TRUCK#${trip.truckId}` } } }, { Delete: { TableName: this.table, Key: { pk: `ACTIVE_DRIVER#${trip.driverId}` } } }, { Put: { TableName: this.truckTable, Item: { pk: `TRUCK#${truck.id}`, entityType: 'TRUCK', status: truck.status, vehicleType: truck.vehicleType, fuelType: truck.fuelType, normalizedSearch: truck.normalizedSearch, data: truck }, ConditionExpression: '#data.currentOdometerKm <= :km', ExpressionAttributeNames: { '#data': 'data' }, ExpressionAttributeValues: { ':km': truck.currentOdometerKm } } }]); }
  async sumFreight(saleId: string, exclude?: string) { const page = await this.list({ limit: 100, saleId }); return page.items.filter((trip) => trip.id !== exclude && trip.status !== 'CANCELLED').reduce((total, trip) => total + trip.freightChargeGuarani, 0); }
  private async put(trip: Trip, expected: string) { await this.write([{ Put: { TableName: this.table, Item: item(trip), ConditionExpression: 'updatedAt=:expected', ExpressionAttributeValues: { ':expected': expected } } }]); }
  private async write(operations: NonNullable<TransactWriteCommandInput['TransactItems']>) { try { await this.client.send(new TransactWriteCommand({ TransactItems: operations })); } catch (error) { if (error instanceof TransactionCanceledException) throw new TripConflictError(); throw error; } }
}
export function item(trip: Trip) { return { pk: `TRIP#${trip.id}`, entityType: 'TRIP', datePk: 'TRIP', dateSk: `${trip.scheduledDate}#${trip.createdAt}#${trip.id}`, status: trip.status, truckId: trip.truckId, driverId: trip.driverId, saleId: trip.saleId, searchText: `${trip.tripNumber} ${trip.customerSnapshot?.displayName ?? ''} ${trip.destinationName} ${trip.truckLabel} ${trip.driverName}`.toLocaleLowerCase('es'), updatedAt: trip.updatedAt, data: trip }; }
function lock(key: string, id: string, table: string) { return { Put: { TableName: table, Item: { pk: `ACTIVE_${key}`, entityType: 'LOCK', tripId: id }, ConditionExpression: 'attribute_not_exists(pk)' } }; }
function encode(key: Record<string, unknown>): string { return Buffer.from(JSON.stringify(key)).toString('base64url'); }
function decode(token: string): Record<string, unknown> { try { return JSON.parse(Buffer.from(token, 'base64url').toString()) as Record<string, unknown>; } catch { throw Object.assign(new Error('Cursor inválido'), { statusCode: 400 }); } }
