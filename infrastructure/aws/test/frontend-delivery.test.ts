import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { App, Stack } from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { Bucket, BlockPublicAccess } from 'aws-cdk-lib/aws-s3';
import { FrontendDelivery } from '../lib/frontend-delivery.js';
import { SPA_ROUTING_CODE } from '../lib/spa-routing.js';
import { HttpApi } from 'aws-cdk-lib/aws-apigatewayv2';

test('SPA routing preserves assets and API errors', () => {
  const handler = runInNewContext(`${SPA_ROUTING_CODE}; handler`) as
    (event: { request: { uri: string; method: string } }) => { uri: string };
  for (const uri of ['/', '/dashboard', '/trips/uuid/delivery', '/reports/sales']) {
    assert.equal(handler({ request: { uri, method: 'GET' } }).uri, '/index.html');
  }
  for (const uri of ['/runtime-config.json', '/missing.js', '/missing.css', '/assets/missing', '/api', '/api/health']) {
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
      CacheBehaviors: Match.arrayWith([Match.objectLike({ PathPattern: 'runtime-config.json',
        CachePolicyId: '4135ea2d-6df8-44a3-9df3-4b5a84be39ad', ViewerProtocolPolicy: 'redirect-to-https' })]),
    }),
  });
  const resources = template.findResources('AWS::CloudFront::Distribution');
  for (const resource of Object.values(resources)) {
    assert.equal(resource.Properties.DistributionConfig.CustomErrorResponses, undefined);
  }
});

test('API behavior disables cache and forwards authorization without viewer Host or SPA rewrite', () => {
  const stack = new Stack(new App(), 'ApiFrontend');
  new FrontendDelivery(stack, 'Frontend', new Bucket(stack, 'Bucket'), new HttpApi(stack, 'Api'));
  const template = Template.fromStack(stack);
  const resource = Object.values(template.findResources('AWS::CloudFront::Distribution'))[0]!;
  const config = resource.Properties.DistributionConfig;
  const behaviors = config.CacheBehaviors.filter((b: { PathPattern: string }) => b.PathPattern === 'api' || b.PathPattern === 'api/*');
  assert.equal(behaviors.length, 2);
  for (const behavior of behaviors) {
    assert.equal(behavior.CachePolicyId, '4135ea2d-6df8-44a3-9df3-4b5a84be39ad');
    assert.equal(behavior.OriginRequestPolicyId, 'b689b0a8-53d0-40ab-baf2-68738e2966ac');
    assert.equal(behavior.ViewerProtocolPolicy, 'https-only');
    assert.equal(behavior.AllowedMethods.length, 7);
    assert.equal(behavior.FunctionAssociations, undefined);
    const origin = config.Origins.find((o: { Id: string }) => o.Id === behavior.TargetOriginId);
    assert.equal(origin.CustomOriginConfig.OriginProtocolPolicy, 'https-only');
    assert.equal(origin.OriginPath, undefined);
  }
  assert.equal(config.CustomErrorResponses, undefined);
});
