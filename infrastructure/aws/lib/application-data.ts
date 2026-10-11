import { RemovalPolicy } from 'aws-cdk-lib';
import { AttributeType, BillingMode, ProjectionType, Table, TableEncryption } from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

type Index = readonly [name: string, partition: string, sort?: string];
// Mirrors existing local table definitions; no new indexes or access patterns.
export const DATA_SCHEMA = {
  users: { partition: 'id', indexes: [['UsernameIndex', 'username'], ['EmailIndex', 'email']] },
  categories: { partition: 'pk', indexes: [] },
  products: { partition: 'pk', indexes: [] },
  suppliers: { partition: 'pk', indexes: [] },
  customers: { partition: 'pk', indexes: [] },
  purchases: { partition: 'pk', indexes: [
    ['PurchaseDateIndex', 'entityType', 'purchaseDateCreated'], ['SupplierDateIndex', 'supplierId', 'purchaseDateCreated'],
    ['StatusDateIndex', 'status', 'purchaseDateCreated'], ['PurchaseItemsIndex', 'purchaseId', 'itemSort'],
    ['RelationIndex', 'relationId', 'relationSort'], ['ProductDateIndex', 'productId', 'receivedDateCreated']
  ] },
  inventory: { partition: 'pk', indexes: [
    ['MovementDateIndex', 'entityType', 'chronology'], ['MovementProductIndex', 'productId', 'chronology'],
    ['MovementLotIndex', 'lotId', 'chronology'], ['MovementTypeIndex', 'type', 'chronology']
  ] },
  sales: { partition: 'pk', indexes: [['SaleDateIndex', 'datePk', 'dateSk']] },
  costing: { partition: 'pk', indexes: [
    ['OpenLotsIndex', 'openPartition', 'openSort'], ['SaleAllocationsIndex', 'saleId', 'allocSort']
  ] },
  cash: { partition: 'pk', indexes: [
    ['SessionDateIndex', 'entityType', 'openedAt'], ['SessionMovementsIndex', 'cashSessionId', 'occurredAt'],
    ['CashMovementDateIndex', 'movementDatePk', 'occurredAt']
  ] },
  trucks: { partition: 'pk', indexes: [] },
  drivers: { partition: 'pk', indexes: [] },
  trips: { partition: 'pk', indexes: [['TripDateIndex', 'datePk', 'dateSk']] },
  tripLoads: { partition: 'pk', indexes: [] },
  fuel: { partition: 'pk', indexes: [['FuelDateIndex', 'datePk', 'dateSk']] },
  deliveries: { partition: 'pk', indexes: [
    ['RelationIndex', 'relationPk', 'relationSk'], ['SaleIndex', 'salePk', 'dateSk'],
    ['DateIndex', 'datePk', 'dateSk'], ['StatusIndex', 'statusPk', 'statusSk']
  ] }
} as const satisfies Record<string, { partition: string; indexes: readonly Index[] }>;
export type DataTableName = keyof typeof DATA_SCHEMA;

// Candidate only: not wired to app.ts until complete application and approval gates.
export class ApplicationData extends Construct {
  readonly tables: Readonly<Record<DataTableName, Table>>;
  constructor(scope: Construct, id: string) {
    super(scope, id);
    const tables: Partial<Record<DataTableName, Table>> = {};
    for (const name of Object.keys(DATA_SCHEMA) as DataTableName[]) {
      const schema = DATA_SCHEMA[name];
      const table = new Table(this, name, {
        partitionKey: { name: schema.partition, type: AttributeType.STRING },
        billingMode: BillingMode.PAY_PER_REQUEST, encryption: TableEncryption.AWS_MANAGED,
        pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
        deletionProtection: true, removalPolicy: RemovalPolicy.RETAIN
      });
      for (const [indexName, partition, sort] of schema.indexes as readonly Index[]) {
        table.addGlobalSecondaryIndex({ indexName,
          partitionKey: { name: partition, type: AttributeType.STRING },
          ...(sort ? { sortKey: { name: sort, type: AttributeType.STRING } } : {}),
          projectionType: ProjectionType.ALL
        });
      }
      tables[name] = table;
    }
    this.tables = tables as Record<DataTableName, Table>;
  }
}
