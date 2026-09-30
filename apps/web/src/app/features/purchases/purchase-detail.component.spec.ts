import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import type { ProductResponse, PurchaseResponse, SupplierResponse } from '@lcm/contracts';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PermissionService } from '../../core/permissions/permission.service';
import { ProductsApiService } from '../products/products-api.service';
import { SuppliersApiService } from '../suppliers/suppliers-api.service';
import { PurchaseDetailComponent } from './purchase-detail.component';
import { PurchasesApiService } from './purchases-api.service';

const supplier: SupplierResponse = {
  id: '3ae577d3-c738-4b89-9db0-3daf2e511c40', businessName: 'Distribuidora Central', status: 'ACTIVE',
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z'
};
const product: ProductResponse = {
  id: '469034f4-472d-466b-b8ad-ae63ff338773', code: 'CEM-CPII', name: 'Cemento CPII',
  category: { id: '413c7fd7-91a9-482b-92d2-31e755107dbd', name: 'Cemento' }, baseUnit: 'BAG',
  quantityScale: 1, minStock: 20, trackStock: true, status: 'ACTIVE',
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', presentations: [{
    id: '9dbd315f-58b4-4930-922f-21af7e51ef3a', productId: '469034f4-472d-466b-b8ad-ae63ff338773',
    name: 'Bolsa 50 kg', baseQuantity: 1, salePriceGuarani: 65000, isDefault: true, status: 'ACTIVE',
    sortOrder: 10, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z'
  }]
};
const purchase: PurchaseResponse = {
  id: '4d80226d-15f4-419e-ae40-44e2b7561004', purchaseNumber: 'CMP-2026-ABCDEF12', supplierId: supplier.id,
  supplierSnapshot: { businessName: supplier.businessName }, purchaseDate: '2026-09-29', status: 'DRAFT',
  items: [{
    id: 'ecb751e9-a5a2-44c7-95f0-9ed03caac64c', productId: product.id, presentationId: product.presentations[0]!.id,
    productSnapshot: { code: product.code, name: product.name, baseUnit: 'BAG', quantityScale: 1 },
    presentationSnapshot: { name: 'Bolsa 50 kg', baseQuantityInternal: 1 }, quantity: 200,
    quantityBaseInternal: 200, unitPurchasePriceGuarani: 52000, lineSubtotalGuarani: 10400000, sortOrder: 0
  }], subtotalGuarani: 10400000, discountGuarani: 0, additionalCostsGuarani: 150000, totalGuarani: 10550000,
  createdAt: '2026-09-29T00:00:00.000Z', updatedAt: '2026-09-29T00:00:00.000Z'
};

describe('PurchaseDetailComponent', () => {
  let routeId: string | null; const router = { url: '/purchases/new', navigate: vi.fn() };
  const route = { snapshot: { paramMap: { get: () => routeId } } };
  const api = { get: vi.fn(), create: vi.fn(), update: vi.fn(), confirm: vi.fn(), cancel: vi.fn() };
  const suppliersApi = { list: vi.fn() }; const productsApi = { list: vi.fn() }; const permissions = { has: vi.fn() };
  beforeEach(() => {
    vi.clearAllMocks(); routeId = null; router.url = '/purchases/new';
    suppliersApi.list.mockReturnValue(of({ items: [supplier] })); productsApi.list.mockReturnValue(of({ items: [product] }));
    api.get.mockReturnValue(of(purchase)); api.create.mockReturnValue(of(purchase)); api.update.mockReturnValue(of(purchase));
    api.confirm.mockReturnValue(of({ ...purchase, status: 'CONFIRMED' })); api.cancel.mockReturnValue(of({ ...purchase, status: 'CANCELLED' }));
    permissions.has.mockReturnValue(true);
    TestBed.configureTestingModule({ providers: [
      { provide: PurchasesApiService, useValue: api }, { provide: SuppliersApiService, useValue: suppliersApi },
      { provide: ProductsApiService, useValue: productsApi }, { provide: PermissionService, useValue: permissions },
      { provide: ActivatedRoute, useValue: route }, { provide: Router, useValue: router }
    ] });
  });
  function create(): PurchaseDetailComponent { return TestBed.runInInjectionContext(() => new PurchaseDetailComponent()); }
  it('loads active supplier and product selectors with bounded pages', () => {
    create(); expect(suppliersApi.list).toHaveBeenCalledWith({ pageSize: 100, status: 'ACTIVE' });
    expect(productsApi.list).toHaveBeenCalledWith({ pageSize: 100, status: 'ACTIVE' });
  });
  it('changes presentation with the selected product and calculates subtotal and total', () => {
    const component = create(); component.form.patchValue({ supplierId: supplier.id, additionalCostsGuarani: 150000 });
    component.items.at(0).patchValue({ productId: product.id, quantity: 200, unitPurchasePriceGuarani: 52000 });
    component.productChanged(0);
    expect(component.items.at(0).controls.presentationId.value).toBe(product.presentations[0]!.id);
    expect(component.lineSubtotal(0)).toBe(10400000); expect(component.total()).toBe(10550000);
  });
  it('saves a new DRAFT with backend identifiers only', () => {
    const component = create(); component.form.patchValue({ supplierId: supplier.id, purchaseDate: '2026-09-29' });
    component.items.at(0).patchValue({
      productId: product.id, presentationId: product.presentations[0]!.id, quantity: 200, unitPurchasePriceGuarani: 52000
    });
    component.save();
    expect(api.create).toHaveBeenCalledWith(expect.objectContaining({
      supplierId: supplier.id, items: [expect.objectContaining({ productId: product.id, quantity: 200 })]
    }));
    expect(router.navigate).toHaveBeenCalledWith(['/purchases', purchase.id]);
  });
  it('loads and edits a DRAFT', () => {
    routeId = purchase.id; router.url = `/purchases/${purchase.id}/edit`; const component = create();
    component.form.patchValue({ notes: 'Actualizada' }); component.save();
    expect(api.update).toHaveBeenCalledWith(purchase.id, expect.objectContaining({ notes: 'Actualizada' }));
  });
  it('confirms and cancels through explicit actions', () => {
    routeId = purchase.id; router.url = `/purchases/${purchase.id}`; const component = create();
    component.confirm(); expect(api.confirm).toHaveBeenCalledWith(purchase.id);
    component.cancelReasonControl.setValue('Proveedor sin entrega'); component.cancel();
    expect(api.cancel).toHaveBeenCalledWith(purchase.id, { reason: 'Proveedor sin entrega' });
  });
  it('derives cost visibility and actions from permissions', () => {
    permissions.has.mockImplementation((permission: string) => permission === 'purchases.read');
    routeId = purchase.id; router.url = `/purchases/${purchase.id}`; const component = create();
    expect(component.canReadCosts).toBe(false); expect(component.canUpdate).toBe(false);
    expect(component.canConfirm).toBe(false); expect(component.canCancel).toBe(false);
  });
});
