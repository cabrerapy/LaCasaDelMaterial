import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimatePartialCost, type CostInputs } from '../lib/cost-model.js';

const expected: CostInputs = {
  requests: 100_000, reads: 2_000_000, writes: 200_000,
  databaseGb: 1, logsGb: 1, users: 15, evidenceGb: 5,
  staticAndAssetsGb: 1, s3Gets: 100_000, s3Lists: 1_000, s3Puts: 1_200,
  s3DirectDownloadGb: 5,
  cloudFrontViewerGb: 10, cloudFrontToOriginGb: 0.5,
  cloudFrontHttpsRequests: 200_000, cloudFrontFunctionInvocations: 100_000,
};

test('partial expected estimate is reproducible without AWS or free-tier credits', () => {
  const cost = estimatePartialCost(expected);
  const sum = Object.values(cost).reduce((total, value) => total + value, 0);
  assert.ok(Math.abs(sum - 6.0776675) < 0.0000001);
  assert.equal(cost['s3Storage'], 0.138);
  assert.equal(cost['dynamoWrites'], 1.25);
  assert.ok(Math.abs(cost['lambda']! - 0.4366675) < 0.0000001);
  assert.equal(cost['logsStorage'], 0.007);
  assert.equal(cost['s3Puts'], 0.006);
});

test('direct S3 downloads are independent of retained storage and CloudFront traffic', () => {
  const baseline = estimatePartialCost(expected);
  assert.ok(Math.abs(baseline['s3DirectTransfer']! - 0.45) < 0.0000001);
  assert.equal(estimatePartialCost({ ...expected, s3DirectDownloadGb: 0 })['s3DirectTransfer'], 0);
  assert.equal(estimatePartialCost({ ...expected, evidenceGb: 100 })['s3DirectTransfer'], baseline['s3DirectTransfer']);
  assert.equal(estimatePartialCost({ ...expected, s3DirectDownloadGb: 10 })['cloudFrontViewerTransfer'], baseline['cloudFrontViewerTransfer']);
  for (const s3DirectDownloadGb of [undefined, -1, Number.NaN, 10_001]) {
    assert.throws(() => estimatePartialCost({ ...expected, s3DirectDownloadGb } as CostInputs));
  }
});

test('CloudFront includes API viewer requests and both directions, without free-tier discounts', () => {
  const cost = estimatePartialCost(expected);
  assert.equal(cost['cloudFrontViewerTransfer'], 1.1);
  assert.equal(cost['cloudFrontToOriginTransfer'], 0.0625);
  assert.ok(Math.abs(cost['cloudFrontHttpsRequests']! - 0.44) < 0.0000001);
  assert.ok(Math.abs(cost['cloudFrontFunctions']! - 0.01) < 0.0000001);
  assert.throws(() => estimatePartialCost({ ...expected, cloudFrontViewerGb: 10_001 }));
  assert.throws(() => estimatePartialCost({ ...expected, cloudFrontToOriginGb: Number.NaN }));
});

test('PUT counts are explicit, include retries and cannot be omitted or fractional', () => {
  assert.equal(estimatePartialCost({ ...expected, s3Puts: 0 })['s3Puts'], 0);
  assert.equal(estimatePartialCost({ ...expected, s3Puts: 2_400 })['s3Puts'], 0.012);
  for (const s3Puts of [undefined, -1, 0.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => estimatePartialCost({ ...expected, s3Puts } as CostInputs));
  }
});

test('invalid inputs cannot silently lower an estimate', () => {
  for (const value of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => estimatePartialCost({ ...expected, requests: value }));
  }
});
