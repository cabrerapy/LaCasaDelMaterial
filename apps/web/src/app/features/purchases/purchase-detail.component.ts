import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormArray, NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import type {
  CreatePurchaseRequest, ProductResponse, PurchaseItemInput, PurchaseResponse, SupplierResponse, UpdatePurchaseRequest
} from '@lcm/contracts';
import { debounceTime, distinctUntilChanged, finalize } from 'rxjs';
import { PermissionService } from '../../core/permissions/permission.service';
import { GuaraniPipe } from '../../shared/guarani.pipe';
import { ProductsApiService } from '../products/products-api.service';
import { SuppliersApiService } from '../suppliers/suppliers-api.service';
import { PurchasesApiService } from './purchases-api.service';

@Component({
  selector: 'lcm-purchase-detail', imports: [ReactiveFormsModule, RouterLink, GuaraniPipe],
  templateUrl: './purchase-detail.component.html', styleUrl: './purchase-detail.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PurchaseDetailComponent {
  private readonly api = inject(PurchasesApiService); private readonly suppliersApi = inject(SuppliersApiService);
  private readonly productsApi = inject(ProductsApiService); private readonly permissions = inject(PermissionService);
  private readonly fb = inject(NonNullableFormBuilder); private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly purchaseId = this.route.snapshot.paramMap.get('id');
  readonly isNew = this.purchaseId === null;
  readonly editing = this.isNew || this.router.url.endsWith('/edit');
  readonly purchase = signal<PurchaseResponse | null>(null);
  readonly suppliers = signal<readonly SupplierResponse[]>([]); readonly products = signal<readonly ProductResponse[]>([]);
  readonly loading = signal(false); readonly saving = signal(false);
  readonly errorMessage = signal<string | null>(null); readonly successMessage = signal<string | null>(null);
  readonly confirmOpen = signal(false); readonly cancelOpen = signal(false);
  readonly canUpdate = this.permissions.has('purchases.update'); readonly canConfirm = this.permissions.has('purchases.confirm');
  readonly canCancel = this.permissions.has('purchases.cancel'); readonly canReadCosts = this.permissions.has('purchases.costs.read');
  readonly canReceive = this.permissions.has('receipts.create');
  readonly statusLabels = {
    DRAFT: 'Borrador', CONFIRMED: 'Confirmada', PARTIALLY_RECEIVED: 'Parcialmente recibida',
    RECEIVED: 'Recibida', CANCELLED: 'Cancelada'
  } satisfies Readonly<Record<PurchaseResponse['status'], string>>;
  readonly supplierSearchControl = this.fb.control(''); readonly productSearchControl = this.fb.control('');
  readonly cancelReasonControl = this.fb.control('', Validators.maxLength(500));
  readonly items = new FormArray([this.itemGroup()]);
  readonly form = this.fb.group({
    supplierId: ['', Validators.required], purchaseDate: [today(), Validators.required],
    expectedDeliveryDate: [''], supplierInvoiceNumber: ['', Validators.maxLength(100)],
    discountGuarani: [0, [Validators.required, Validators.min(0), Validators.pattern(/^\d+$/)]],
    additionalCostsGuarani: [0, [Validators.required, Validators.min(0), Validators.pattern(/^\d+$/)]],
    notes: ['', Validators.maxLength(1500)], items: this.items
  });
  constructor() {
    this.loadSuppliers(); this.loadProducts();
    this.supplierSearchControl.valueChanges.pipe(debounceTime(350), distinctUntilChanged()).subscribe(() => this.loadSuppliers());
    this.productSearchControl.valueChanges.pipe(debounceTime(350), distinctUntilChanged()).subscribe(() => this.loadProducts());
    if (this.purchaseId) this.loadPurchase(this.purchaseId);
  }
  loadPurchase(id: string): void {
    this.loading.set(true); this.api.get(id).pipe(finalize(() => this.loading.set(false))).subscribe({
      next: (purchase) => { this.purchase.set(purchase); this.fillForm(purchase); },
      error: () => this.errorMessage.set('No fue posible cargar la compra.')
    });
  }
  loadSuppliers(): void {
    this.suppliersApi.list({
      pageSize: 100, status: 'ACTIVE',
      ...(this.supplierSearchControl.value.trim() ? { search: this.supplierSearchControl.value.trim() } : {})
    }).subscribe({ next: (page) => this.suppliers.set(page.items) });
  }
  loadProducts(): void {
    this.productsApi.list({
      pageSize: 100, status: 'ACTIVE',
      ...(this.productSearchControl.value.trim() ? { search: this.productSearchControl.value.trim() } : {})
    }).subscribe({ next: (page) => this.products.set(page.items) });
  }
  addItem(): void { if (this.items.length < 10) this.items.push(this.itemGroup()); }
  removeItem(index: number): void { this.items.removeAt(index); }
  productChanged(index: number): void {
    const group = this.items.at(index); const product = this.productFor(group.controls.productId.value);
    const first = product?.presentations.find((item) => item.status === 'ACTIVE');
    group.controls.presentationId.setValue(first?.id ?? '');
  }
  productFor(id: string): ProductResponse | undefined { return this.products().find((item) => item.id === id); }
  presentationsFor(index: number) {
    return this.productFor(this.items.at(index).controls.productId.value)?.presentations
      .filter((item) => item.status === 'ACTIVE') ?? [];
  }
  lineSubtotal(index: number): number {
    const item = this.items.at(index).getRawValue(); const value = item.quantity * item.unitPurchasePriceGuarani;
    return Number.isSafeInteger(value) && value >= 0 ? value : 0;
  }
  subtotal(): number { return this.items.controls.reduce((total, _item, index) => total + this.lineSubtotal(index), 0); }
  total(): number {
    return Math.max(0, this.subtotal() - this.form.controls.discountGuarani.value + this.form.controls.additionalCostsGuarani.value);
  }
  save(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.saving.set(true); this.errorMessage.set(null); const raw = this.form.getRawValue();
    const items = raw.items.map((item, index): PurchaseItemInput => ({
      productId: item.productId, presentationId: item.presentationId, quantity: item.quantity,
      unitPurchasePriceGuarani: item.unitPurchasePriceGuarani,
      ...(item.notes.trim() ? { notes: item.notes } : {}), sortOrder: index * 10
    }));
    const common = {
      supplierId: raw.supplierId, purchaseDate: raw.purchaseDate,
      supplierInvoiceNumber: raw.supplierInvoiceNumber,
      discountGuarani: raw.discountGuarani, additionalCostsGuarani: raw.additionalCostsGuarani,
      notes: raw.notes, items
    };
    const request = this.purchaseId
      ? this.api.update(this.purchaseId, {
        ...common, expectedDeliveryDate: raw.expectedDeliveryDate || null
      } satisfies UpdatePurchaseRequest)
      : this.api.create({
        ...common, ...(raw.expectedDeliveryDate ? { expectedDeliveryDate: raw.expectedDeliveryDate } : {})
      } satisfies CreatePurchaseRequest);
    request.pipe(finalize(() => this.saving.set(false))).subscribe({
      next: (purchase) => { this.successMessage.set('Borrador guardado correctamente.'); void this.router.navigate(['/purchases', purchase.id]); },
      error: (error: { error?: { message?: string } }) => this.errorMessage.set(error.error?.message ?? 'No fue posible guardar la compra.')
    });
  }
  confirm(): void {
    if (!this.purchaseId) return; this.saving.set(true);
    this.api.confirm(this.purchaseId).pipe(finalize(() => this.saving.set(false))).subscribe({
      next: (purchase) => { this.purchase.set(purchase); this.confirmOpen.set(false); this.successMessage.set('Compra confirmada correctamente.'); },
      error: (error: { error?: { message?: string } }) => { this.confirmOpen.set(false); this.errorMessage.set(error.error?.message ?? 'No fue posible confirmar.'); }
    });
  }
  cancel(): void {
    if (!this.purchaseId) return; this.saving.set(true);
    this.api.cancel(this.purchaseId, {
      ...(this.cancelReasonControl.value.trim() ? { reason: this.cancelReasonControl.value } : {})
    }).pipe(finalize(() => this.saving.set(false))).subscribe({
      next: (purchase) => { this.purchase.set(purchase); this.cancelOpen.set(false); this.successMessage.set('Compra cancelada correctamente.'); },
      error: (error: { error?: { message?: string } }) => { this.cancelOpen.set(false); this.errorMessage.set(error.error?.message ?? 'No fue posible cancelar.'); }
    });
  }
  private fillForm(purchase: PurchaseResponse): void {
    this.items.clear(); purchase.items.forEach((item) => this.items.push(this.itemGroup({
      productId: item.productId, presentationId: item.presentationId, quantity: item.quantity,
      unitPurchasePriceGuarani: item.unitPurchasePriceGuarani ?? 0, notes: item.notes ?? ''
    })));
    if (purchase.items.length === 0) this.items.push(this.itemGroup());
    this.form.patchValue({
      supplierId: purchase.supplierId, purchaseDate: purchase.purchaseDate,
      expectedDeliveryDate: purchase.expectedDeliveryDate ?? '', supplierInvoiceNumber: purchase.supplierInvoiceNumber ?? '',
      discountGuarani: purchase.discountGuarani ?? 0, additionalCostsGuarani: purchase.additionalCostsGuarani ?? 0,
      notes: purchase.notes ?? ''
    });
  }
  private itemGroup(value?: {
    productId: string; presentationId: string; quantity: number; unitPurchasePriceGuarani: number; notes: string;
  }) {
    return this.fb.group({
      productId: [value?.productId ?? '', Validators.required],
      presentationId: [value?.presentationId ?? '', Validators.required],
      quantity: [value?.quantity ?? 1, [Validators.required, Validators.min(1), Validators.pattern(/^\d+$/)]],
      unitPurchasePriceGuarani: [value?.unitPurchasePriceGuarani ?? 0, [Validators.required, Validators.min(0), Validators.pattern(/^\d+$/)]],
      notes: [value?.notes ?? '', Validators.maxLength(500)]
    });
  }
}
function today(): string { return new Date().toISOString().slice(0, 10); }
