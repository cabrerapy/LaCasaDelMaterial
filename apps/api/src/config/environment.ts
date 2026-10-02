import 'dotenv/config';

export interface AppConfig {
  readonly nodeEnv: string;
  readonly host: string;
  readonly port: number;
  readonly awsRegion: string;
  readonly dynamoDbEndpoint?: string;
  readonly usersTableName: string;
  readonly categoriesTableName: string;
  readonly productsTableName: string;
  readonly suppliersTableName: string;
  readonly purchasesTableName: string;
  readonly inventoryTableName: string;
  readonly customersTableName: string;
  readonly salesTableName: string;
  readonly costingTableName: string;
  readonly cashTableName: string;
  readonly trucksTableName: string;
  readonly driversTableName: string;
  readonly tripsTableName: string;
  readonly tripLoadsTableName: string;
  readonly fuelTableName: string;
  readonly deliveriesTableName: string;
  readonly initialAdminPassword: string;
  readonly jwtSecret: string;
  readonly jwtExpiresIn: string;
  readonly webOrigin: string;
}

function readPort(value: string | undefined): number {
  const port = Number(value ?? '3000');
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('API_PORT must be an integer between 1 and 65535');
  }
  return port;
}

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): AppConfig {
  const endpoint = environment['DYNAMODB_ENDPOINT']?.trim();
  const initialAdminPassword = environment['INITIAL_ADMIN_PASSWORD']?.trim();
  const jwtSecret = environment['JWT_SECRET']?.trim();

  if (!initialAdminPassword || initialAdminPassword.length < 8) {
    throw new Error('INITIAL_ADMIN_PASSWORD must contain at least 8 characters');
  }
  if (!jwtSecret || jwtSecret.length < 32) {
    throw new Error('JWT_SECRET must contain at least 32 characters');
  }

  return {
    nodeEnv: environment['NODE_ENV']?.trim() || 'development',
    host: environment['API_HOST']?.trim() || '0.0.0.0',
    port: readPort(environment['API_PORT']),
    awsRegion: environment['AWS_REGION']?.trim() || 'us-east-1',
    ...(endpoint ? { dynamoDbEndpoint: endpoint } : {}),
    usersTableName: environment['DYNAMODB_USERS_TABLE']?.trim() || 'lcm-local-users',
    categoriesTableName: environment['DYNAMODB_CATEGORIES_TABLE']?.trim() || 'lcm-local-categories',
    productsTableName: environment['DYNAMODB_PRODUCTS_TABLE']?.trim() || 'lcm-local-products',
    suppliersTableName: environment['DYNAMODB_SUPPLIERS_TABLE']?.trim() || 'lcm-local-suppliers',
    purchasesTableName: environment['DYNAMODB_PURCHASES_TABLE']?.trim() || 'lcm-local-purchases',
    inventoryTableName: environment['DYNAMODB_INVENTORY_TABLE']?.trim() || 'lcm-local-inventory',
    customersTableName: environment['DYNAMODB_CUSTOMERS_TABLE']?.trim() || 'lcm-local-customers',
    salesTableName: environment['DYNAMODB_SALES_TABLE']?.trim() || 'lcm-local-sales',
    costingTableName: environment['DYNAMODB_COSTING_TABLE']?.trim() || 'lcm-local-costing',
    cashTableName: environment['DYNAMODB_CASH_TABLE']?.trim() || 'lcm-local-cash',
    trucksTableName: environment['DYNAMODB_TRUCKS_TABLE']?.trim() || 'lcm-local-trucks',
    driversTableName: environment['DYNAMODB_DRIVERS_TABLE']?.trim() || 'lcm-local-drivers',
    tripsTableName: environment['DYNAMODB_TRIPS_TABLE']?.trim() || 'lcm-local-trips',
    tripLoadsTableName: environment['DYNAMODB_TRIP_LOADS_TABLE']?.trim() || 'lcm-local-trip-loads',
    fuelTableName: environment['DYNAMODB_FUEL_TABLE']?.trim() || 'lcm-local-fuel',
    deliveriesTableName: environment['DYNAMODB_DELIVERIES_TABLE']?.trim() || 'lcm-local-deliveries',
    initialAdminPassword,
    jwtSecret,
    jwtExpiresIn: environment['JWT_EXPIRES_IN']?.trim() || '8h',
    webOrigin: environment['WEB_ORIGIN']?.trim() || 'http://localhost:4200'
  };
}
