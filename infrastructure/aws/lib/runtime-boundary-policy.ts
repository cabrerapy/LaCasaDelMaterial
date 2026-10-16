import { DATA_SCHEMA, type DataTableName } from './application-data.js';

interface RuntimeBoundaryTarget {
  readonly account: string;
  readonly region: string;
  readonly tables: Readonly<Record<DataTableName, string>>;
  readonly evidenceBucket: string;
  readonly logGroup: string;
}

/** Offline policy document only. No SDK, resource creation or guessed physical names.
 * Names must be explicitly assigned in the reviewed application template first.
 */
export function runtimeBoundaryPolicy(target: RuntimeBoundaryTarget) {
  if (!/^\d{12}$/.test(target.account) || target.region !== 'us-east-1' ||
    !/^lcm-production-[a-z0-9-]{1,40}$/.test(target.evidenceBucket) ||
    !/^\/aws\/lambda\/lcm-production-[a-z0-9-]{1,80}$/.test(target.logGroup)) {
    throw new Error('Explicit bounded runtime resource names required');
  }
  const keys = Object.keys(DATA_SCHEMA) as DataTableName[];
  if (Object.keys(target.tables).length !== keys.length || new Set(Object.values(target.tables)).size !== keys.length ||
    keys.some(key => typeof target.tables[key] !== 'string' || !/^lcm-production-[a-z0-9-]{1,80}$/.test(target.tables[key]))) {
    throw new Error('Exactly sixteen distinct explicit LCM table names required');
  }
  const tables = keys.map(key => `arn:aws:dynamodb:${target.region}:${target.account}:table/${target.tables[key]}`);
  const indexes = keys.flatMap(key => DATA_SCHEMA[key].indexes.map(index =>
    `arn:aws:dynamodb:${target.region}:${target.account}:table/${target.tables[key]}/index/${index[0]}`));
  return { Version: '2012-10-17', Statement: [
    { Sid: 'RuntimeTableDataOnly', Effect: 'Allow', Action: ['dynamodb:GetItem', 'dynamodb:BatchGetItem',
      'dynamodb:PutItem', 'dynamodb:UpdateItem', 'dynamodb:DeleteItem', 'dynamodb:ConditionCheckItem',
      'dynamodb:Query', 'dynamodb:Scan'], Resource: tables },
    { Sid: 'RuntimeExactIndexesOnly', Effect: 'Allow', Action: ['dynamodb:Query', 'dynamodb:Scan'], Resource: indexes },
    { Sid: 'RuntimeDeliveryObjectsOnly', Effect: 'Allow', Action: ['s3:GetObject', 's3:PutObject'],
      Resource: [`arn:aws:s3:::${target.evidenceBucket}/deliveries/*`],
      Condition: { Bool: { 'aws:SecureTransport': 'true' } } },
    { Sid: 'RuntimeOwnLogStreamsOnly', Effect: 'Allow', Action: ['logs:CreateLogStream', 'logs:PutLogEvents'],
      Resource: [`arn:aws:logs:${target.region}:${target.account}:log-group:${target.logGroup}:log-stream:*`] }
  ] };
}
