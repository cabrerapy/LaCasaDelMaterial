import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadProductionConfig } from './production-environment.js';

function environment(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { NODE_ENV: 'production', AUTH_MODE: 'cognito', AWS_REGION: 'us-east-1',
    COGNITO_USER_POOL_ID: 'us-east-1_Offline', COGNITO_CLIENT_ID: 'offlineclient', WEB_ORIGIN: 'https://app.example.invalid' };
  for (const table of ['USERS', 'CATEGORIES', 'PRODUCTS', 'SUPPLIERS', 'PURCHASES', 'INVENTORY', 'CUSTOMERS',
    'SALES', 'COSTING', 'CASH', 'TRUCKS', 'DRIVERS', 'TRIPS', 'TRIP_LOADS', 'FUEL', 'DELIVERIES']) {
    env[`DYNAMODB_${table}_TABLE`] = `offline-production-${table.toLowerCase()}`;
  }
  return env;
}
test('production config requires explicit Cognito and tables without local secrets', () => {
  const config = loadProductionConfig(environment());
  assert.equal(config.usersTableName, 'offline-production-users');
  assert.equal(config.cognitoPoolId, 'us-east-1_Offline');
  assert.equal('jwtSecret' in config, false);
  assert.equal('initialAdminPassword' in config, false);
});
test('rejects missing, local, insecure or mismatched production settings', () => {
  for (const patch of [{ AUTH_MODE: 'local' }, { DYNAMODB_USERS_TABLE: '' },
    { DYNAMODB_USERS_TABLE: 'lcm-qa-users' }, { DYNAMODB_ENDPOINT: 'http://localhost:8000' },
    { JWT_SECRET: 'forbidden' }, { INITIAL_ADMIN_PASSWORD: 'forbidden' },
    { WEB_ORIGIN: 'http://localhost:4200' }, { COGNITO_USER_POOL_ID: 'us-east-2_Offline' },
    { DYNAMODB_USERS_TABLE: 'offline-production-products' }]) {
    assert.throws(() => loadProductionConfig({ ...environment(), ...patch }));
  }
});
