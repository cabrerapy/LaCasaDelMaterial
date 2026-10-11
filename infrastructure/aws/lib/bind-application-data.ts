import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import type { Function } from 'aws-cdk-lib/aws-lambda';
import { DATA_SCHEMA, type ApplicationData, type DataTableName } from './application-data.js';

const ENV_KEYS: Record<DataTableName, string> = {
  users: 'USERS', categories: 'CATEGORIES', products: 'PRODUCTS', suppliers: 'SUPPLIERS',
  customers: 'CUSTOMERS', purchases: 'PURCHASES', inventory: 'INVENTORY', sales: 'SALES',
  costing: 'COSTING', cash: 'CASH', trucks: 'TRUCKS', drivers: 'DRIVERS', trips: 'TRIPS',
  tripLoads: 'TRIP_LOADS', fuel: 'FUEL', deliveries: 'DELIVERIES'
};

// Data plane only. Provisioning/migration permissions never enter the API role.
export function bindApplicationData(fn: Function, data: ApplicationData): void {
  const tables: string[] = [];
  const indexes: string[] = [];
  for (const name of Object.keys(DATA_SCHEMA) as DataTableName[]) {
    const table = data.tables[name];
    fn.addEnvironment(`DYNAMODB_${ENV_KEYS[name]}_TABLE`, table.tableName);
    tables.push(table.tableArn);
    for (const index of DATA_SCHEMA[name].indexes) indexes.push(`${table.tableArn}/index/${index[0]}`);
  }
  fn.addToRolePolicy(new PolicyStatement({
    actions: ['dynamodb:GetItem', 'dynamodb:BatchGetItem', 'dynamodb:PutItem', 'dynamodb:UpdateItem',
      'dynamodb:DeleteItem', 'dynamodb:ConditionCheckItem', 'dynamodb:Query', 'dynamodb:Scan'],
    resources: tables
  }));
  fn.addToRolePolicy(new PolicyStatement({ actions: ['dynamodb:Query', 'dynamodb:Scan'], resources: indexes }));
}
