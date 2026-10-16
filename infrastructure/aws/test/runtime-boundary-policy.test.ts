import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DATA_SCHEMA, type DataTableName } from '../lib/application-data.js';
import { runtimeBoundaryPolicy } from '../lib/runtime-boundary-policy.js';
import { runtimeGuardrailConfig } from '../lib/runtime-guardrail-config.js';

const tables = Object.fromEntries(Object.keys(DATA_SCHEMA).map(key => [key, `lcm-production-${key.toLowerCase()}`])) as Record<DataTableName, string>;
const target = { account: '123456789012', region: 'us-east-1', tables,
  evidenceBucket: 'lcm-production-evidence', logGroup: '/aws/lambda/lcm-production-api' };
test('runtime boundary permits only exact data, declared indexes, delivery objects and own streams', () => {
  const policy = runtimeBoundaryPolicy(target);
  assert.equal(policy.Statement[0]!.Resource.length, 16);
  assert.equal(policy.Statement[1]!.Resource.length, 24);
  assert.ok(policy.Statement.every(s => !s.Resource.includes('*')));
  const text = JSON.stringify(policy);
  for (const forbidden of ['iam:', 'cognito-idp:', 'CreateTable', 'CreateLogGroup', 'DeleteObject', 'AdministratorAccess']) {
    assert.ok(!text.includes(forbidden));
  }
  assert.ok(text.includes('/deliveries/*'));
  assert.ok(text.includes(':log-stream:*'));
});
test('boundary rejects missing duplicate foreign and wildcard resource scopes', () => {
  for (const invalid of [{ ...target, region: 'us-east-2' }, { ...target, evidenceBucket: '*' },
    { ...target, logGroup: '*' }, { ...target, tables: { ...tables, users: tables.products } },
    { ...target, tables: { ...tables, users: 'other-project-users' } }]) {
    assert.throws(() => runtimeBoundaryPolicy(invalid));
  }
});
test('review config fails closed unless both explicit same-account role and boundary are supplied', () => {
  const arn = 'arn:aws:iam::123456789012:policy/lcm-production-boundary';
  assert.deepEqual(runtimeGuardrailConfig('123456789012', 'lcm-production-runtime', arn),
    { roleName: 'lcm-production-runtime', boundaryArn: arn });
  for (const [role, boundary] of [[undefined, undefined], ['lcm-production-runtime', undefined],
    [undefined, arn], ['lcm-production-runtime', arn.replace('123456789012', '999999999999')]]) {
    assert.throws(() => runtimeGuardrailConfig('123456789012', role, boundary));
  }
});
