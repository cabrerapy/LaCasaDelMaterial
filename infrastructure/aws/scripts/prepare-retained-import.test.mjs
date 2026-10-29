import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { prepareRetainedImport, prepareShellImport, prepareRetainedPitrUpdate, prepareRemainingUpdate } from './prepare-retained-import.mjs';

const text = readFileSync(new URL('../cdk.out-review/LcmApplicationReview.template.json', import.meta.url), 'utf8');
test('remaining application candidate preserves all existing PITR resources and only adds 24 definitions', () => {
  const shell = readFileSync(new URL('../recovery-stack-shell.template.json', import.meta.url), 'utf8');
  const p = prepareRemainingUpdate(text, shell);
  const baseline = prepareRetainedPitrUpdate(text, shell).template;
  assert.equal(p.readyToApply, false);
  assert.equal(p.additions.length, 24);
  assert.equal(p.preservedDefinitions.length, 17);
  assert.equal(Object.keys(p.template.Resources).length, 41);
  for (const [id, resource] of Object.entries(baseline.Resources)) assert.deepEqual(p.template.Resources[id], resource);
  assert.equal(p.request.ChangeSetType, 'UPDATE');
  assert.deepEqual(p.request.Capabilities, ['CAPABILITY_NAMED_IAM']);
  assert.deepEqual(JSON.parse(p.request.TemplateBody), p.template);
});
test('PITR update changes exactly 13 boolean values without touching any other property', () => {
  const shellText = readFileSync(new URL('../recovery-stack-shell.template.json', import.meta.url), 'utf8');
  const p = prepareRetainedPitrUpdate(text, shellText);
  assert.equal(p.readyToApply, false);
  assert.equal(p.request.ChangeSetType, 'UPDATE');
  assert.equal(p.request.ResourcesToImport, undefined);
  assert.equal(p.changes.length, 13);
  const restored = structuredClone(p.template);
  for (const change of p.changes) {
    assert.equal(p.template.Resources[change.logicalId].Type, 'AWS::DynamoDB::Table');
    assert.equal(p.template.Resources[change.logicalId].DeletionPolicy, 'Retain');
    assert.equal(p.template.Resources[change.logicalId].Properties.DeletionProtectionEnabled, true);
    assert.equal(p.template.Resources[change.logicalId].Properties.PointInTimeRecoverySpecification.PointInTimeRecoveryEnabled, true);
    restored.Resources[change.logicalId].Properties.PointInTimeRecoverySpecification.PointInTimeRecoveryEnabled = false;
  }
  assert.deepEqual(restored, p.baselineTemplate);
  assert.deepEqual(JSON.parse(p.request.TemplateBody), p.template);
});
test('existing shell import preserves inactive placeholder, exact role/tags and only 16 imports', () => {
  const shellText = readFileSync(new URL('../recovery-stack-shell.template.json', import.meta.url), 'utf8');
  const p = prepareShellImport(text, shellText);
  assert.equal(p.readyToApply, false);
  assert.equal(p.importRequest.ChangeSetType, 'IMPORT');
  assert.equal(p.importRequest.ChangeSetName, 'lcm-reviewed-retained-import2');
  assert.equal(p.resourcesToImport.length, 16);
  assert.equal(Object.keys(p.template.Resources).length, 17);
  assert.deepEqual(p.template.Resources.RecoveryPlaceholder, JSON.parse(shellText).Resources.RecoveryPlaceholder);
  assert.deepEqual(p.importRequest.Tags, prepareRetainedImport(text).importRequest.Tags);
  assert.equal(p.importRequest.RoleARN, prepareRetainedImport(text).importRequest.RoleARN);
  assert.ok(!p.importRequest.ResourcesToImport.some(r => r.LogicalResourceId === 'RecoveryPlaceholder'));
  assert.throws(() => prepareShellImport(text, '{}'), /Unexpected recovery shell/);
});
test('recovery shell has only a permanently false placeholder, no parameters or services', () => {
  const shell = JSON.parse(readFileSync(new URL('../recovery-stack-shell.template.json', import.meta.url), 'utf8'));
  assert.deepEqual(shell.Conditions, { NeverCreateRecoveryPlaceholder: { 'Fn::Equals': ['disabled', 'enabled'] } });
  assert.equal(shell.Parameters, undefined);
  assert.equal(shell.Transform, undefined);
  assert.deepEqual(Object.keys(shell.Resources), ['RecoveryPlaceholder']);
  assert.equal(shell.Resources.RecoveryPlaceholder.Type, 'AWS::CloudFormation::WaitConditionHandle');
  assert.equal(shell.Resources.RecoveryPlaceholder.Condition, 'NeverCreateRecoveryPlaceholder');
  assert.equal(shell.Resources.RecoveryPlaceholder.Properties, undefined);
});
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
test('request prepares IMPORT only with exact executor and no new resource types', () => {
  const candidate = prepareRetainedImport(text);
  const request = candidate.importRequest;
  assert.equal(request.ChangeSetType, 'IMPORT');
  assert.equal(request.StackName, 'LcmApplicationReview');
  assert.equal(request.ChangeSetName, 'lcm-reviewed-retained-import1');
  assert.equal(request.RoleARN, 'arn:aws:iam::088668667831:role/lcm-production-cfn-executor');
  assert.deepEqual(JSON.parse(request.TemplateBody), candidate.template);
  assert.deepEqual(request.ResourcesToImport, candidate.resourcesToImport);
  assert.equal(request.ResourcesToImport.length, Object.keys(candidate.template.Resources).length);
  assert.equal(request.Capabilities, undefined);
  assert.ok(Buffer.byteLength(request.TemplateBody) <= 51200);
  assert.match(candidate.requestSha256, /^[a-f0-9]{64}$/);
  assert.equal(candidate.requestSha256, prepareRetainedImport(text).requestSha256);
});
