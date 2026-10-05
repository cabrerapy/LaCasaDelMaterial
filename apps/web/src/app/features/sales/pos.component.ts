import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import type { CustomerResponse, SaleCatalogItem, SaleDeliveryType, SalePaymentMethod } from '@lcm/contracts';
import { PermissionService } from '../../core/permissions/permission.service';
import { GuaraniPipe } from '../../shared/guarani.pipe';
import { CustomersApiService } from '../customers/customers-api.service';
import { SalesApiService } from './sales-api.service';
import { CashApiService } from '../cash/cash-api.service';
import type { CashSessionResponse } from '@lcm/contracts';
interface CartLine{readonly catalog:SaleCatalogItem;quantity:string}
@Component({selector:'lcm-pos',imports:[FormsModule,GuaraniPipe],templateUrl:'./pos.component.html',styleUrls:['./sales.css','./pos.component.css'],changeDetection:ChangeDetectionStrategy.OnPush})
export class PosComponent{
 private readonly api=inject(SalesApiService);private readonly customersApi=inject(CustomersApiService);private readonly cashApi=inject(CashApiService);private readonly router=inject(Router);private readonly permissions=inject(PermissionService);
 readonly cashSession=signal<CashSessionResponse|null>(null);readonly catalog=signal<readonly SaleCatalogItem[]>([]);readonly customers=signal<readonly CustomerResponse[]>([]);readonly cart=signal<readonly CartLine[]>([]);readonly saving=signal(false);readonly error=signal<string|null>(null);readonly canDiscount=this.permissions.has('sales.discount');
 search='';customerId='';discount=0;freight=0;deliveryType:SaleDeliveryType='PICKUP';deliveryAddress='';paymentMethod:SalePaymentMethod='CASH';paymentReference='';notes='';
 constructor(){this.cashApi.current().subscribe(s=>this.cashSession.set(s));this.loadCatalog();this.customersApi.list({pageSize:100,status:'ACTIVE'}).subscribe(p=>this.customers.set(p.items));}
 loadCatalog(){this.api.catalog(this.search.trim()).subscribe({next:r=>this.catalog.set(r.items),error:()=>this.error.set('No se pudo cargar el catálogo.')});}
 add(item:SaleCatalogItem){const existing=this.cart().find(l=>l.catalog.presentationId===item.presentationId);this.cart.set(existing?this.cart().map(l=>l===existing?{...l,quantity:String(Number(l.quantity)+1)}:l):[...this.cart(),{catalog:item,quantity:'1'}]);}
 setQuantity(index:number,value:string){this.cart.set(this.cart().map((l,i)=>i===index?{...l,quantity:value}:l));}
 remove(index:number){this.cart.set(this.cart().filter((_,i)=>i!==index));}
 subtotal(){return this.cart().reduce((sum,l)=>sum+l.catalog.unitPriceGuarani*Number(l.quantity||0),0);}
 total(){return this.subtotal()-Number(this.discount||0)+Number(this.freight||0);}
 save(confirm:boolean){if(!this.cart().length)return;this.saving.set(true);this.error.set(null);const body={...(this.customerId?{customerId:this.customerId}:{}),saleDate:new Date().toISOString().slice(0,10),items:this.cart().map(l=>({productId:l.catalog.productId,presentationId:l.catalog.presentationId,quantity:l.quantity})),discountGuarani:this.canDiscount?Number(this.discount):0,freightGuarani:Number(this.freight),deliveryType:this.deliveryType,...(this.deliveryType!=='PICKUP'?{deliveryAddress:this.deliveryAddress}:{}),paymentMethod:this.paymentMethod,...(this.paymentReference.trim()?{paymentReference:this.paymentReference.trim()}:{}),...(this.notes.trim()?{notes:this.notes.trim()}:{})};this.api.create(body).subscribe({next:sale=>{if(confirm)this.api.confirm(sale.id).subscribe({next:s=>void this.router.navigate(['/sales',s.id]),error:e=>this.fail(e)});else void this.router.navigate(['/sales',sale.id]);},error:e=>this.fail(e)});}
 private fail(e:{error?:{message?:string}}){this.error.set(e.error?.message??'No se pudo guardar la venta.');this.saving.set(false);}
}
