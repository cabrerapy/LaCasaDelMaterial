import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ɵresolveComponentResources as resolveComponentResources } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import type { DeliveryReceiptResponse, TripResponse } from '@lcm/contracts';
import { of } from 'rxjs';
import { afterEach, describe, expect, it } from 'vitest';
import { PermissionService } from '../../core/permissions/permission.service';
import { DeliveryPageComponent } from './delivery-page.component';
import { TripsApiService } from './trips-api.service';

const trip: TripResponse = { id:'trip', tripNumber:'VIA-QA', truckId:'truck', driverId:'driver', truckLabel:'QA', driverName:'QA', originName:'Depósito', destinationName:'Cliente', destinationAddress:'Dirección QA', status:'DELIVERED', scheduledDate:'2026-10-04', freightChargeGuarani:0, createdAt:'2026-10-04', updatedAt:'2026-10-04' };
const delivery: DeliveryReceiptResponse = { id:'delivery', deliveryNumber:'ENT-QA', tripId:'trip', saleId:'sale', status:'CONFIRMED', outcome:'PARTIAL', receiverName:'Receptor QA', deliveryAddressSnapshot:'Dirección QA', createdAt:'2026-10-04', updatedAt:'2026-10-04', createdBy:'qa', updatedBy:'qa', lines:[{ id:'line', deliveryReceiptId:'delivery', tripId:'trip', tripLoadId:'load', tripLoadLineId:'load-line', saleId:'sale', saleItemId:'item', productId:'product', productSnapshot:{code:'QA', name:'Cemento QA', baseUnit:'UN', quantityScale:1}, loadedQuantityBaseInternal:120, deliveredQuantityBaseInternal:115, undeliveredQuantityBaseInternal:5, incidentType:'SHORTAGE', incidentNotes:'Faltan cinco unidades', createdAt:'2026-10-04', updatedAt:'2026-10-04' }] };

describe('Delivery read-only template', () => {
  afterEach(() => TestBed.resetTestingModule());
  for (const status of ['CONFIRMED','VOIDED'] as const) {
    it(`shows persisted quantities and navigation targets for ${status}`, async () => {
      await resolveComponentResources(url => Promise.resolve(readFileSync(resolve('src/app/features/trips',url),'utf8')));
      TestBed.configureTestingModule({ imports:[DeliveryPageComponent], providers:[provideRouter([]), {provide:ActivatedRoute,useValue:{snapshot:{paramMap:convertToParamMap({id:'trip'})}}}, {provide:PermissionService,useValue:{has:()=>false}}, {provide:TripsApiService,useValue:{get:()=>of(trip),getDelivery:()=>of({...delivery,status}),evidence:()=>of([])}}] });
      TestBed.overrideComponent(DeliveryPageComponent,{set:{template:readFileSync(resolve('src/app/features/trips/delivery-page.component.html'),'utf8'),styles:[],templateUrl:undefined,styleUrl:undefined}});
      await TestBed.compileComponents();
      const fixture=TestBed.createComponent(DeliveryPageComponent);
      fixture.detectChanges();
      const root=fixture.nativeElement as HTMLElement;
      const materials=root.querySelector('#materials');
      expect(materials?.textContent).toContain('Cemento QA');
      expect(materials?.textContent).toContain('120 UN');
      expect(materials?.textContent).toContain('115 UN');
      expect(materials?.textContent).toContain('No entregado: 5 UN');
      expect(materials?.textContent).toContain('Motivo: Faltante');
      expect(materials?.textContent).toContain('Faltan cinco unidades');
      for(const id of ['summary','materials','receiver','evidence']) expect(root.querySelector(`#${id}`)).not.toBeNull();
      expect(root.querySelector('input,select,textarea')).toBeNull();
      expect(root.textContent).not.toContain('Confirmar entrega');
    });
  }
});
