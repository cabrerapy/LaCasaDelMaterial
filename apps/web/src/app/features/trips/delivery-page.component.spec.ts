import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ɵresolveComponentResources as resolveComponentResources } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import type { DeliveryReceiptResponse, TripResponse } from '@lcm/contracts';
import { of, throwError } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PermissionService } from '../../core/permissions/permission.service';
import { DeliveryPageComponent } from './delivery-page.component';
import { TripsApiService } from './trips-api.service';
import { DeliveryStatusBadgeComponent } from './delivery-status-badge.component';

const trip: TripResponse = { id:'trip', tripNumber:'VIA-QA', truckId:'truck', driverId:'driver', truckLabel:'QA', driverName:'QA', originName:'Depósito', destinationName:'Cliente', destinationAddress:'Dirección QA', status:'DELIVERED', scheduledDate:'2026-10-04', freightChargeGuarani:0, createdAt:'2026-10-04', updatedAt:'2026-10-04' };
const delivery: DeliveryReceiptResponse = { id:'delivery', deliveryNumber:'ENT-QA', tripId:'trip', saleId:'sale', status:'CONFIRMED', outcome:'PARTIAL', receiverName:'Receptor QA', deliveryAddressSnapshot:'Dirección QA', createdAt:'2026-10-04', updatedAt:'2026-10-04', createdBy:'qa', updatedBy:'qa', lines:[{ id:'line', deliveryReceiptId:'delivery', tripId:'trip', tripLoadId:'load', tripLoadLineId:'load-line', saleId:'sale', saleItemId:'item', productId:'product', productSnapshot:{code:'QA', name:'Cemento QA', baseUnit:'UN', quantityScale:1}, loadedQuantityBaseInternal:120, deliveredQuantityBaseInternal:115, undeliveredQuantityBaseInternal:5, incidentType:'SHORTAGE', incidentNotes:'Faltan cinco unidades', createdAt:'2026-10-04', updatedAt:'2026-10-04' }] };

describe('Delivery read-only template', () => {
  afterEach(() => TestBed.resetTestingModule());
  it('keeps DRAFT neutral regardless of proposed outcome', () => {
    TestBed.configureTestingModule({imports:[DeliveryStatusBadgeComponent]});
    const fixture=TestBed.createComponent(DeliveryStatusBadgeComponent);
    vi.spyOn(fixture.componentInstance,'status').mockReturnValue('DRAFT');
    const proposed=vi.spyOn(fixture.componentInstance,'outcome');
    for(const outcome of ['FULL','PARTIAL','FAILED'] as const) {
      proposed.mockReturnValue(outcome);fixture.changeDetectorRef.markForCheck();fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('Borrador');
      expect(fixture.componentInstance.tone()).toBe('neutral');
      expect(fixture.componentInstance.icon()).toBe('●');
    }
  });
  it('renders exact small file size, download action and recoverable download error', async () => {
    await resolveComponentResources(url => Promise.resolve(readFileSync(resolve('src/app/features/trips',url),'utf8')));
    const evidence={id:'evidence',deliveryReceiptId:'delivery',type:'PHOTO' as const,originalFileName:'qa.png',mimeType:'image/png',sizeBytes:68,createdAt:'2026-10-09',createdBy:'qa'};
    const evidenceFile=vi.fn(()=>throwError(()=>new Error('Unavailable')));
    TestBed.configureTestingModule({imports:[DeliveryPageComponent],providers:[provideRouter([]),{provide:ActivatedRoute,useValue:{snapshot:{paramMap:convertToParamMap({id:'trip'})}}},{provide:PermissionService,useValue:{has:()=>true}},{provide:TripsApiService,useValue:{get:()=>of(trip),getDelivery:()=>of(delivery),evidence:()=>of([evidence]),evidenceFile}}]});
    TestBed.overrideComponent(DeliveryPageComponent,{set:{template:readFileSync(resolve('src/app/features/trips/delivery-page.component.html'),'utf8'),styles:[],templateUrl:undefined,styleUrl:undefined}});
    await TestBed.compileComponents();const fixture=TestBed.createComponent(DeliveryPageComponent);fixture.detectChanges();
    const component=fixture.componentInstance;
    expect(fixture.nativeElement.textContent).toContain('68 bytes · Cargada');
    expect(component.fileSize(1024)).toBe('1 KB');expect(component.fileSize(1048576)).toBe('1 MB');
    const button=(fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('[aria-label="Descargar qa.png"]');
    expect(button).not.toBeNull();button?.click();fixture.detectChanges();
    expect(evidenceFile).toHaveBeenCalledWith('evidence');expect(component.downloading()).toBe(false);
    expect(fixture.nativeElement.textContent).toContain('No se pudo descargar la evidencia');
  });
  for (const scenario of [
    {status:'CONFIRMED',outcome:'PARTIAL',delivered:115,missing:5},
    {status:'CONFIRMED',outcome:'FAILED',delivered:0,missing:120},
    {status:'VOIDED',outcome:'PARTIAL',delivered:115,missing:5},
    {status:'VOIDED',outcome:'FAILED',delivered:0,missing:120}
  ] as const) {
    const {status,outcome,delivered,missing}=scenario;
    it(`shows persisted quantities and navigation targets for ${status}/${outcome}`, async () => {
      await resolveComponentResources(url => Promise.resolve(readFileSync(resolve('src/app/features/trips',url),'utf8')));
      TestBed.configureTestingModule({ imports:[DeliveryPageComponent], providers:[provideRouter([]), {provide:ActivatedRoute,useValue:{snapshot:{paramMap:convertToParamMap({id:'trip'})}}}, {provide:PermissionService,useValue:{has:()=>false}}, {provide:TripsApiService,useValue:{get:()=>of(trip),getDelivery:()=>of({...delivery,status,outcome,lines:delivery.lines.map(line=>({...line,deliveredQuantityBaseInternal:delivered,undeliveredQuantityBaseInternal:missing}))}),evidence:()=>of([])}}] });
      TestBed.overrideComponent(DeliveryPageComponent,{set:{template:readFileSync(resolve('src/app/features/trips/delivery-page.component.html'),'utf8'),styles:[],templateUrl:undefined,styleUrl:undefined}});
      await TestBed.compileComponents();
      const fixture=TestBed.createComponent(DeliveryPageComponent);
      fixture.detectChanges();
      const root=fixture.nativeElement as HTMLElement;
      const materials=root.querySelector('#materials');
      expect(materials?.textContent).toContain('Cemento QA');
      expect(materials?.textContent).toContain('120 UN');
      expect(materials?.textContent).toContain(`${delivered} UN`);
      expect(materials?.textContent).toContain(`No entregado: ${missing} UN`);
      expect(materials?.textContent).toContain('Motivo: Faltante');
      expect(materials?.textContent).toContain('Faltan cinco unidades');
      for(const id of ['summary','materials','receiver','evidence']) expect(root.querySelector(`#${id}`)).not.toBeNull();
      expect(root.querySelector('input,select,textarea')).toBeNull();
      expect(root.textContent).not.toContain('Confirmar entrega');
    });
  }
});
