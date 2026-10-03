import type { SalePaymentMethod } from './sales.js';
export type DashboardAlertPriority='INFO'|'WARNING'|'CRITICAL';
export interface DashboardPeriod{readonly dateFrom:string;readonly dateTo:string;readonly timezone:string;}
export interface DashboardPaymentMethod{readonly method:SalePaymentMethod;readonly amountGuarani:number;readonly count:number;}
export interface DashboardSummaryResponse{
 readonly period:DashboardPeriod;
 readonly sales?:{readonly count:number;readonly grossGuarani:number;readonly discountsGuarani:number;readonly netGuarani:number;readonly averageTicketGuarani:number;readonly recent:readonly {id:string;number:string;customer:string;totalGuarani:number;status:string;createdAt:string}[];readonly costingComplete?:boolean;readonly fifoCostGuarani?:number;readonly grossMarginGuarani?:number;readonly grossMarginBps?:number};
 readonly payments?:{readonly totalGuarani:number;readonly methods:readonly DashboardPaymentMethod[];readonly transfers:readonly {label:string;amountGuarani:number;count:number}[]};
 readonly cash?:{readonly status:'OPEN'|'CLOSED';readonly openingCashGuarani:number;readonly expectedCashGuarani:number;readonly cashPaymentsGuarani:number;readonly manualInGuarani:number;readonly manualOutGuarani:number};
 readonly inventory?:{readonly tracked:number;readonly ok:number;readonly low:number;readonly out:number;readonly critical:readonly {productId:string;name:string;onHandInternal:number;minStockInternal:number;baseUnit:string;quantityScale:number}[]};
 readonly purchases?:{readonly count:number;readonly amountGuarani?:number;readonly pendingReceipt:number;readonly partialReceipt:number};
 readonly logistics?:{readonly scheduled:number;readonly ready:number;readonly inTransit:number;readonly delivered:number;readonly cancelled:number;readonly active:readonly {id:string;number:string;customer:string;destination:string;truck:string;status:string}[]};
 readonly deliveries?:{readonly full:number;readonly partial:number;readonly failed:number;readonly pending:number};
 readonly fuel?:{readonly litersMilli:number;readonly count:number;readonly costGuarani?:number};
 readonly alerts:readonly {type:string;priority:DashboardAlertPriority;message:string;link:string}[];
}
