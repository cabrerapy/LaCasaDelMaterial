import { test } from 'node:test';
import assert from 'node:assert/strict';
import { App, Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { ApplicationData, DATA_SCHEMA, type DataTableName } from '../lib/application-data.js';

test('all 16 candidate tables are on-demand, protected, retained, encrypted with PITR', () => {
  const stack = new Stack(new App(), 'DataTest');
  new ApplicationData(stack, 'Data');
  const template = Template.fromStack(stack);
  template.resourceCountIs('AWS::DynamoDB::Table', 16);
  template.resourceCountIs('AWS::KMS::Key', 0);
  template.allResourcesProperties('AWS::DynamoDB::Table', {
    BillingMode: 'PAY_PER_REQUEST', DeletionProtectionEnabled: true,
    PointInTimeRecoverySpecification: { PointInTimeRecoveryEnabled: true },
    SSESpecification: { SSEEnabled: true }
  });
  template.allResources('AWS::DynamoDB::Table', { DeletionPolicy: 'Retain', UpdateReplacePolicy: 'Retain' });
});

test('table keys and every GSI preserve local repository schema without provisioned capacity', () => {
  const stack = new Stack(new App(), 'DataSchemaTest');
  const data = new ApplicationData(stack, 'Data');
  const template = Template.fromStack(stack);
  for (const name of Object.keys(DATA_SCHEMA) as DataTableName[]) {
    const table = data.tables[name];
    const resource = template.toJSON().Resources[stack.getLogicalId(table.node.defaultChild as import('aws-cdk-lib').CfnResource)];
    const schema = DATA_SCHEMA[name];
    assert.deepEqual(resource.Properties.KeySchema, [{ AttributeName: schema.partition, KeyType: 'HASH' }]);
    const expected = (schema.indexes as readonly (readonly [string, string, string?])[]).map(([IndexName, partition, sort]) => ({
      IndexName, KeySchema: [{ AttributeName: partition, KeyType: 'HASH' },
        ...(sort ? [{ AttributeName: sort, KeyType: 'RANGE' }] : [])], Projection: { ProjectionType: 'ALL' }
    }));
    assert.deepEqual(resource.Properties.GlobalSecondaryIndexes ?? [], expected);
    assert.equal(resource.Properties.ProvisionedThroughput, undefined);
    assert.equal(resource.Properties.TimeToLiveSpecification, undefined);
    assert.equal(resource.Properties.StreamSpecification, undefined);
  }
});
