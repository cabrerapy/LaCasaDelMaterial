import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { prepareRetainedImport } from './prepare-retained-import.mjs';

const text = readFileSync(new URL('../cdk.out-review/LcmApplicationReview.template.json', import.meta.url), 'utf8');
test('offline import candidate contains only 13 tables, two buckets and existing pool', () => {
  const candidate = prepareRetainedImport(text);
  assert.equal(candidate.readyToApply, false);
  assert.equal(candidate.awsCallsMade, false);
  assert.equal(candidate.configurationComparisonComplete, false);
  assert.ok(candidate.knownBlockers.some(message => message.includes('PITR')));
  assert.equal(candidate.resourcesToImport.length, 16);
  assert.equal(candidate.resourcesToImport.filter(r => r.ResourceType === 'AWS::DynamoDB::Table').length, 13);
  assert.equal(candidate.resourcesToImport.filter(r => r.ResourceType === 'AWS::S3::Bucket').length, 2);
  assert.deepEqual(candidate.resourcesToImport.find(r => r.ResourceType === 'AWS::Cognito::UserPool').ResourceIdentifier, { UserPoolId: 'us-east-1_YPC3Ocqj9' });
  const source = JSON.parse(text);
  for (const [id, resource] of Object.entries(candidate.template.Resources)) {
    const expected = structuredClone(source.Resources[id]);
    if (resource.Type === 'AWS::DynamoDB::Table') {
      expected.Properties.PointInTimeRecoverySpecification.PointInTimeRecoveryEnabled = false;
    }
    assert.deepEqual(resource, expected);
    assert.equal(resource.DeletionPolicy, 'Retain');
  }
  assert.equal(candidate.template.Outputs, undefined);
});
test('import baseline defers all 13 PITR enablements without weakening final template', () => {
  const candidate = prepareRetainedImport(text);
  const source = JSON.parse(text);
  assert.equal(candidate.deferredChanges.length, 13);
  for (const change of candidate.deferredChanges) {
    assert.equal(change.observedValue, false);
    assert.equal(change.desiredValue, true);
    assert.equal(source.Resources[change.logicalId].Properties.PointInTimeRecoverySpecification.PointInTimeRecoveryEnabled, true);
    assert.equal(candidate.template.Resources[change.logicalId].Properties.PointInTimeRecoverySpecification.PointInTimeRecoveryEnabled, false);
  }
  assert.equal(new Set(candidate.deferredChanges.map(change => change.tableName)).size, 13);
});
test('changed template is rejected instead of silently adopting another release', () => {
  assert.throws(() => prepareRetainedImport(`${text}\n`), /hash mismatch/);
  assert.throws(() => prepareRetainedImport('{}'), /hash mismatch/);
});
