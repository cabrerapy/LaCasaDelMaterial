import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { loadConfig } from '../../config/environment.js';
import { createDynamoDbClient } from '../../infrastructure/dynamodb/client.js';
import { DynamoDbTripLoadRepository } from './infrastructure/dynamodb-trip-load.repository.js';
async function main(){const command=process.argv[2];if(!['backfill','rebuild','verify'].includes(command??''))throw new Error('Use backfill, rebuild o verify');const config=loadConfig(),repo=new DynamoDbTripLoadRepository(DynamoDBDocumentClient.from(createDynamoDbClient(config)),config.tripLoadsTableName);if(command==='backfill'||command==='rebuild'){await repo.rebuildBalances();console.log(`Trip load balances ${command} complete`);return;}const issues=await repo.verifyBalances();if(issues.length){console.error(issues.join('\n'));process.exitCode=1;}else console.log('Trip load balances verified');}
void main().catch((error:unknown)=>{console.error(error instanceof Error?error.message:'Trip load maintenance failed');process.exitCode=1;});
