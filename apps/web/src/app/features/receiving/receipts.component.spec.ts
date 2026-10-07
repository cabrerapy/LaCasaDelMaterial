import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { PurchaseReceiptResponse } from '@lcm/contracts';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReceiptsComponent } from './receipts.component';
import { ReceivingApiService } from './receiving-api.service';

const receipt = {
  id: 'f98f2241-c24a-4e54-9a18-667452660cee', receiptNumber: 'REC-2026-ABCDEF12',
  purchaseId: '4d80226d-15f4-419e-ae40-44e2b7561004', purchaseNumber: 'CMP-2026-ABCDEF12',
  supplierId: '3ae577d3-c738-4b89-9db0-3daf2e511c40', supplierSnapshot: { businessName: 'Central' },
  receiptDate: '2026-10-07', status: 'CONFIRMED', lines: [],
  createdAt: '2026-10-07T00:00:00.000Z', updatedAt: '2026-10-07T00:00:00.000Z',
  createdBy: 'qa', updatedBy: 'qa'
} satisfies PurchaseReceiptResponse;

describe('ReceiptsComponent', () => {
  const api = { receipts: vi.fn() };
  beforeEach(async () => {
    vi.clearAllMocks(); api.receipts.mockReturnValue(of({ items: [receipt] }));
    // JIT tests validate the real inline template; CSS layout is checked in the browser.
    TestBed.overrideComponent(ReceiptsComponent, { set: { styleUrl: undefined, styles: [] } });
    TestBed.configureTestingModule({ providers: [
      provideRouter([]), { provide: ReceivingApiService, useValue: api }
    ] });
    await TestBed.compileComponents();
  });
  it('loads a bounded page and forwards all selected filters', () => {
    const component = TestBed.runInInjectionContext(() => new ReceiptsComponent());
    expect(api.receipts).toHaveBeenCalledWith({ pageSize: 25, search: '', status: '', dateFrom: '', dateTo: '' });
    component.search = receipt.receiptNumber; component.status = 'CONFIRMED';
    component.dateFrom = '2026-10-01'; component.dateTo = '2026-10-07'; component.load();
    expect(api.receipts).toHaveBeenLastCalledWith({ pageSize: 25, search: receipt.receiptNumber,
      status: 'CONFIRMED', dateFrom: '2026-10-01', dateTo: '2026-10-07' });
  });
  it('renders associated filter labels and named detail links with mobile field labels', async () => {
    const fixture = TestBed.createComponent(ReceiptsComponent); fixture.detectChanges(); await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    expect([...root.querySelectorAll('.filters label')].map(label => label.childNodes[0]?.textContent?.trim()))
      .toEqual(['Buscar', 'Estado', 'Desde', 'Hasta']);
    expect(root.querySelectorAll('.filters label input, .filters label select')).toHaveLength(4);
    expect(root.querySelector('article')?.getAttribute('aria-label')).toBe(receipt.receiptNumber);
    expect([...root.querySelectorAll('article [data-label]')].map(field => field.getAttribute('data-label')))
      .toEqual(['Número', 'Fecha', 'Compra', 'Proveedor', 'Estado', 'Acciones']);
    const link = root.querySelector('article a');
    expect(link?.getAttribute('aria-label')).toBe(`Ver recepción ${receipt.receiptNumber}`);
    expect(link?.getAttribute('href')).toBe(`/purchase-receipts/${receipt.id}`);
    expect(root.querySelector('article')?.textContent).toContain('Confirmada');
  });
  it('renders an empty state without stale receipt actions', () => {
    api.receipts.mockReturnValue(of({ items: [] }));
    const fixture = TestBed.createComponent(ReceiptsComponent); fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('.empty')?.textContent).toBe('No hay recepciones.');
    expect(root.querySelectorAll('article')).toHaveLength(0);
    expect(root.querySelectorAll('a.button')).toHaveLength(0);
  });
  it('rejects an inverted date range without requesting the API', () => {
    const fixture = TestBed.createComponent(ReceiptsComponent); fixture.detectChanges();
    api.receipts.mockClear();
    fixture.componentInstance.dateFrom = '2026-10-07'; fixture.componentInstance.dateTo = '2026-10-06';
    fixture.componentInstance.load(); fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(api.receipts).not.toHaveBeenCalled();
    expect(root.querySelector('[role="alert"]')?.textContent).toContain('Desde no puede ser posterior a Hasta');
    expect(root.querySelectorAll('article')).toHaveLength(0);
    expect(root.querySelector('.empty')).toBeNull();
  });
  it('reports request failures, clears stale results and recovers on retry', () => {
    const fixture = TestBed.createComponent(ReceiptsComponent); fixture.detectChanges();
    api.receipts.mockReturnValue(throwError(() => new Error('Unavailable')));
    fixture.componentInstance.load(); fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[role="alert"]')?.textContent).toContain('No fue posible cargar');
    expect(root.querySelectorAll('article')).toHaveLength(0); expect(root.querySelector('.empty')).toBeNull();
    api.receipts.mockReturnValue(of({ items: [receipt] }));
    fixture.componentInstance.load(); fixture.detectChanges();
    expect(root.querySelector('[role="alert"]')).toBeNull();
    expect(root.querySelectorAll('article')).toHaveLength(1);
  });
});
