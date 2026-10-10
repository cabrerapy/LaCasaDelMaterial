import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { App, Stack } from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { Bucket, BlockPublicAccess } from 'aws-cdk-lib/aws-s3';
import { FrontendDelivery } from '../lib/frontend-delivery.js';
import { SPA_ROUTING_CODE } from '../lib/spa-routing.js';

test('SPA routing preserves assets and API errors', () => {
  const handler = runInNewContext(`${SPA_ROUTING_CODE}; handler`) as
    (event: { request: { uri: string; method: string } }) => { uri: string };
  for (const uri of ['/', '/dashboard', '/trips/uuid/delivery', '/reports/sales']) {
    assert.equal(handler({ request: { uri, method: 'GET' } }).uri, '/index.html');
  }
  for (const uri of ['/missing.js', '/missing.css', '/assets/missing', '/api', '/api/health']) {
    assert.equal(handler({ request: { uri, method: 'GET' } }).uri, uri);
  }
  assert.equal(handler({ request: { uri: '/sales', method: 'POST' } }).uri, '/sales');
});

test('candidate frontend signs S3 requests and redirects viewers to HTTPS', () => {
  const stack = new Stack(new App(), 'FrontendTest');
  new FrontendDelivery(stack, 'Frontend', new Bucket(stack, 'Bucket', {
    blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
  }));
  const template = Template.fromStack(stack);
  template.hasResourceProperties('AWS::CloudFront::OriginAccessControl', {
    OriginAccessControlConfig: Match.objectLike({ SigningBehavior: 'always', SigningProtocol: 'sigv4' }),
  });
  template.hasResourceProperties('AWS::CloudFront::Distribution', {
    DistributionConfig: Match.objectLike({
      DefaultCacheBehavior: Match.objectLike({ ViewerProtocolPolicy: 'redirect-to-https' }),
    }),
  });
  const resources = template.findResources('AWS::CloudFront::Distribution');
  for (const resource of Object.values(resources)) {
    assert.equal(resource.Properties.DistributionConfig.CustomErrorResponses, undefined);
  }
});
