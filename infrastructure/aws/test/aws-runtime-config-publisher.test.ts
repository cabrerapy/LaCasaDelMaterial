import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GetCallerIdentityCommand } from '@aws-sdk/client-sts';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { AwsRuntimeConfigPublisher } from '../lib/aws-runtime-config-publisher.js';
import { publishRuntimeConfig } from '../lib/runtime-config-publication.js';

const target = { bucket: 'offline-lcm-test', expectedBucketOwner: '123456789012', region: 'us-east-1',
  frontendOrigin: 'https://app.example.invalid', stackName: 'Stack', outputKey: 'Config' };
const outputs = { Stack: { Config: JSON.stringify({ authMode: 'cognito', cognito: {
  domain: 'https://offline.auth.us-east-1.amazoncognito.com', clientId: 'offline',
  redirectUri: target.frontendOrigin + '/auth/callback', logoutUri: target.frontendOrigin + '/login'
} }) } };
test('SDK integration sends STS before owner-protected S3 PutObject, no ACL', async () => {
  const calls: string[] = [];
  const publisher = new AwsRuntimeConfigPublisher(target.region, {
    async send(command) {
      assert.ok(command instanceof GetCallerIdentityCommand);
      assert.deepEqual(command.input, {});
      calls.push('STS');
      return { Account: target.expectedBucketOwner, $metadata: {} };
    }
  }, {
    async send(command) {
      assert.ok(command instanceof PutObjectCommand);
      assert.equal(command.input.ExpectedBucketOwner, target.expectedBucketOwner);
      assert.equal(command.input.Key, 'runtime-config.json');
      assert.equal(command.input.CacheControl, 'no-store, max-age=0');
      assert.equal(command.input.ACL, undefined);
      calls.push('S3');
      return { $metadata: {} };
    }
  });
  await publishRuntimeConfig(outputs, target, publisher);
  assert.deepEqual(calls, ['STS', 'S3']);
});
test('invalid or mismatched STS account prevents S3 access', async () => {
  for (const Account of [undefined, 'invalid', '999999999999']) {
    let uploads = 0;
    const publisher = new AwsRuntimeConfigPublisher(target.region, {
      async send() { return { Account, $metadata: {} }; }
    }, { async send() { uploads++; return { $metadata: {} }; } });
    await assert.rejects(publishRuntimeConfig(outputs, target, publisher));
    assert.equal(uploads, 0);
  }
});
test('region mismatch and SDK failures propagate without reporting success', async () => {
  const publisher = new AwsRuntimeConfigPublisher('us-east-2', {
    async send() { return { Account: target.expectedBucketOwner, $metadata: {} }; }
  }, { async send() { throw new Error('S3 unavailable'); } });
  await assert.rejects(publishRuntimeConfig(outputs, target, publisher), /region mismatch/);
  const matching = new AwsRuntimeConfigPublisher(target.region, {
    async send() { return { Account: target.expectedBucketOwner, $metadata: {} }; }
  }, { async send() { throw new Error('S3 unavailable'); } });
  await assert.rejects(publishRuntimeConfig(outputs, target, matching), /S3 unavailable/);
});
