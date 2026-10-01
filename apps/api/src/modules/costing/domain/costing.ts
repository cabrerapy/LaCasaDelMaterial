export interface LotCostBalance {
  readonly lotId:string;readonly lotNumber:string;readonly productId:string;readonly originalQuantityBaseInternal:number;
  readonly allocatedQuantityBaseInternal:number;readonly remainingQuantityBaseInternal:number;readonly allocatedCostGuarani:number;
  readonly totalCostGuarani:number;readonly receivedAt:string;readonly version:number;readonly updatedAt:string;
}
export interface SaleLotAllocation {
  readonly id:string;readonly saleId:string;readonly saleItemId:string;readonly productId:string;readonly lotId:string;readonly lotNumber:string;
  readonly quantityBaseInternal:number;readonly costGuarani:number;readonly lotReceivedAt:string;readonly status:'ACTIVE'|'REVERSED';
  readonly createdAt:string;readonly reversedAt?:string;readonly reversedBy?:string;readonly reversalReason?:string;
}
export function proportionalCost(totalCost:number,totalQuantity:number,previous:number,take:number):number{
  const next=previous+take;if(![totalCost,totalQuantity,previous,take,next].every(Number.isSafeInteger)||totalCost<0||totalQuantity<=0||previous<0||take<=0||next>totalQuantity)throw new Error('Parámetros de costo inválidos');
  const accumulated=(BigInt(totalCost)*BigInt(next))/BigInt(totalQuantity);const before=(BigInt(totalCost)*BigInt(previous))/BigInt(totalQuantity);return safeBigInt(accumulated-before);
}
export function proportionalShares(total:number,weights:readonly number[]):readonly number[]{if(!Number.isSafeInteger(total)||total<0||weights.some(w=>!Number.isSafeInteger(w)||w<0))throw new Error('Distribución inválida');const sum=weights.reduce((a,b)=>a+b,0);if(sum===0)return weights.map(()=>0);let previous=0;return weights.map(w=>{const next=previous+w;const share=safeBigInt((BigInt(total)*BigInt(next))/BigInt(sum)-(BigInt(total)*BigInt(previous))/BigInt(sum));previous=next;return share;});}
export function marginBps(profit:number,revenue:number):number|undefined{return revenue>0?safeBigInt((BigInt(profit)*10000n)/BigInt(revenue)):undefined;}
function safeBigInt(value:bigint):number{const number=Number(value);if(!Number.isSafeInteger(number))throw new Error('Resultado fuera del rango seguro');return number;}
