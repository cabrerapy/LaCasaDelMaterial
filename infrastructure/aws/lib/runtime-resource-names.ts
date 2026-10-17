import { DATA_SCHEMA, type DataTableName } from './application-data.js';

/** Proposed physical names for the not-yet-deployed LCM production candidate. */
export function runtimeResourceNames(account: string, region: string) {
  if (!/^\d{12}$/.test(account) || region !== 'us-east-1') throw new Error('Explicit production account/us-east-1 required');
  const tables = Object.fromEntries(Object.keys(DATA_SCHEMA).map(key =>
    [key, `lcm-production-${key.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}`])) as Record<DataTableName, string>;
  return { account, region, tables, evidenceBucket: `lcm-production-evidence-${account}-${region}`,
    frontendBucket: `lcm-production-frontend-${account}-${region}`, logGroup: '/aws/lambda/lcm-production-api',
    functionName: 'lcm-production-api', apiName: 'lcm-production-api' };
}
