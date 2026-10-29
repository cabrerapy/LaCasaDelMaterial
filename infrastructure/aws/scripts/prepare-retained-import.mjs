import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const retainedTables = new Set([
  'cash', 'categories', 'costing', 'drivers', 'fuel', 'inventory', 'products',
  'purchases', 'sales', 'suppliers', 'trips', 'trucks', 'users'
].map(name => `lcm-production-${name}`));
const retainedBuckets = new Set([
  'lcm-production-frontend-088668667831-us-east-1',
  'lcm-production-evidence-088668667831-us-east-1'
]);
const reviewedSha256 = 'f73ae10f763b36c97989f7fb86530c5158b3314adfb421df91bcbcae85b9364c';

/** Offline candidate only. No SDK, credentials, subprocesses or AWS mutations. */
export function prepareRetainedImport(templateText) {
  const sha256 = createHash('sha256').update(templateText).digest('hex');
  if (sha256 !== reviewedSha256) throw new Error('Reviewed template hash mismatch');
  const source = JSON.parse(templateText);
  const Resources = {};
  const resourcesToImport = [];
  const deferredChanges = [];
  for (const [logicalId, resource] of Object.entries(source.Resources)) {
    const properties = resource.Properties ?? {};
    let identifier;
    if (resource.Type === 'AWS::DynamoDB::Table' && retainedTables.has(properties.TableName)) {
      identifier = { TableName: properties.TableName };
    } else if (resource.Type === 'AWS::S3::Bucket' && retainedBuckets.has(properties.BucketName)) {
      identifier = { BucketName: properties.BucketName };
    } else if (logicalId === 'IdentityPool9E5AED46' && resource.Type === 'AWS::Cognito::UserPool') {
      identifier = { UserPoolId: 'us-east-1_YPC3Ocqj9' };
    } else continue;
    if (resource.DeletionPolicy !== 'Retain') throw new Error(`Missing Retain: ${logicalId}`);
    if (resource.DependsOn || /"(?:Ref|Fn::GetAtt|Fn::Sub|Fn::ImportValue)"/.test(JSON.stringify(resource))) {
      throw new Error(`Review unresolved dependencies: ${logicalId}`);
    }
    Resources[logicalId] = structuredClone(resource);
    if (resource.Type === 'AWS::DynamoDB::Table') {
      if (properties.PointInTimeRecoverySpecification?.PointInTimeRecoveryEnabled !== true) {
        throw new Error(`Unexpected desired PITR configuration: ${logicalId}`);
      }
      Resources[logicalId].Properties.PointInTimeRecoverySpecification.PointInTimeRecoveryEnabled = false;
      deferredChanges.push({ logicalId, tableName: properties.TableName,
        property: 'PointInTimeRecoverySpecification.PointInTimeRecoveryEnabled',
        observedValue: false, desiredValue: true,
        reason: 'Read-only recovery audit observed PITR DISABLED; enable separately after import approval' });
    }
    resourcesToImport.push({ ResourceType: resource.Type, LogicalResourceId: logicalId, ResourceIdentifier: identifier });
  }
  if (resourcesToImport.length !== 16) throw new Error('Expected exactly 16 retained resources');
  const template = { AWSTemplateFormatVersion: '2010-09-09', Resources };
  const importRequest = {
    StackName: 'LcmApplicationReview',
    ChangeSetName: 'lcm-reviewed-retained-import1',
    ChangeSetType: 'IMPORT',
    Description: 'Import only the 16 retained retry1 resources; PITR enablement deferred',
    RoleARN: 'arn:aws:iam::088668667831:role/lcm-production-cfn-executor',
    TemplateBody: JSON.stringify(template),
    ResourcesToImport: structuredClone(resourcesToImport),
    Tags: [{ Key: 'Project', Value: 'LaCasaDelMaterial' }, { Key: 'Environment', Value: 'production' }],
    ClientToken: 'lcm-retained-import1-251bfa70-d0b3-11f1-bb97-0effeb39a9b5'
  };
  if (Buffer.byteLength(importRequest.TemplateBody) > 51200) throw new Error('Template exceeds inline API limit');
  return {
    result: 'RETAINED_IMPORT_OFFLINE_CANDIDATE_NOT_AUTHORIZED', readyToApply: false,
    awsCallsMade: false, sourceTemplateSha256: sha256,
    configurationComparisonComplete: false,
    knownBlockers: [
      'AWS rejected this new-stack IMPORT request: cannot modify or add RoleArn and Tags; do not submit unchanged or drop executor silently',
      'PITR baseline reflects audit only, not a fresh live snapshot; 13 enablements are deferred',
      'Failed stack deletion completed with Retain; fresh import eligibility and permissions are not yet verified',
      'Remaining live properties and import permissions still require complete verification'
    ],
    failedStackArn: 'arn:aws:cloudformation:us-east-1:088668667831:stack/LcmApplicationReview/251bfa70-d0b3-11f1-bb97-0effeb39a9b5',
    template, resourcesToImport, deferredChanges, importRequest,
    requestSha256: createHash('sha256').update(JSON.stringify(importRequest)).digest('hex'),
    gates: [
      'Refresh exact live identifiers, ownership, properties and contents before any mutation',
      'Resolve observed PITR mismatch explicitly; import itself does not enable recovery',
      'Confirm identifiers against GetTemplateSummary and resource association before creating IMPORT change set',
      'Confirm deleted stack history is not active ownership; this candidate authorizes no further deletion',
      'Review import permissions and execute only an explicitly approved IMPORT change set',
      'Run drift detection after import; compare configuration before adding remaining resources',
      'Resolve Logs tagged creation and refresh expired authority before subsequent deployment'
    ]
  };
}

/** Existing shell verified CREATE_COMPLETE with same role/tags; retains inactive placeholder. */
export function prepareShellImport(templateText, shellText) {
  const plan = prepareRetainedImport(templateText);
  const shell = JSON.parse(shellText);
  const expectedCondition = { NeverCreateRecoveryPlaceholder: { 'Fn::Equals': ['disabled', 'enabled'] } };
  if (JSON.stringify(shell.Conditions) !== JSON.stringify(expectedCondition) ||
      Object.keys(shell.Resources ?? {}).join() !== 'RecoveryPlaceholder' ||
      shell.Resources.RecoveryPlaceholder.Type !== 'AWS::CloudFormation::WaitConditionHandle' ||
      shell.Resources.RecoveryPlaceholder.Condition !== 'NeverCreateRecoveryPlaceholder' ||
      shell.Parameters || shell.Transform) throw new Error('Unexpected recovery shell');
  plan.template.Conditions = structuredClone(shell.Conditions);
  plan.template.Resources.RecoveryPlaceholder = structuredClone(shell.Resources.RecoveryPlaceholder);
  plan.importRequest.StackName = 'arn:aws:cloudformation:us-east-1:088668667831:stack/LcmApplicationReview/b2b93cb0-d0dd-11f1-a355-0e392e77eda7';
  plan.importRequest.ChangeSetName = 'lcm-reviewed-retained-import2';
  plan.importRequest.ClientToken = 'lcm-retained-import2-b2b93cb0';
  plan.importRequest.TemplateBody = JSON.stringify(plan.template);
  plan.requestSha256 = createHash('sha256').update(JSON.stringify(plan.importRequest)).digest('hex');
  plan.knownBlockers = [
    'Execution not authorized; inspect actual IMPORT changes and effective executor permissions',
    'Configuration comparison remains incomplete; PITR enablement is deferred',
    'Verify existing shell role/tags are unchanged before sending the request'
  ];
  return plan;
}

/** Offline UPDATE proposal only: keep all imported resources and inactive shell unchanged. */
export function prepareRetainedPitrUpdate(templateText, shellText) {
  const baseline = prepareShellImport(templateText, shellText);
  const template = structuredClone(baseline.template);
  for (const change of baseline.deferredChanges) {
    template.Resources[change.logicalId].Properties.PointInTimeRecoverySpecification.PointInTimeRecoveryEnabled = true;
  }
  const request = {
    StackName: baseline.importRequest.StackName,
    ChangeSetName: 'lcm-reviewed-retained-pitr1', ChangeSetType: 'UPDATE',
    Description: 'Enable PITR only for 13 imported tables; preserve buckets, Cognito and inactive shell',
    RoleARN: baseline.importRequest.RoleARN, Tags: structuredClone(baseline.importRequest.Tags),
    TemplateBody: JSON.stringify(template), ClientToken: 'lcm-retained-pitr1-b2b93cb0'
  };
  return { result: 'PITR_UPDATE_OFFLINE_NOT_AUTHORIZED', readyToApply: false, awsCallsMade: false,
    baselineTemplate: baseline.template, template, changes: structuredClone(baseline.deferredChanges), request,
    requestSha256: createHash('sha256').update(JSON.stringify(request)).digest('hex'),
    gates: ['Verify live imported baseline and drift before creating change set',
      'Require exactly 13 table modifications without replacement, no other resource changes',
      'Review ongoing PITR storage charges and separately authorize execution',
      'After execution verify PITR ENABLED on every table; no app deployment or IAM changes implied'] };
}

export function prepareRemainingUpdate(templateText, shellText) {
  const pitr = prepareRetainedPitrUpdate(templateText, shellText);
  const template = JSON.parse(templateText);
  template.Conditions = { ...template.Conditions, ...pitr.template.Conditions };
  template.Resources.RecoveryPlaceholder = structuredClone(pitr.template.Resources.RecoveryPlaceholder);
  for (const [id, resource] of Object.entries(pitr.template.Resources)) {
    if (JSON.stringify(template.Resources[id]) !== JSON.stringify(resource)) {
      throw new Error(`Existing PITR baseline would change: ${id}`);
    }
  }
  const additions = Object.entries(template.Resources).filter(([id]) => !pitr.template.Resources[id])
    .map(([logicalId, resource]) => ({ logicalId, type: resource.Type }));
  if (additions.length !== 24) throw new Error('Expected exactly 24 remaining resource definitions');
  return { result: 'REMAINING_UPDATE_OFFLINE_NOT_AUTHORIZED', readyToApply: false, awsCallsMade: false,
    template, additions, preservedDefinitions: Object.keys(pitr.template.Resources),
    request: { ...pitr.request, ChangeSetName: 'lcm-reviewed-remaining1',
      Description: 'Remaining reviewed application resources; preserve 16 imported resources, PITR and inactive shell',
      TemplateBody: JSON.stringify(template), ClientToken: 'lcm-remaining1-b2b93cb0', Capabilities: ['CAPABILITY_NAMED_IAM'] },
    gates: ['Compare current live template with verified PITR baseline before any request',
      'Resolve Logs tagged creation and audit remaining handler permissions before execution',
      'Review fresh change set, replacements, cost, IAM and public exposure; no automatic grant renewals',
      'Does not authorize first-user bootstrap, frontend upload or production acceptance'] };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const templateText = readFileSync(new URL('../cdk.out-review/LcmApplicationReview.template.json', import.meta.url), 'utf8');
  const plan = prepareRetainedImport(templateText);
  if (process.argv[2] === '--export-request' && process.argv.length === 3) {
    // Generated artifact only, exclusive create: never overwrite a reviewed request.
    const target = new URL('../../../.data/operator-application/create-retained-import1.json', import.meta.url);
    writeFileSync(target, `${JSON.stringify(plan.importRequest, null, 2)}\n`, { flag: 'wx', encoding: 'utf8' });
    process.stdout.write(`${JSON.stringify({ result: 'REQUEST_EXPORTED_NOT_SENT', requestSha256: plan.requestSha256, path: target.pathname })}\n`);
  } else if (process.argv[2] === '--export-shell-import' && process.argv.length === 3) {
    const shellText = readFileSync(new URL('../recovery-stack-shell.template.json', import.meta.url), 'utf8');
    const shellPlan = prepareShellImport(templateText, shellText);
    const target = new URL('../../../.data/operator-application/create-retained-import2.json', import.meta.url);
    writeFileSync(target, `${JSON.stringify(shellPlan.importRequest, null, 2)}\n`, { flag: 'wx', encoding: 'utf8' });
    process.stdout.write(`${JSON.stringify({ result: 'SHELL_IMPORT_EXPORTED_NOT_SENT', requestSha256: shellPlan.requestSha256 })}\n`);
  } else if (process.argv[2] === '--export-pitr-update' && process.argv.length === 3) {
    const shellText = readFileSync(new URL('../recovery-stack-shell.template.json', import.meta.url), 'utf8');
    const pitrPlan = prepareRetainedPitrUpdate(templateText, shellText);
    const target = new URL('../../../.data/operator-application/create-retained-pitr1.json', import.meta.url);
    writeFileSync(target, `${JSON.stringify(pitrPlan.request, null, 2)}\n`, { flag: 'wx', encoding: 'utf8' });
    process.stdout.write(`${JSON.stringify({ result: 'PITR_UPDATE_EXPORTED_NOT_SENT', requestSha256: pitrPlan.requestSha256 })}\n`);
  } else if (process.argv[2] === '--export-remaining-update' && process.argv.length === 3) {
    const shellText = readFileSync(new URL('../recovery-stack-shell.template.json', import.meta.url), 'utf8');
    const remaining = prepareRemainingUpdate(templateText, shellText);
    const target = new URL('../../../.data/operator-application/create-remaining1.json', import.meta.url);
    writeFileSync(target, `${JSON.stringify(remaining.request, null, 2)}\n`, { flag: 'wx', encoding: 'utf8' });
    process.stdout.write(`${JSON.stringify({ result: remaining.result, additions: remaining.additions, preservedDefinitions: remaining.preservedDefinitions.length })}\n`);
  } else if (process.argv.length === 2) {
    process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
  } else throw new Error('Only offline export options are supported; no AWS execution option');
}
