import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assetPublisherProposal as preparePublisher } from '../lib/asset-publisher-proposal.js';
const keyArn = 'arn:aws:kms:us-east-1:123456789012:key/111fac51-e972-4c13-88f7-9f3e7a1b3ba0';
const assetPublisherProposal = (account: string, region: string, hash: string) =>
  preparePublisher(account, region, hash, keyArn);

test('publisher trust names only the exact IAM operator and HTTPS', () => {
  const proposal = assetPublisherProposal('123456789012', 'us-east-1', 'a'.repeat(64));
  assert.deepEqual(proposal.trustPolicy.Statement, [{ Sid: 'TrustExactLcmOperator', Effect: 'Allow',
    Principal: { AWS: 'arn:aws:iam::123456789012:user/lcm-admin' }, Action: ['sts:AssumeRole'],
    Condition: { Bool: { 'aws:SecureTransport': 'true' } } }]);
});

test('publisher S3 proposal permits one exact object and requires own role/account/owner/region/encryption', () => {
  const proposal = assetPublisherProposal('123456789012', 'us-east-1', 'a'.repeat(64));
  const statement = proposal.s3Policy.Statement[0];
  assert.ok(statement);
  assert.deepEqual(statement.Action, ['s3:PutObject']);
  assert.deepEqual(statement.Resource, [`arn:aws:s3:::cdk-hnb659fds-assets-123456789012-us-east-1/${'a'.repeat(64)}.zip`]);
  assert.deepEqual(statement.Condition, { StringEquals: {
    'aws:PrincipalArn': proposal.roleArn, 'aws:PrincipalAccount': '123456789012',
    'aws:RequestedRegion': 'us-east-1', 's3:ResourceAccount': '123456789012',
    's3:x-amz-server-side-encryption': 'aws:kms',
    's3:x-amz-server-side-encryption-aws-kms-key-id': keyArn }, Null: { 's3:if-none-match': 'false' }, Bool: { 'aws:SecureTransport': 'true' } });
  assert.ok(statement.Resource.every(resource => !resource.includes('*')));
});

test('publisher refuses aliases, wildcards and foreign KMS keys without expanding permissions', () => {
  for (const key of ['', '*', 'alias/aws/s3', keyArn.replace('123456789012', '999999999999'),
    keyArn.replace('us-east-1', 'us-east-2'), keyArn + '*']) {
    assert.throws(() => preparePublisher('123456789012', 'us-east-1', 'a'.repeat(64), key));
  }
});

test('publisher remains incomplete without KMS grants or deployment instructions', () => {
  const proposal = assetPublisherProposal('123456789012', 'us-east-1', 'a'.repeat(64));
  assert.equal(proposal.readyForPublication, false);
  assert.equal(proposal.result, 'INCOMPLETE_REVIEW_ONLY_NOT_APPLIED');
  assert.ok(!Object.hasOwn(proposal, 'kmsPolicy'));
  assert.ok(proposal.blockers.length >= 8);
  assert.throws(() => assetPublisherProposal('*', 'us-east-1', 'a'.repeat(64)));
  assert.throws(() => assetPublisherProposal('123456789012', 'us-east-2', 'a'.repeat(64)));
  for (const hash of ['', '*', '../a', 'A'.repeat(64), 'a'.repeat(64) + '.zip']) {
    assert.throws(() => assetPublisherProposal('123456789012', 'us-east-1', hash));
  }
});
