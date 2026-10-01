import type {LotCostBalance,SaleLotAllocation} from './costing.js';
export interface CostingRepository{
  getBalance(lotId:string):Promise<LotCostBalance|null>;putBalanceIfAbsent(balance:LotCostBalance):Promise<void>;
  openLots(productId:string):Promise<readonly LotCostBalance[]>;allocationsBySale(saleId:string):Promise<readonly SaleLotAllocation[]>;
  allocate(allocation:SaleLotAllocation,balance:LotCostBalance,expectedVersion:number):Promise<void>;
  reverseSale(saleId:string,actor:string,reason:string,at:string):Promise<void>;
  allBalances():Promise<readonly LotCostBalance[]>;allAllocations():Promise<readonly SaleLotAllocation[]>;
  replaceBalance(balance:LotCostBalance):Promise<void>;
}
export class CostingConflictError extends Error{}
