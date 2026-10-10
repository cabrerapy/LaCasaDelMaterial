import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimatePartialCost, type CostInputs } from '../lib/cost-model.js';

const expected: CostInputs = {
  requests: 100_000, reads: 2_000_000, writes: 200_000,
  databaseGb: 1, logsGb: 1, users: 15, evidenceGb: 5,
  staticAndAssetsGb: 1, s3Gets: 100_000, s3Lists: 1_000,
};

test('partial expected estimate is reproducible without AWS or free-tier credits', () => {
  const cost = estimatePartialCost(expected);
  const sum = Object.values(cost).reduce((total, value) => total + value, 0);
  assert.ok(Math.abs(sum - 3.932835) < 0.0000001);
  assert.equal(cost['s3Storage'], 0.138);
  assert.equal(cost['dynamoWrites'], 1.25);
});

test('invalid inputs cannot silently lower an estimate', () => {
  for (const value of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => estimatePartialCost({ ...expected, requests: value }));
  }
});
