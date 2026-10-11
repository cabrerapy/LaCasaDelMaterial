import type { AppConfig } from './environment.js';

export type ProductionConfig = Omit<AppConfig, 'host' | 'port' | 'dynamoDbEndpoint' | 'initialAdminPassword' |
  'jwtSecret' | 'jwtExpiresIn'> & { readonly cognitoPoolId: string; readonly cognitoClientId: string };
const TABLES = {
  usersTableName: 'USERS', categoriesTableName: 'CATEGORIES', productsTableName: 'PRODUCTS',
  suppliersTableName: 'SUPPLIERS', purchasesTableName: 'PURCHASES', inventoryTableName: 'INVENTORY',
  customersTableName: 'CUSTOMERS', salesTableName: 'SALES', costingTableName: 'COSTING', cashTableName: 'CASH',
  trucksTableName: 'TRUCKS', driversTableName: 'DRIVERS', tripsTableName: 'TRIPS', tripLoadsTableName: 'TRIP_LOADS',
  fuelTableName: 'FUEL', deliveriesTableName: 'DELIVERIES'
} as const;

// Separate loader: no dotenv, local fallback names, JWT signer or admin bootstrap password.
export function loadProductionConfig(env: NodeJS.ProcessEnv = process.env): ProductionConfig {
  if (env['NODE_ENV'] !== 'production' || env['AUTH_MODE'] !== 'cognito') throw new Error('Production requires Cognito');
  for (const key of ['DYNAMODB_ENDPOINT', 'JWT_SECRET', 'INITIAL_ADMIN_PASSWORD', 'AWS_ENDPOINT_URL', 'AWS_ENDPOINT_URL_DYNAMODB']) {
    if (env[key]?.trim()) throw new Error('Local configuration is not allowed in production');
  }
  const awsRegion = required(env, 'AWS_REGION');
  const cognitoPoolId = required(env, 'COGNITO_USER_POOL_ID');
  const cognitoClientId = required(env, 'COGNITO_CLIENT_ID');
  if (!/^[a-z]{2}-[a-z]+-\d$/.test(awsRegion) || !cognitoPoolId.startsWith(awsRegion + '_') ||
    !/^[a-z]{2}-[a-z]+-\d_[A-Za-z0-9]+$/.test(cognitoPoolId) || !/^[a-z0-9]+$/.test(cognitoClientId)) {
    throw new Error('Invalid Cognito region or identifiers');
  }
  const webOrigin = required(env, 'WEB_ORIGIN');
  const origin = new URL(webOrigin);
  if (origin.protocol !== 'https:' || origin.origin !== webOrigin) throw new Error('Production requires an HTTPS origin');
  const tables = {} as Record<keyof typeof TABLES, string>;
  for (const key of Object.keys(TABLES) as (keyof typeof TABLES)[]) {
    const name = required(env, `DYNAMODB_${TABLES[key]}_TABLE`);
    if (!/^[A-Za-z0-9_.-]{3,255}$/.test(name) || name.startsWith('lcm-local-') || name.startsWith('lcm-qa-')) {
      throw new Error('Invalid production table name');
    }
    tables[key] = name;
  }
  if (new Set(Object.values(tables)).size !== 16) throw new Error('Production tables must be distinct');
  const reportExportMaxRows = Number(env['REPORT_EXPORT_MAX_ROWS'] ?? '50000');
  if (!Number.isSafeInteger(reportExportMaxRows) || reportExportMaxRows < 1) throw new Error('Invalid export limit');
  return { ...tables, nodeEnv: 'production', awsRegion, webOrigin, reportExportMaxRows, cognitoPoolId, cognitoClientId };
}
function required(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key]?.trim();
  if (!value) throw new Error(`Missing production setting: ${key}`);
  return value;
}
