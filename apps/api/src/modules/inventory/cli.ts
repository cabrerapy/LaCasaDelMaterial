import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { loadConfig } from '../../config/environment.js';
import { createDynamoDbClient } from '../../infrastructure/dynamodb/client.js';
import { ensureInventoryTable } from '../../infrastructure/dynamodb/inventory-table.js';
import { DynamoDbReceivingRepository } from '../receiving/infrastructure/dynamodb-receiving.repository.js';
import { DynamoDbInventoryRepository } from './infrastructure/dynamodb-inventory.repository.js';
import { InventoryMaintenance } from './application/inventory-maintenance.js';

async function main(): Promise<void> {
  loadEnv({ path: resolve(process.cwd(), '../../.env') });
  const config = loadConfig(); const client = createDynamoDbClient(config);
  const document = DynamoDBDocumentClient.from(client);
  const inventory = new DynamoDbInventoryRepository(document, config.inventoryTableName);
  const receipts = new DynamoDbReceivingRepository(document, config.purchasesTableName, inventory);
  const maintenance = new InventoryMaintenance(inventory, receipts);
  const action = process.argv[2];
  try {
    if (action === 'backfill' || action === 'rebuild') await ensureInventoryTable(client, config.inventoryTableName);
    const result = action === 'backfill' ? await maintenance.backfill() : action === 'rebuild' ? await maintenance.rebuild()
      : action === 'verify' ? { issues: await maintenance.verify() } : null;
    if (!result) throw new Error('Use backfill, rebuild o verify');
    console.log(JSON.stringify({ action, ...result }, null, 2));
    if (result.issues.length) process.exitCode = 1;
  } finally { client.destroy(); }
}
void main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : 'Error de inventario'); process.exitCode = 1; });
