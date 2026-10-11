import { test } from 'node:test';
import assert from 'node:assert/strict';
import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { Code } from 'aws-cdk-lib/aws-lambda';
import { ApplicationReviewStack } from '../lib/application-review-stack.js';

test('full review stack synthesizes without cyclic dependencies or local configuration', () => {
  const app = new App();
  const stack = new ApplicationReviewStack(app, 'OfflineReview', {
    cognitoDomainPrefix: 'offline-review-only', lambdaCode: Code.fromInline('exports.handler = async () => {};')
  });
  const template = Template.fromStack(stack);
  template.resourceCountIs('AWS::DynamoDB::Table', 16);
  template.resourceCountIs('AWS::S3::Bucket', 2);
  template.resourceCountIs('AWS::Lambda::Function', 1);
  template.resourceCountIs('AWS::CloudFront::Distribution', 1);
  template.resourceCountIs('AWS::ApiGatewayV2::Api', 1);
  template.hasResourceProperties('AWS::ApiGatewayV2::Stage', { DefaultRouteSettings: {
    ThrottlingRateLimit: 5, ThrottlingBurstLimit: 10, DetailedMetricsEnabled: false
  } });
  template.resourceCountIs('AWS::Cognito::UserPool', 1);
  const json = JSON.stringify(template.toJSON());
  assert.ok(!json.includes('JWT_SECRET'));
  assert.ok(!json.includes('INITIAL_ADMIN_PASSWORD'));
  assert.ok(!json.includes('DYNAMODB_ENDPOINT'));
  // CDK validates the complete dependency graph during synthesis.
  assert.ok(app.synth().getStackArtifact(stack.artifactId).template);
});
