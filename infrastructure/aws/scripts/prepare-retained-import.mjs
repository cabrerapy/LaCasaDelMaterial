import { readFileSync } from 'node:fs';
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
  return {
    result: 'RETAINED_IMPORT_OFFLINE_CANDIDATE_NOT_AUTHORIZED', readyToApply: false,
    awsCallsMade: false, sourceTemplateSha256: sha256,
    configurationComparisonComplete: false,
    knownBlockers: [
      'PITR baseline reflects audit only, not a fresh live snapshot; 13 enablements are deferred',
      'Failed stack still records retained resources; safe release and import eligibility not approved',
      'Remaining live properties and import permissions still require complete verification'
    ],
    failedStackArn: 'arn:aws:cloudformation:us-east-1:088668667831:stack/LcmApplicationReview/251bfa70-d0b3-11f1-bb97-0effeb39a9b5',
    template: { AWSTemplateFormatVersion: '2010-09-09', Resources }, resourcesToImport, deferredChanges,
    gates: [
      'Refresh exact live identifiers, ownership, properties and contents before any mutation',
      'Resolve observed PITR mismatch explicitly; import itself does not enable recovery',
      'Confirm identifiers against GetTemplateSummary and resource association before creating IMPORT change set',
      'Review safe release from failed stack separately; no stack/resource deletion is authorized here',
      'Review import permissions and execute only an explicitly approved IMPORT change set',
      'Run drift detection after import; compare configuration before adding remaining resources',
      'Resolve Logs tagged creation and refresh expired authority before subsequent deployment'
    ]
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const templateText = readFileSync(new URL('../cdk.out-review/LcmApplicationReview.template.json', import.meta.url), 'utf8');
  process.stdout.write(`${JSON.stringify(prepareRetainedImport(templateText), null, 2)}\n`);
}
