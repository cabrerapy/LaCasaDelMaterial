import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DeliveriesService } from './deliveries.service.js';
import type { DeliveryRepository } from '../domain/delivery.repository.js';
import type { TripRepository } from '../../trips/domain/trip.repository.js';
import type { TripLoadRepository } from '../../trip-loads/domain/trip-load.repository.js';
import type { TruckRepository } from '../../trucks/domain/truck.repository.js';
import type { DriverRepository } from '../../drivers/domain/driver.repository.js';

function fixture(own: boolean, signed: boolean, missing = false) {
  let signatures = 0;
  // Narrow test doubles: download must not touch unrelated repository operations.
  const repo = {
    findEvidence: async () => missing ? null : { deliveryReceiptId: 'delivery', storageKey: 'key' },
    findById: async () => ({ tripId: 'trip' })
  } as unknown as DeliveryRepository;
  const trips = { findById: async () => ({ driverId: 'driver' }) } as unknown as TripRepository;
  const drivers = { list: async () => ({ items: own ? [{ id: 'driver', userId: 'user' }] : [] }) } as unknown as DriverRepository;
  const storage = {
    save: async () => { throw new Error('Unexpected upload'); },
    resolve: async () => { throw new Error('Unexpected filesystem access'); },
    ...(signed ? { signedRead: async (key: string) => {
      assert.equal(key, 'key'); signatures++; return 'https://example.com/signed';
    } } : {})
  };
  return {
    service: new DeliveriesService(repo, trips, {} as TripLoadRepository, {} as TruckRepository, drivers, storage),
    signatures: () => signatures
  };
}

test('foreign driver cannot obtain a signature', async () => {
  const f = fixture(false, true);
  await assert.rejects(f.service.evidenceDownload('evidence', 'user', 'DRIVER'), { statusCode: 403 });
  assert.equal(f.signatures(), 0);
});
test('assigned driver receives a signature only after authorization', async () => {
  const f = fixture(true, true);
  assert.deepEqual(await f.service.evidenceDownload('evidence', 'user', 'DRIVER'), { kind: 'signed', url: 'https://example.com/signed' });
  assert.equal(f.signatures(), 1);
});
test('missing evidence never signs an object', async () => {
  const f = fixture(true, true, true);
  await assert.rejects(f.service.evidenceDownload('evidence', 'user', 'ADMIN'), { statusCode: 404 });
  assert.equal(f.signatures(), 0);
});
test('local storage returns a locator without a signature or filesystem access', async () => {
  const f = fixture(true, false);
  assert.deepEqual(await f.service.evidenceDownload('evidence', 'user', 'DRIVER'), { kind: 'local' });
});
