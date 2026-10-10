import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import type { TripResponse } from '@lcm/contracts';
import { of, Subject, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { routes } from '../../app.routes';
import { DriversApiService } from '../drivers/drivers-api.service';
import { TrucksApiService } from '../trucks/trucks-api.service';
import { TripDetailComponent } from './trip-detail.component';
import { TripsApiService } from './trips-api.service';

const trip:TripResponse={id:'trip',tripNumber:'VIA-QA',truckId:'truck',driverId:'driver',truckLabel:'QA',driverName:'QA',originName:'Depósito',destinationName:'Obra',destinationAddress:'Dirección',status:'DRAFT',scheduledDate:'2026-10-04',freightChargeGuarani:0,createdAt:'2026-10-04',updatedAt:'2026-10-04'};
describe('Trip detail routes and actions',()=>{
  const api={get:vi.fn(),create:vi.fn(),update:vi.fn()};const trucks={list:vi.fn()};const drivers={list:vi.fn()};const router={navigate:vi.fn()};
  beforeEach(()=>{vi.resetAllMocks();api.get.mockReturnValue(of(trip));api.create.mockReturnValue(of(trip));api.update.mockReturnValue(of(trip));trucks.list.mockReturnValue(of({items:[]}));drivers.list.mockReturnValue(of({items:[]}));});
  afterEach(()=>TestBed.resetTestingModule());
  function component(path='trips/new'){
    TestBed.configureTestingModule({providers:[{provide:TripsApiService,useValue:api},{provide:TrucksApiService,useValue:trucks},{provide:DriversApiService,useValue:drivers},{provide:Router,useValue:router},{provide:ActivatedRoute,useValue:{snapshot:{routeConfig:{path},paramMap:convertToParamMap({id:'trip'}),queryParamMap:convertToParamMap({})}}}]});
    return TestBed.runInInjectionContext(()=>new TripDetailComponent());
  }
  it('registers protected create, edit and read routes',()=>{for(const [path,permission] of [['trips/new','trips.create'],['trips/:id/edit','trips.update'],['trips/:id','trips.read']])expect(routes.find(r=>r.path===path)?.data?.['permission']).toBe(permission);});
  it('creates a trimmed draft with integer guaranies',()=>{const c=component();c.form.patchValue({...trip,destinationName:' Obra ',freightChargeGuarani:120000});c.save();expect(api.create).toHaveBeenCalledWith(expect.objectContaining({destinationName:'Obra',freightChargeGuarani:120000}));expect(router.navigate).toHaveBeenCalledWith(['/trips']);});
  it('rejects empty fields, whitespace destinations, invalid UUID and fractional money',()=>{const c=component();c.save();c.form.patchValue({...trip,destinationName:' '});c.save();c.form.patchValue({destinationName:'Obra',saleId:'invalid'});c.save();c.form.patchValue({saleId:'',freightChargeGuarani:1.5});c.save();expect(api.create).not.toHaveBeenCalled();});
  for (const invalid of [
    {name:'invalid sale UUID',value:{saleId:'invalid'}},
    {name:'negative freight',value:{freightChargeGuarani:-1}},
    {name:'fractional freight',value:{freightChargeGuarani:1.5}},
    {name:'unsafe integer freight',value:{freightChargeGuarani:Number.MAX_SAFE_INTEGER+1}}
  ]) {
    it(`independently rejects ${invalid.name} without sending or navigating`,()=>{
      const c=component();c.form.patchValue({...trip,...invalid.value});c.save();
      expect(api.create).not.toHaveBeenCalled();expect(api.update).not.toHaveBeenCalled();
      expect(router.navigate).not.toHaveBeenCalled();expect(c.error()).toContain('entero no negativo');
      expect(c.saving()).toBe(false);expect(c.form.controls.freightChargeGuarani.touched).toBe(true);
    });
  }
  it('edits only the loaded draft',()=>{const c=component('trips/:id/edit');c.form.patchValue({destinationName:'Obra nueva'});c.save();expect(api.update).toHaveBeenCalledWith('trip',expect.objectContaining({destinationName:'Obra nueva'}));});
  it('keeps non-draft trips read-only without fetching catalogs',()=>{api.get.mockReturnValue(of({...trip,status:'DELIVERED'}));const c=component('trips/:id/edit');c.save();expect(c.readonly()).toBe(true);expect(trucks.list).not.toHaveBeenCalled();expect(api.update).not.toHaveBeenCalled();});
  it('keeps detail route read-only',()=>{const c=component('trips/:id');c.save();expect(c.readonly()).toBe(true);expect(api.update).not.toHaveBeenCalled();});
  it('reports request failure without navigating',()=>{api.create.mockReturnValue(throwError(()=>new Error('conflict')));const c=component();c.form.patchValue(trip);c.save();expect(c.error()).toContain('No se pudo guardar');expect(router.navigate).not.toHaveBeenCalled();expect(c.saving()).toBe(false);});
  it('prevents double submission while saving',()=>{const pending=new Subject<TripResponse>();api.create.mockReturnValue(pending);const c=component();c.form.patchValue(trip);c.save();c.save();expect(api.create).toHaveBeenCalledTimes(1);pending.next(trip);pending.complete();});
  it('loads additional catalog pages and excludes expired licenses',()=>{trucks.list.mockReturnValueOnce(of({items:[],nextToken:'next'})).mockReturnValueOnce(of({items:[{id:'truck'}]}));drivers.list.mockReturnValue(of({items:[{id:'driver',licenseExpired:true}]}));const c=component();c.moreTrucks();expect(trucks.list).toHaveBeenLastCalledWith({status:'ACTIVE',pageSize:100,nextToken:'next'});expect(c.trucks()).toEqual([{id:'truck'}]);expect(c.drivers()).toEqual([]);});
});
