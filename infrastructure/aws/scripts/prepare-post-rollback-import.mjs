import { prepareRetainedPitrUpdate } from './prepare-retained-import.mjs';

/** Offline only; observed tables have PITR disabled and Logs has no retention. */
export function preparePostRollbackImport(sourceText, shellText) {
  const baseline = prepareRetainedPitrUpdate(sourceText, shellText);
  const source = JSON.parse(sourceText);
  const template = structuredClone(baseline.template);
  const resources = [
    ['Datadeliveries70FDB0EA', 'AWS::DynamoDB::Table', 'TableName', 'lcm-production-deliveries'],
    ['DatatripLoadsD9AA659F', 'AWS::DynamoDB::Table', 'TableName', 'lcm-production-trip-loads'],
    ['ApiLogsCD139AD4', 'AWS::Logs::LogGroup', 'LogGroupName', '/aws/lambda/lcm-production-api']
  ];
  const imports = resources.map(([id, type, key, name]) => {
    const resource = structuredClone(source.Resources[id]);
    if (resource?.Type !== type || resource.Properties[key] !== name ||
        resource.DeletionPolicy !== 'Retain' || resource.DependsOn ||
        /"(?:Ref|Fn::GetAtt|Fn::Sub|Fn::ImportValue)"/.test(JSON.stringify(resource))) {
      throw new Error(`Unexpected retained resource: ${id}`);
    }
    if (type === 'AWS::DynamoDB::Table') {
      resource.Properties.PointInTimeRecoverySpecification.PointInTimeRecoveryEnabled = false;
    } else delete resource.Properties.RetentionInDays;
    template.Resources[id] = resource;
    return { ResourceType: type, LogicalResourceId: id, ResourceIdentifier: { [key]: name } };
  });
  return { readyToApply: false, awsCallsMade: false, template,
    request: { ...baseline.request, ChangeSetType: 'IMPORT',
      ChangeSetName: 'lcm-reviewed-retained-import3', ClientToken: 'lcm-import3-b2b93cb0',
      Description: 'Import three retained remaining1 resources without configuration updates',
      TemplateBody: JSON.stringify(template), ResourcesToImport: imports },
    gates: ['Compare live baseline and complete retained resource properties',
      'Verify import identifiers using GetTemplateSummary',
      'Review change set with exactly three imports and separately approve execution',
      'Enable two PITR settings and seven-day log retention only in a later approved update'] };
}
