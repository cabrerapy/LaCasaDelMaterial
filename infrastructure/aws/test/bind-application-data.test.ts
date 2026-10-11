import { test } from 'node:test';
import assert from 'node:assert/strict';
import { App, Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { Function, Runtime, Code } from 'aws-cdk-lib/aws-lambda';
import { ApplicationData } from '../lib/application-data.js';
import { bindApplicationData } from '../lib/bind-application-data.js';

test('binds all table names and restricts data access to tables and exact GSIs', () => {
  const stack = new Stack(new App(), 'BindingTest');
  const data = new ApplicationData(stack, 'Data');
  // Inline code is a test fixture only, never a deployable API entrypoint.
  const fn = new Function(stack, 'Fixture', { runtime: Runtime.NODEJS_24_X, handler: 'index.handler',
    code: Code.fromInline('exports.handler = async () => {};') });
  bindApplicationData(fn, data);
  const template = Template.fromStack(stack);
  const functions = Object.values(template.findResources('AWS::Lambda::Function'));
  const env = functions[0]!.Properties.Environment.Variables;
  assert.equal(Object.keys(env).length, 16);
  assert.ok(env.DYNAMODB_TRIP_LOADS_TABLE);
  assert.ok(env.DYNAMODB_USERS_TABLE);
  assert.equal(env.DYNAMODB_ENDPOINT, undefined);
  const policies = Object.values(template.findResources('AWS::IAM::Policy'));
  const statements = policies.flatMap(policy => policy.Properties.PolicyDocument.Statement);
  const dataStatement = statements.find(statement => statement.Action.includes('dynamodb:GetItem'));
  assert.equal(dataStatement.Resource.length, 16);
  assert.ok(dataStatement.Action.includes('dynamodb:ConditionCheckItem'));
  const indexStatement = statements.find(statement => statement.Action.length === 2 && statement.Action.includes('dynamodb:Query'));
  assert.equal(indexStatement.Resource.length, 24);
  const encoded = JSON.stringify([dataStatement, indexStatement]);
  assert.ok(!encoded.includes('*'));
  for (const forbidden of ['CreateTable', 'DeleteTable', 'UpdateTable', 'RestoreTable', 'BatchWriteItem']) {
    assert.ok(!encoded.includes(forbidden));
  }
});
