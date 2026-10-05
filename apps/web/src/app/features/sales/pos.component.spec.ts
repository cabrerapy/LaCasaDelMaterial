import { TestBed } from '@angular/core/testing';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SaleCatalogItem } from '@lcm/contracts';
import { PermissionService } from '../../core/permissions/permission.service';
import { CashApiService } from '../cash/cash-api.service';
import { CustomersApiService } from '../customers/customers-api.service';
import { SalesApiService } from './sales-api.service';
import { PosComponent } from './pos.component';

const bag: SaleCatalogItem = { productId: 'cement', presentationId: 'bag', code: 'CEM', name: 'Cemento', presentationName: 'Bolsa', baseQuantityInternal: 1, baseUnit: 'BAG', quantityScale: 1, unitPriceGuarani: 65000, availableBaseInternal: 80, trackStock: true };
describe('POS confirmation guard', () => {
  const api = { catalog: vi.fn(), create: vi.fn(), confirm: vi.fn() };
  beforeEach(() => {
    vi.clearAllMocks();
    api.catalog.mockReturnValue(of({ items: [bag] }));
    api.create.mockReturnValue(of({ id: 'draft' }));
    TestBed.configureTestingModule({ providers: [
      { provide: SalesApiService, useValue: api },
      { provide: CustomersApiService, useValue: { list: () => of({ items: [] }) } },
      { provide: CashApiService, useValue: { current: () => of(null) } },
      { provide: Router, useValue: { navigate: vi.fn() } },
      { provide: PermissionService, useValue: { has: () => false } }
    ] });
  });
  it('does not even create a draft when confirmation exceeds stock', () => {
    const component = TestBed.runInInjectionContext(() => new PosComponent());
    component.add(bag);
    component.setQuantity(0, '81');
    component.save(true);
    expect(api.create).not.toHaveBeenCalled();
    expect(component.error()).toContain('Stock insuficiente');
    expect(component.saving()).toBe(false);
    component.setQuantity(0, '80');
    expect(component.stockWarning()).toBeNull();
  });
  it('allows insufficient-stock drafts without confirmation or reservation', () => {
    const component = TestBed.runInInjectionContext(() => new PosComponent());
    component.add(bag);
    component.setQuantity(0, '81');
    component.save(false);
    expect(api.create).toHaveBeenCalledOnce();
    expect(api.confirm).not.toHaveBeenCalled();
  });
  it('blocks invalid quantity for both draft and confirmation', () => {
    const component = TestBed.runInInjectionContext(() => new PosComponent());
    component.add(bag);
    component.setQuantity(0, '0');
    component.save(false);
    component.save(true);
    expect(api.create).not.toHaveBeenCalled();
  });
  it('renders an accessible warning and disables confirmation until corrected', async () => {
    TestBed.overrideComponent(PosComponent, { set: {
      template: readFileSync(resolve('src/app/features/sales/pos.component.html'), 'utf8'),
      templateUrl: undefined, styleUrls: [], styles: []
    } });
    await TestBed.compileComponents();
    const fixture = TestBed.createComponent(PosComponent);
    fixture.componentInstance.cashSession.set({ id: 'session', sessionNumber: 'QA' } as NonNullable<ReturnType<PosComponent['cashSession']>>);
    fixture.componentInstance.add(bag);
    fixture.componentInstance.setQuantity(0, '81');
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const confirm = Array.from(root.querySelectorAll('button')).find((button) => button.textContent?.includes('Confirmar venta'));
    expect(root.querySelector('[role="alert"]')?.textContent).toContain('Disponible: 80 BAG');
    expect(confirm?.disabled).toBe(true);
    fixture.componentInstance.setQuantity(0, '80');
    fixture.detectChanges();
    expect(root.querySelector('[role="alert"]')).toBeNull();
    expect(confirm?.disabled).toBe(false);
  });
});
