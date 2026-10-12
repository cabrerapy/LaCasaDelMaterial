import type { BootstrapTarget } from './bootstrap-preflight.js';

export interface BootstrapResourceReader {
  table(name: string): Promise<{ arn?: string | undefined; status?: string | undefined;
    keySchema?: readonly { name: string; type: string }[] | undefined;
    attributes?: readonly { name: string; type: string }[] | undefined }>;
  pool(id: string): Promise<{ arn?: string | undefined; id?: string | undefined }>;
}

// Read-only guard, intentionally not called by a deploy or bootstrap entrypoint yet.
export async function checkBootstrapResources(target: BootstrapTarget, reader: BootstrapResourceReader): Promise<void> {
  if (!/^\d{12}$/.test(target.accountId) || target.region !== 'us-east-1' ||
    !/^us-east-1_[A-Za-z0-9]+$/.test(target.poolId) || !/^[A-Za-z0-9_.-]{3,255}$/.test(target.usersTable)) {
    throw new Error('Invalid bootstrap target');
  }
  const table = await reader.table(target.usersTable);
  if (table.arn !== `arn:aws:dynamodb:${target.region}:${target.accountId}:table/${target.usersTable}` ||
    table.status !== 'ACTIVE' || table.keySchema?.length !== 1 ||
    table.keySchema[0]?.name !== 'id' || table.keySchema[0]?.type !== 'HASH' ||
    table.attributes?.filter(attribute => attribute.name === 'id').length !== 1 ||
    !table.attributes.some(attribute => attribute.name === 'id' && attribute.type === 'S')) {
    throw new Error('Bootstrap Users table ownership/schema not verified');
  }
  const pool = await reader.pool(target.poolId);
  if (pool.id !== target.poolId || pool.arn !== `arn:aws:cognito-idp:${target.region}:${target.accountId}:userpool/${target.poolId}`) {
    throw new Error('Bootstrap Cognito pool ownership not verified');
  }
}
