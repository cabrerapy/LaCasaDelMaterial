import { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, ScanCommand, TransactWriteCommand, type TransactWriteCommandInput } from '@aws-sdk/lib-dynamodb';
import type { CustomerListOptions, CustomerPage, CustomerRepository } from '../domain/customer.repository.js';
import { CustomerUniquenessError } from '../domain/customer.repository.js';
import type { Customer } from '../domain/customer.js';
const entity = 'CUSTOMER';
export class DynamoDbCustomerRepository implements CustomerRepository {
  constructor(private readonly client: DynamoDBDocumentClient, private readonly table: string) {}
  async findById(id: string) { const out = await this.client.send(new GetCommand({ TableName: this.table, Key: { pk: key(id) }, ConsistentRead: true })); return fromItem(out.Item); }
  async list(o: CustomerListOptions): Promise<CustomerPage> {
    const names: Record<string,string> = { '#entity':'entityType' }; const values: Record<string,unknown> = { ':entity':entity }; const filters=['#entity = :entity'];
    if (o.status) { names['#status']='status'; values[':status']=o.status; filters.push('#status = :status'); }
    if (o.type) { names['#customerType']='customerType'; values[':customerType']=o.type; filters.push('#customerType = :customerType'); }
    if (o.city) { names['#city']='normalizedCity'; values[':city']=o.city; filters.push('contains(#city, :city)'); }
    if (o.search) { names['#name']='normalizedDisplayName'; names['#document']='normalizedDocument'; names['#tax']='normalizedTaxId'; names['#phone']='normalizedPhone';
      values[':search']=o.search; values[':compact']=o.searchCompact??o.search; filters.push('(contains(#name,:search) OR contains(#document,:compact) OR contains(#tax,:compact) OR contains(#phone,:compact))'); }
    const out=await this.client.send(new ScanCommand({ TableName:this.table, Limit:o.limit, FilterExpression:filters.join(' AND '), ExpressionAttributeNames:names, ExpressionAttributeValues:values,
      ...(o.nextToken ? { ExclusiveStartKey: decode(o.nextToken) } : {}) }));
    return { items:(out.Items??[]).map(fromItem).filter((x):x is Customer=>!!x).sort((a,b)=>a.normalizedDisplayName.localeCompare(b.normalizedDisplayName)),
      ...(out.LastEvaluatedKey ? { nextToken:Buffer.from(JSON.stringify(out.LastEvaluatedKey),'utf8').toString('base64url') } : {}) };
  }
  async create(c: Customer) { try { await this.client.send(new TransactWriteCommand({ TransactItems:this.operations(c) })); } catch(e){ this.rethrow(e,c); } }
  async update(c: Customer, previous: Customer) {
    const operations: NonNullable<TransactWriteCommandInput['TransactItems']>=[{ Put:{ TableName:this.table, Item:item(c), ConditionExpression:'attribute_exists(pk)' } }];
    const oldDoc=docKey(previous), newDoc=docKey(c); if(newDoc!==oldDoc){ if(newDoc) operations.push(lock(newDoc,c.id,this.table)); if(oldDoc) operations.push({Delete:{TableName:this.table,Key:{pk:oldDoc}}}); }
    const oldTax=previous.taxId?taxKey(previous.taxId):undefined, newTax=c.taxId?taxKey(c.taxId):undefined; if(newTax!==oldTax){if(newTax) operations.push(lock(newTax,c.id,this.table));if(oldTax)operations.push({Delete:{TableName:this.table,Key:{pk:oldTax}}});}
    try { await this.client.send(new TransactWriteCommand({TransactItems:operations})); } catch(e){ this.rethrow(e,c); }
  }
  private operations(c:Customer): NonNullable<TransactWriteCommandInput['TransactItems']> { const out:NonNullable<TransactWriteCommandInput['TransactItems']>=[{Put:{TableName:this.table,Item:item(c),ConditionExpression:'attribute_not_exists(pk)'}}]; const d=docKey(c);if(d)out.push(lock(d,c.id,this.table));if(c.taxId)out.push(lock(taxKey(c.taxId),c.id,this.table));return out; }
  private rethrow(error:unknown,c:Customer):never { if(error instanceof TransactionCanceledException) throw new CustomerUniquenessError(c.taxId?'taxId':'document'); throw error; }
}
function key(id:string){return `CUSTOMER#${id}`;} function taxKey(v:string){return `TAX_ID#${v}`;}
function docKey(c:Customer){return c.documentType&&c.normalizedDocument?`DOCUMENT#${c.documentType}#${c.normalizedDocument}`:undefined;}
function lock(pk:string,id:string,table:string){return {Put:{TableName:table,Item:{pk,entityType:'CUSTOMER_UNIQUE',customerId:id},ConditionExpression:'attribute_not_exists(pk)'}};}
function item(c:Customer){return {pk:key(c.id),entityType:entity,customerType:c.type,normalizedTaxId:c.taxId?.toLocaleLowerCase('es')??'',...c};}
function fromItem(v:Record<string,unknown>|undefined):Customer|null{if(!v||v['entityType']!==entity)return null;const{pk:_p,entityType:_e,customerType:_t,normalizedTaxId:_n,...c}=v;void _p;void _e;void _t;void _n;return c as unknown as Customer;}
function decode(token:string):Record<string,unknown>{try{const v:unknown=JSON.parse(Buffer.from(token,'base64url').toString());if(!v||typeof v!=='object'||Array.isArray(v)||typeof(v as Record<string,unknown>)['pk']!=='string')throw 0;return v as Record<string,unknown>;}catch{throw Object.assign(new Error('Cursor inválido'),{statusCode:400});}}
