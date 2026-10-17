import { test } from 'node:test';
import assert from 'node:assert/strict';
import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { Code } from 'aws-cdk-lib/aws-lambda';
import { ApplicationReviewStack } from '../lib/application-review-stack.js';
import { runtimeResourceNames } from '../lib/runtime-resource-names.js';
import { runtimeBoundaryPolicy } from '../lib/runtime-boundary-policy.js';

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
  template.resourceCountIs('AWS::Cognito::UserPoolClient', 2);
  const functions = Object.values(template.findResources('AWS::Lambda::Function'));
  const environment = functions[0]!.Properties.Environment.Variables;
  assert.ok(environment.COGNITO_ENROLLMENT_CLIENT_ID);
  assert.notDeepEqual(environment.COGNITO_ENROLLMENT_CLIENT_ID, environment.COGNITO_CLIENT_ID);
  assert.equal(environment.LCM_COGNITO_ENROLLMENT_ENABLED, undefined);
  const json = JSON.stringify(template.toJSON());
  assert.ok(!json.includes('JWT_SECRET'));
  assert.ok(!json.includes('INITIAL_ADMIN_PASSWORD'));
  assert.ok(!json.includes('DYNAMODB_ENDPOINT'));
  // CDK validates the complete dependency graph during synthesis.
  assert.ok(app.synth().getStackArtifact(stack.artifactId).template);
});

test('bounded candidate names match external boundary resources without changing schemas', () => {
  const account = '123456789012', region = 'us-east-1';
  const names = runtimeResourceNames(account, region);
  const app = new App();
  const stack = new ApplicationReviewStack(app, 'BoundedReview', { env: { account, region },
    cognitoDomainPrefix: 'offline-bounded-review', lambdaCode: Code.fromInline('exports.handler = async () => {};'),
    runtimeGuardrail: { roleName: 'lcm-production-runtime',
      boundaryArn: `arn:aws:iam::${account}:policy/lcm-production-runtime-boundary` } });
  const template = Template.fromStack(stack);
  const actualNames = Object.values(template.findResources('AWS::DynamoDB::Table')).map(r => r.Properties.TableName).sort();
  assert.deepEqual(actualNames, Object.values(names.tables).sort());
  template.hasResourceProperties('AWS::S3::Bucket', { BucketName: names.evidenceBucket });
  template.hasResourceProperties('AWS::Logs::LogGroup', { LogGroupName: names.logGroup });
  template.hasResourceProperties('AWS::Lambda::Function', { FunctionName: names.functionName });
  template.hasResourceProperties('AWS::ApiGatewayV2::Api', { Name: names.apiName,
    Tags: { Project: 'LaCasaDelMaterial', Environment: 'production' } });
  template.hasResourceProperties('AWS::Cognito::UserPool', {
    UserPoolTags: { Project: 'LaCasaDelMaterial', Environment: 'production' }
  });
  template.hasResourceProperties('AWS::IAM::Role', { RoleName: 'lcm-production-runtime',
    PermissionsBoundary: `arn:aws:iam::${account}:policy/lcm-production-runtime-boundary` });
  const policy = runtimeBoundaryPolicy(names);
  assert.deepEqual(policy.Statement[0]!.Resource.slice().sort(),
    actualNames.map(name => `arn:aws:dynamodb:${region}:${account}:table/${name}`).sort());
  assert.ok(app.synth().getStackArtifact(stack.artifactId).template);
});

test('production naming rejects unknown account and a different region', () => {
  assert.throws(() => runtimeResourceNames('unknown', 'us-east-1'));
  assert.throws(() => runtimeResourceNames('123456789012', 'us-east-2'));
});
