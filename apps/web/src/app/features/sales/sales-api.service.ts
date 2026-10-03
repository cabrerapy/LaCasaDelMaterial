import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { CreateSaleRequest, DeliveriesPageResponse, SaleCatalogResponse, SaleCostingResponse, SaleResponse, SalesPageResponse, SaleStatus, TripsPageResponse } from '@lcm/contracts';
@Injectable({providedIn:'root'}) export class SalesApiService{
 private readonly http=inject(HttpClient);
 catalog(search=''){return this.http.get<SaleCatalogResponse>('/api/sales/catalog',{params:search?new HttpParams().set('search',search):undefined});}
 list(filters:{search?:string;status?:SaleStatus}){let params=new HttpParams().set('pageSize',25);for(const [k,v] of Object.entries(filters))if(v)params=params.set(k,v);return this.http.get<SalesPageResponse>('/api/sales',{params});}
 get(id:string){return this.http.get<SaleResponse>(`/api/sales/${id}`);}
 create(value:CreateSaleRequest){return this.http.post<SaleResponse>('/api/sales',value);}
 confirm(id:string){return this.http.post<SaleResponse>(`/api/sales/${id}/confirm`,{});}
 void(id:string,reason:string){return this.http.post<SaleResponse>(`/api/sales/${id}/void`,{reason});}
 costing(id:string){return this.http.get<SaleCostingResponse>(`/api/sales/${id}/costing`);}
 retryCosting(id:string){return this.http.post<SaleResponse>(`/api/sales/${id}/retry-costing`,{});}
 trips(saleId:string){return this.http.get<TripsPageResponse>('/api/trips',{params:new HttpParams().set('saleId',saleId).set('pageSize',100)});}
 deliveries(saleId:string){return this.http.get<DeliveriesPageResponse>('/api/deliveries',{params:new HttpParams().set('saleId',saleId).set('pageSize',100)});}
}
