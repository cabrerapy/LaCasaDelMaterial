import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { DeleteTableCommand, DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { ensureCostingTable } from '../../infrastructure/dynamodb/costing-table.js';
import type { ReceivingRepository } from '../receiving/domain/receiving.repository.js';
import type { PurchaseLot } from '../receiving/domain/receiving.js';
import type { Sale } from '../sales/domain/sale.js';
import { InMemorySaleRepository } from '../sales/infrastructure/in-memory-sale.repository.js';
import { InMemoryInventoryRepository } from '../inventory/infrastructure/in-memory-inventory.repository.js';
import { FifoCostingService } from './application/fifo-costing.service.js';
import { DynamoDbCostingRepository } from './infrastructure/dynamodb-costing.repository.js';

test('real DynamoDB: FIFO same-day chronology includes lots beyond the first index page',async()=>{
  assert.equal(process.env['DYNAMODB_TEST_ENDPOINT'],'http://localhost:8000');
  const client=new DynamoDBClient({endpoint:'http://localhost:8000',region:'us-east-1',credentials:{accessKeyId:'local',secretAccessKey:'local'}});
  const table=`lcm-test-fifo-${randomUUID()}`;
  try{
    await ensureCostingTable(client,table);
    const repository=new DynamoDbCostingRepository(DynamoDBDocumentClient.from(client),table);
    const productSnapshot={code:'QA',name:'Cemento QA',baseUnit:'BAG' as const,quantityScale:1};
    const presentationSnapshot={name:'Bolsa',baseQuantityInternal:1};
    const lots:PurchaseLot[]=Array.from({length:101},(_,index)=>({id:`lot-${index}`,lotNumber:index===100?'Z-OLDEST':`A-${String(index).padStart(3,'0')}`,purchaseId:'purchase',purchaseNumber:'P',purchaseItemId:'item',receiptId:'receipt',receiptNumber:'R',receiptLineId:`line-${index}`,supplierId:'supplier',productId:'product',presentationId:'presentation',receivedQuantityBaseInternal:100,directPurchaseCostGuarani:index===100?5_000_000:5_500_000,productSnapshot,presentationSnapshot,supplierSnapshot:{businessName:'QA'},receivedAt:'2026-10-04',createdAt:index===100?'2026-10-04T12:00:00.000Z':'2026-10-04T12:01:00.000Z',createdBy:'qa'}));
    const receiving={listLots:async()=>({items:lots})} as unknown as ReceivingRepository;
    const sales=new InMemorySaleRepository(new InMemoryInventoryRepository());
    const sale:Sale={id:'sale',saleNumber:'VTA-QA',status:'CONFIRMED',saleDate:'2026-10-04',items:[{id:'item',productId:'product',presentationId:'presentation',productSnapshot,presentationSnapshot,quantity:'120',quantityBaseInternal:120,unitPriceGuarani:65000,lineSubtotalGuarani:7800000,sortOrder:0,trackStock:true}],subtotalGuarani:7800000,discountGuarani:0,freightGuarani:0,totalGuarani:7800000,deliveryType:'PICKUP',paymentMethod:'CASH',costingStatus:'PENDING',createdAt:'2026-10-04',updatedAt:'2026-10-04',createdBy:'qa',updatedBy:'qa'};
    await sales.create(sale);
    const service=new FifoCostingService(repository,receiving,sales);
    const result=await service.costSale(sale.id);
    assert.equal(result.directCogsGuarani,6100000);
    assert.equal((await repository.getBalance('lot-100'))?.remainingQuantityBaseInternal,0);
    assert.equal((await repository.openLots('product')).length,100);
    assert.equal((await repository.allocationsBySale('sale')).length,2);
    await service.costSale(sale.id);
    assert.equal((await repository.allocationsBySale('sale')).length,2);
  }finally{await client.send(new DeleteTableCommand({TableName:table}));client.destroy();}
});
