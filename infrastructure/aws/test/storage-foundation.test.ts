import { test } from 'node:test';
import assert from 'node:assert/strict';
import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { StorageFoundationStack } from '../lib/storage-foundation-stack.js';

test('storage is private, encrypted, retained and rejects HTTP', () => {
  const template = Template.fromStack(new StorageFoundationStack(new App(), 'Test'));
  template.resourceCountIs('AWS::S3::Bucket', 2);
  template.resourceCountIs('AWS::S3::BucketPolicy', 2);
  template.allResourcesProperties('AWS::S3::Bucket', {
    PublicAccessBlockConfiguration: {
      BlockPublicAcls: true, BlockPublicPolicy: true,
      IgnorePublicAcls: true, RestrictPublicBuckets: true,
    },
    BucketEncryption: { ServerSideEncryptionConfiguration: [{
      ServerSideEncryptionByDefault: { SSEAlgorithm: 'AES256' },
    }] },
    OwnershipControls: { Rules: [{ ObjectOwnership: 'BucketOwnerEnforced' }] },
  });
  template.allResources('AWS::S3::Bucket', {
    DeletionPolicy: 'Retain', UpdateReplacePolicy: 'Retain',
  });
  template.allResourcesProperties('AWS::S3::BucketPolicy', {
    PolicyDocument: { Statement: Match.arrayWith([Match.objectLike({
      Effect: 'Deny', Condition: { Bool: { 'aws:SecureTransport': 'false' } },
    })]) },
  });
  const resources = template.toJSON().Resources as Record<string, { Type: string }>;
  assert.deepEqual([...new Set(Object.values(resources).map(r => r.Type))].sort(),
    ['AWS::S3::Bucket', 'AWS::S3::BucketPolicy']);
});
