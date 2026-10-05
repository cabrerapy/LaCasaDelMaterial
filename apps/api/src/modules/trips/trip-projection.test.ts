import assert from 'node:assert/strict';
import { test } from 'node:test';
import { item } from './infrastructure/dynamodb-trip.repository.js';
import type { Trip } from './domain/trip.js';

test('delivered trip retains date index, filters and searchable projection', () => {
  const trip: Trip = { id: 'qa-trip', tripNumber: 'VIA-QA', truckId: 'qa-truck', truckLabel: 'QA Truck', driverId: 'qa-driver', driverName: 'QA Driver', saleId: 'qa-sale', originName: 'Depot', destinationName: 'QA Site', destinationAddress: 'Local QA', status: 'DELIVERED', scheduledDate: '2026-10-04', freightChargeGuarani: 0, createdAt: '2026-10-04T10:00:00Z', updatedAt: '2026-10-04T11:00:00Z', createdBy: 'qa', updatedBy: 'qa' };
  const projection = item(trip);
  assert.equal(projection.datePk, 'TRIP');
  assert.equal(projection.dateSk, '2026-10-04#2026-10-04T10:00:00Z#qa-trip');
  assert.equal(projection.status, 'DELIVERED');
  assert.equal(projection.saleId, trip.saleId);
  assert.equal(projection.driverId, trip.driverId);
  assert.equal(projection.truckId, trip.truckId);
  assert.match(projection.searchText, /qa site/);
  assert.deepEqual(projection.data, trip);
});
