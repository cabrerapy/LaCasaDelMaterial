import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import type { PurchaseReceiptResponse } from '@lcm/contracts';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PermissionService } from '../../core/permissions/permission.service';
import { ReceiptDetailComponent } from './receipt-detail.component';
import { ReceivingApiService } from './receiving-api.service';

const receipt: PurchaseReceiptResponse = {
  id: 'receipt-qa', receiptNumber: 'REC-QA', purchaseId: 'purchase-qa', purchaseNumber: 'CMP-QA',
  supplierId: 'supplier-qa', supplierSnapshot: { businessName: 'Proveedor QA' }, receiptDate: '2026-10-07',
  status: 'CONFIRMED', createdAt: '2026-10-07T00:00:00.000Z', updatedAt: '2026-10-07T00:00:00.000Z',
  createdBy: 'qa', updatedBy: 'qa', lines: [{
    id: 'line-qa', receiptId: 'receipt-qa', purchaseId: 'purchase-qa', purchaseItemId: 'item-qa',
    productId: 'product-qa', presentationId: 'presentation-qa', receivedQuantityBaseInternal: 6,
    receivedQuantity: '6', directPurchaseCostGuarani: 336000,
    productSnapshot: { code: 'CEM-QA', name: 'Cemento QA', baseUnit: 'BAG', quantityScale: 1 },
    presentationSnapshot: { name: 'Bolsa QA', baseQuantityInternal: 1 }
  }]
};

describe('ReceiptDetailComponent', () => {
  const api = { receipt: vi.fn(), confirm: vi.fn(), cancel: vi.fn() };
  const permissions = { has: vi.fn() };
  beforeEach(() => {
    vi.clearAllMocks(); api.receipt.mockReturnValue(of(receipt)); permissions.has.mockReturnValue(true);
    TestBed.configureTestingModule({ imports: [ReceiptDetailComponent], providers: [
      provideRouter([]), { provide: ReceivingApiService, useValue: api },
      { provide: PermissionService, useValue: permissions },
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => receipt.id } } } }
    ] });
  });
  it.each([['CONFIRMED', 'Confirmada'], ['CANCELLED', 'Cancelada']] as const)
    ('renders %s translated without mutation controls', (status, label) => {
      api.receipt.mockReturnValue(of({ ...receipt, status }));
      const fixture = TestBed.createComponent(ReceiptDetailComponent); fixture.detectChanges();
      const root = fixture.nativeElement as HTMLElement;
      expect(root.querySelector('.status')?.textContent).toBe(label);
      expect(root.querySelector('.status')?.getAttribute('data-status')).toBe(status);
      expect(root.querySelector('article')?.textContent).toContain('6 Bolsa');
      expect(root.querySelectorAll('button,input,select,textarea')).toHaveLength(0);
      expect(api.confirm).not.toHaveBeenCalled(); expect(api.cancel).not.toHaveBeenCalled();
    });
  it('hides costs without permission even when response contains a cost', () => {
    permissions.has.mockReturnValue(false);
    const fixture = TestBed.createComponent(ReceiptDetailComponent); fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(permissions.has).toHaveBeenCalledWith('lots.costs.read');
    expect(root.querySelector('article')?.textContent).not.toContain('336');
    expect(root.querySelector('article')?.textContent).toContain('Cemento QA');
  });
  it('shows authorized costs and preserves links to receipt list and purchase', () => {
    const fixture = TestBed.createComponent(ReceiptDetailComponent); fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('article')?.textContent).toContain('336.000');
    expect([...root.querySelectorAll('a')].map(link => link.getAttribute('href')))
      .toEqual(['/purchase-receipts', '/purchases/purchase-qa']);
    expect(root.textContent).toContain('Sin documento');
    expect(api.receipt).toHaveBeenCalledWith(receipt.id);
  });
});
