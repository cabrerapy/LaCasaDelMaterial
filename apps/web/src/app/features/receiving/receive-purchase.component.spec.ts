import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import type { PurchaseReceiptResponse, PurchaseReceivingStatusResponse } from '@lcm/contracts';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReceivePurchaseComponent } from './receive-purchase.component';
import { ReceivingApiService } from './receiving-api.service';

const purchaseId = '4d80226d-15f4-419e-ae40-44e2b7561004';
const itemId = 'ecb751e9-a5a2-44c7-95f0-9ed03caac64c';
const status: PurchaseReceivingStatusResponse = { purchaseId, purchaseNumber: 'CMP-2026-ABCDEF12', status: 'PARTIALLY_RECEIVED', items: [{ purchaseItemId: itemId, productId: '469034f4-472d-466b-b8ad-ae63ff338773', presentationId: '9dbd315f-58b4-4930-922f-21af7e51ef3a', productSnapshot: { code: 'CEM', name: 'Cemento', baseUnit: 'BAG', quantityScale: 1 }, presentationSnapshot: { name: 'Bolsa', baseQuantityInternal: 1 }, orderedQuantityBaseInternal: 200, receivedQuantityBaseInternal: 120, pendingQuantityBaseInternal: 80, orderedQuantity: '200', receivedQuantity: '120', pendingQuantity: '80' }] };
const receipt = { id: 'f98f2241-c24a-4e54-9a18-667452660cee', receiptNumber: 'REC-2026-ABCDEF12', purchaseId, purchaseNumber: status.purchaseNumber, supplierId: '3ae577d3-c738-4b89-9db0-3daf2e511c40', supplierSnapshot: { businessName: 'Central' }, receiptDate: '2026-09-29', status: 'DRAFT', lines: [], createdAt: '2026-09-29T00:00:00.000Z', updatedAt: '2026-09-29T00:00:00.000Z', createdBy: 'user', updatedBy: 'user' } satisfies PurchaseReceiptResponse;

describe('ReceivePurchaseComponent', () => {
  const api = { status: vi.fn(), create: vi.fn(), confirm: vi.fn() }; const router = { navigate: vi.fn() };
  beforeEach(() => { vi.clearAllMocks(); api.status.mockReturnValue(of(status)); api.create.mockReturnValue(of(receipt)); api.confirm.mockReturnValue(of({ ...receipt, status: 'CONFIRMED' })); TestBed.configureTestingModule({ providers: [{ provide: ReceivingApiService, useValue: api }, { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => purchaseId } } } }, { provide: Router, useValue: router }] }); });
  function create(): ReceivePurchaseComponent { return TestBed.runInInjectionContext(() => new ReceivePurchaseComponent()); }
  it('loads ordered, received and pending quantities', () => { const component = create(); expect(component.status()?.items[0]?.pendingQuantity).toBe('80'); expect(component.lines.length).toBe(1); });
  it('rejects an empty receipt and saves a partial draft', () => { const component = create(); component.save(false); expect(api.create).not.toHaveBeenCalled(); component.lines.at(0).controls.receivedQuantity.setValue('80'); component.save(false); expect(api.create).toHaveBeenCalledWith(expect.objectContaining({ purchaseId, lines: [{ purchaseItemId: itemId, receivedQuantity: '80' }] })); });
  it('confirms immediately when requested', () => { const component = create(); component.lines.at(0).controls.receivedQuantity.setValue('80'); component.save(true); expect(api.confirm).toHaveBeenCalledWith(receipt.id); expect(router.navigate).toHaveBeenCalledWith(['/purchase-receipts', receipt.id]); });
});
