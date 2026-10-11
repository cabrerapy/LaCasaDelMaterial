import { prepareRuntimeConfigPublication, type RuntimeConfigPublication } from './runtime-config-publication.js';

// Review-only pipeline stage. It deliberately cannot construct an AWS publisher.
export function runtimeConfigPlan(outputs: unknown, input: unknown) {
  const target = parseTarget(input);
  const object = prepareRuntimeConfigPublication(outputs, target);
  const partition = target.region.startsWith('cn-') ? 'aws-cn' : 'aws';
  return {
    mode: 'REVIEW_ONLY', awsCalls: false, deploymentApproved: false,
    region: target.region, expectedAccount: target.expectedBucketOwner,
    publication: object,
    publisherPolicy: {
      Version: '2012-10-17',
      Statement: [{ Effect: 'Allow', Action: ['s3:PutObject'],
        Resource: [`arn:${partition}:s3:::${target.bucket}/runtime-config.json`],
        Condition: { Bool: { 'aws:SecureTransport': 'true' } }
      }]
    },
    pendingChecks: ['Real stack/bucket ownership and region', 'SDK credential profile and caller identity',
      'Readiness and complete cost review', 'Explicit deployment approval', 'Post-publication HTTPS smoke test']
  };
}

function parseTarget(value: unknown): RuntimeConfigPublication {
  const fields = ['bucket', 'expectedBucketOwner', 'region', 'frontendOrigin', 'stackName', 'outputKey'] as const;
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== fields.length) {
    throw new Error('Invalid publication target file');
  }
  const record = value as Record<string, unknown>;
  for (const key of fields) {
    if (!Object.hasOwn(record, key) || typeof record[key] !== 'string' || !record[key].trim()) {
      throw new Error('Invalid publication target file');
    }
  }
  // All six fields are checked above; no defaults or credentials are accepted.
  return value as RuntimeConfigPublication;
}
