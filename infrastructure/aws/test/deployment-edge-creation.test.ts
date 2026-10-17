import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deploymentEdgeCreation } from '../lib/deployment-edge-creation.js';

const account = '123456789012', region = 'us-east-1', executor = 'lcm-production-cfn-executor';
const now = Date.parse('2026-10-17T12:00:00.000Z');
const expiry = '2026-10-17T12:30:00.000Z';

test('edge exception contains only the two approved creation actions', () => {
  const statement = deploymentEdgeCreation(account, region, executor, expiry, now).Statement[0]!;
  assert.deepEqual(statement.Action, ['cloudfront:CreateCachePolicy', 'cloudfront:CreateOriginAccessControl']);
  assert.deepEqual(statement.Resource, ['*']);
  assert.equal(statement.Effect, 'Allow');
  assert.ok(statement.Action.every(action => !action.includes('*')));
});

test('exception requires exact dedicated executor principal account and bounded request time', () => {
  const condition = deploymentEdgeCreation(account, region, executor, expiry, now).Statement[0]!.Condition;
  assert.equal(condition.ArnEquals['aws:PrincipalArn'], `arn:aws:iam::${account}:role/${executor}`);
  assert.equal(condition.StringEquals['aws:PrincipalAccount'], account);
  assert.equal(condition.DateGreaterThanEquals['aws:CurrentTime'], new Date(now).toISOString());
  assert.equal(condition.DateLessThan['aws:CurrentTime'], expiry);
});

test('rejects expired missing ambiguous or excessive windows without renewing automatically', () => {
  for (const invalid of ['', 'not-a-date', '2026-10-17T12:30:00Z',
    '2026-10-17T12:30:00.000+00:00', '2026-02-30T12:30:00.000Z',
    '2026-10-17T11:59:59.999Z', '2026-10-17T12:00:00.000Z', '2026-10-17T13:00:00.001Z']) {
    assert.throws(() => deploymentEdgeCreation(account, region, executor, invalid, now));
  }
  assert.doesNotThrow(() => deploymentEdgeCreation(account, region, executor, '2026-10-17T13:00:00.000Z', now));
  assert.throws(() => deploymentEdgeCreation(account, region, executor, expiry, Number.NaN));
});

test('rejects broad foreign or runtime principals and unreviewed target', () => {
  for (const invalid of ['*', 'AdministratorAccess', 'lcm-production-runtime',
    'lcm-production-cfn-executor/other', `arn:aws:iam::${account}:role/${executor}`]) {
    assert.throws(() => deploymentEdgeCreation(account, region, invalid, expiry, now));
  }
  assert.throws(() => deploymentEdgeCreation('*', region, executor, expiry, now));
  assert.throws(() => deploymentEdgeCreation(account, 'us-east-2', executor, expiry, now));
});
