import { test } from 'node:test';
import assert from 'node:assert/strict';
import { publishRuntimeConfig, type PublicConfigObject, type RuntimeConfigPublisher } from '../lib/runtime-config-publication.js';
const target = { bucket: 'offline-lcm-test', expectedBucketOwner: '123456789012', region: 'us-east-1',
  frontendOrigin: 'https://app.example.invalid', stackName: 'Stack', outputKey: 'Config' };
const outputs = { Stack: { Config: JSON.stringify({ authMode: 'cognito', cognito: {
  domain: 'https://offline.auth.us-east-1.amazoncognito.com', clientId: 'offline',
  redirectUri: target.frontendOrigin + '/auth/callback', logoutUri: target.frontendOrigin + '/login'
} }) } };
function adapter(account = target.expectedBucketOwner) {
  const calls: { region: string; object: PublicConfigObject }[] = [];
  const publisher: RuntimeConfigPublisher = {
    async verifyAccount() { return account; },
    async putObject(region, object) { calls.push({ region, object }); }
  };
  return { publisher, calls };
}
test('publishes only generated Cognito config with owner protection and no-store', async () => {
  const { publisher, calls } = adapter();
  await publishRuntimeConfig(outputs, target, publisher);
  assert.equal(calls.length, 1);
  const call = calls[0]!;
  assert.equal(call.region, target.region);
  assert.equal(call.object.ExpectedBucketOwner, target.expectedBucketOwner);
  assert.equal(call.object.Bucket, target.bucket);
  assert.equal(call.object.Key, 'runtime-config.json');
  assert.equal(call.object.CacheControl, 'no-store, max-age=0');
  assert.equal(call.object.ContentType, 'application/json; charset=utf-8');
  assert.equal(JSON.parse(call.object.Body).authMode, 'cognito');
});
test('does not upload to wrong account, malformed bucket or mismatched frontend', async () => {
  for (const scenario of ['account', 'bucket', 'origin', 'outputs']) {
    const { publisher, calls } = adapter(scenario === 'account' ? '999999999999' : target.expectedBucketOwner);
    await assert.rejects(publishRuntimeConfig(scenario === 'outputs' ? {} : outputs,
      { ...target, bucket: scenario === 'bucket' ? 's3://wrong/path' : target.bucket,
        frontendOrigin: scenario === 'origin' ? 'https://other.invalid' : target.frontendOrigin }, publisher));
    assert.equal(calls.length, 0);
  }
});
test('propagates upload failure instead of reporting successful publication', async () => {
  const { publisher } = adapter();
  publisher.putObject = async () => { throw new Error('upload rejected'); };
  await assert.rejects(publishRuntimeConfig(outputs, target, publisher), /upload rejected/);
});
