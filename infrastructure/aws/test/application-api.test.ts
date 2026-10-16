import { test } from 'node:test';
import assert from 'node:assert/strict';
import { App, Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { Code } from 'aws-cdk-lib/aws-lambda';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { ApplicationApi } from '../lib/application-api.js';
import { ApplicationData } from '../lib/application-data.js';
import { ApplicationIdentity } from '../lib/application-identity.js';

test('API candidate binds production settings with scoped object access and bounded concurrency', () => {
  const stack = new Stack(new App(), 'ApiCandidate');
  new ApplicationApi(stack, 'Api', { data: new ApplicationData(stack, 'Data'),
    identity: new ApplicationIdentity(stack, 'Identity'), evidence: new Bucket(stack, 'Evidence'),
    webOrigin: 'https://offline.invalid',
    // Fixture only; production composition must use the reviewed package asset.
    code: Code.fromInline('exports.handler = async () => {};') });
  const template = Template.fromStack(stack);
  template.hasResourceProperties('AWS::Lambda::Function', { Handler: 'index.handler', Runtime: 'nodejs24.x',
    MemorySize: 512, Timeout: 28, ReservedConcurrentExecutions: 2 });
  template.hasResourceProperties('AWS::Logs::LogGroup', { RetentionInDays: 7 });
  template.hasResourceProperties('AWS::ApiGatewayV2::Api', { ProtocolType: 'HTTP' });
  template.hasResourceProperties('AWS::ApiGatewayV2::Stage', { StageName: '$default',
    DefaultRouteSettings: { ThrottlingRateLimit: 5, ThrottlingBurstLimit: 10, DetailedMetricsEnabled: false } });
  template.hasResourceProperties('AWS::ApiGatewayV2::Route', { RouteKey: 'ANY /api/{proxy+}' });
  template.hasResourceProperties('AWS::ApiGatewayV2::Route', { RouteKey: 'ANY /api' });
  template.hasResourceProperties('AWS::ApiGatewayV2::Integration', { PayloadFormatVersion: '2.0', IntegrationType: 'AWS_PROXY' });
  const fn = Object.values(template.findResources('AWS::Lambda::Function'))[0]!;
  const env = fn.Properties.Environment.Variables;
  assert.equal(env.AUTH_MODE, 'cognito');
  assert.equal(env.JWT_SECRET, undefined);
  assert.equal(env.INITIAL_ADMIN_PASSWORD, undefined);
  assert.ok(env.DYNAMODB_USERS_TABLE);
  const statements = Object.values(template.findResources('AWS::IAM::Policy')).flatMap(p => p.Properties.PolicyDocument.Statement);
  const s3 = statements.find(s => JSON.stringify(s.Action).includes('s3:GetObject'));
  assert.deepEqual(s3.Action, ['s3:GetObject', 's3:PutObject']);
  assert.ok(JSON.stringify(s3.Resource).includes('/deliveries/*'));
  assert.equal(s3.Condition.Bool['aws:SecureTransport'], 'true');
  assert.ok(!JSON.stringify(statements).includes('cognito-idp:'));
  assert.ok(!JSON.stringify(statements).includes('s3:DeleteObject'));
  const roles = Object.values(template.findResources('AWS::IAM::Role'));
  assert.equal(roles.length, 1);
  assert.equal(roles[0]!.Properties.ManagedPolicyArns, undefined);
  const logStatements = statements.filter(s => JSON.stringify(s.Action).includes('logs:'));
  assert.ok(logStatements.length > 0);
  for (const statement of logStatements) {
    assert.ok(!JSON.stringify(statement.Action).includes('CreateLogGroup'));
    assert.notEqual(statement.Resource, '*');
    assert.ok(JSON.stringify(statement.Resource).includes('Logs'));
  }
});

test('explicit runtime boundary is imported and never created by application stack', () => {
  const stack = new Stack(new App(), 'BoundedApi', { env: { account: '123456789012', region: 'us-east-1' } });
  new ApplicationApi(stack, 'Api', { data: new ApplicationData(stack, 'Data'),
    identity: new ApplicationIdentity(stack, 'Identity'), evidence: new Bucket(stack, 'Evidence'),
    webOrigin: 'https://offline.invalid', code: Code.fromInline('exports.handler = async () => {};'),
    runtimeGuardrail: { roleName: 'lcm-production-runtime',
      boundaryArn: 'arn:aws:iam::123456789012:policy/lcm-production-runtime-boundary' } });
  const template = Template.fromStack(stack);
  template.hasResourceProperties('AWS::IAM::Role', { RoleName: 'lcm-production-runtime',
    PermissionsBoundary: 'arn:aws:iam::123456789012:policy/lcm-production-runtime-boundary' });
  template.resourceCountIs('AWS::IAM::ManagedPolicy', 0);
});

test('runtime boundary rejects foreign account and incompatible role before role creation', () => {
  for (const runtimeGuardrail of [
    { roleName: 'lcm-production-runtime', boundaryArn: 'arn:aws:iam::999999999999:policy/lcm-production-boundary' },
    { roleName: 'unrestricted-role', boundaryArn: 'arn:aws:iam::123456789012:policy/lcm-production-boundary' }
  ]) {
    const stack = new Stack(new App(), 'RejectedApi', { env: { account: '123456789012', region: 'us-east-1' } });
    assert.throws(() => new ApplicationApi(stack, 'Api', { data: new ApplicationData(stack, 'Data'),
      identity: new ApplicationIdentity(stack, 'Identity'), evidence: new Bucket(stack, 'Evidence'),
      webOrigin: 'https://offline.invalid', code: Code.fromInline('exports.handler = async () => {};'), runtimeGuardrail }));
    Template.fromStack(stack).resourceCountIs('AWS::IAM::Role', 0);
  }
});
