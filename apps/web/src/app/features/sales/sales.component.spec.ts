import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SaleResponse } from '@lcm/contracts';
import { PermissionService } from '../../core/permissions/permission.service';
import { SalesApiService } from './sales-api.service';
import { SalesComponent } from './sales.component';

const draft: SaleResponse = { id:'qa',saleNumber:'VTA-QA',status:'DRAFT',saleDate:'2026-10-05',items:[],subtotalGuarani:0,discountGuarani:0,freightGuarani:0,totalGuarani:0,deliveryType:'PICKUP',paymentMethod:'CASH',costingStatus:'NOT_APPLICABLE',createdAt:'2026-10-05',updatedAt:'2026-10-05',createdBy:'qa',updatedBy:'qa' };
describe('Resume sale draft', () => {
  const api = { get:vi.fn(), confirm:vi.fn() };
  beforeEach(() => { vi.resetAllMocks(); api.get.mockReturnValue(of(draft)); });
  function component(allowed = true) {
    TestBed.configureTestingModule({ providers:[
      {provide:SalesApiService,useValue:api},
      {provide:PermissionService,useValue:{has:(permission:string)=>allowed&&permission==='sales.confirm'}},
      {provide:ActivatedRoute,useValue:{snapshot:{paramMap:convertToParamMap({id:'qa'})}}}
    ] });
    return TestBed.runInInjectionContext(()=>new SalesComponent());
  }
  it('confirms existing draft without creating a new sale and refreshes detail', () => {
    const confirmed = {...draft,status:'CONFIRMED' as const};
    const c=component(); api.get.mockReturnValue(of(confirmed)); api.confirm.mockReturnValue(of(confirmed));
    c.confirmDraft(draft);
    expect(api.confirm).toHaveBeenCalledWith('qa');
    expect(c.selected()?.status).toBe('CONFIRMED'); expect(c.confirming()).toBe(false);
  });
  it('prevents double submission while request is pending', () => {
    const response=new Subject<SaleResponse>(); api.confirm.mockReturnValue(response);
    const c=component(); c.confirmDraft(draft); c.confirmDraft(draft);
    expect(api.confirm).toHaveBeenCalledOnce(); expect(c.confirming()).toBe(true);
    response.complete(); expect(c.confirming()).toBe(false);
  });
  it('does not confirm without permission or for confirmed status', () => {
    const c=component(false); c.confirmDraft(draft); expect(api.confirm).not.toHaveBeenCalled();
    TestBed.resetTestingModule(); component().confirmDraft({...draft,status:'CONFIRMED'});
    expect(api.confirm).not.toHaveBeenCalled();
  });
  it('preserves draft and shows backend rejection for closed cash or stock', () => {
    api.confirm.mockReturnValue(throwError(()=>({error:{message:'Caja cerrada'}})));
    const c=component(); c.confirmDraft(draft);
    expect(c.error()).toBe('Caja cerrada'); expect(c.selected()?.status).toBe('DRAFT'); expect(c.confirming()).toBe(false);
  });
});
