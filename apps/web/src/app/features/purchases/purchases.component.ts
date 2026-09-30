import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { PURCHASE_STATUSES, type PurchaseResponse, type PurchaseStatus, type SupplierResponse } from '@lcm/contracts';
import { debounceTime, distinctUntilChanged, finalize } from 'rxjs';
import { PermissionService } from '../../core/permissions/permission.service';
import { GuaraniPipe } from '../../shared/guarani.pipe';
import { SuppliersApiService } from '../suppliers/suppliers-api.service';
import { PurchasesApiService } from './purchases-api.service';

type StatusFilter = 'ALL' | PurchaseStatus;
@Component({
  selector: 'lcm-purchases', imports: [ReactiveFormsModule, RouterLink, GuaraniPipe],
  templateUrl: './purchases.component.html', styleUrl: './purchases.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PurchasesComponent {
  private readonly api = inject(PurchasesApiService); private readonly suppliersApi = inject(SuppliersApiService);
  private readonly permissions = inject(PermissionService); private readonly fb = inject(NonNullableFormBuilder);
  readonly purchases = signal<readonly PurchaseResponse[]>([]); readonly suppliers = signal<readonly SupplierResponse[]>([]);
  readonly nextToken = signal<string | null>(null); readonly loading = signal(false); readonly errorMessage = signal<string | null>(null);
  readonly canCreate = this.permissions.has('purchases.create'); readonly canUpdate = this.permissions.has('purchases.update');
  readonly canReadCosts = this.permissions.has('purchases.costs.read');
  readonly statuses = PURCHASE_STATUSES;
  readonly statusLabels: Readonly<Record<PurchaseStatus, string>> = {
    DRAFT: 'Borrador', CONFIRMED: 'Confirmada', PARTIALLY_RECEIVED: 'Parcialmente recibida',
    RECEIVED: 'Recibida', CANCELLED: 'Cancelada'
  };
  readonly searchControl = this.fb.control(''); readonly supplierControl = this.fb.control('ALL');
  readonly statusControl = this.fb.control<StatusFilter>('ALL'); readonly dateFromControl = this.fb.control('');
  readonly dateToControl = this.fb.control('');
  constructor() {
    this.searchControl.valueChanges.pipe(debounceTime(350), distinctUntilChanged()).subscribe(() => this.load(true));
    [this.supplierControl, this.statusControl, this.dateFromControl, this.dateToControl]
      .forEach((control) => control.valueChanges.subscribe(() => this.load(true)));
    this.suppliersApi.list({ pageSize: 100, status: 'ACTIVE' }).subscribe({
      next: (page) => this.suppliers.set(page.items), error: () => this.errorMessage.set('Error al cargar proveedores.')
    });
    this.load(true);
  }
  load(reset = false): void {
    if (this.loading()) return; this.loading.set(true); this.errorMessage.set(null);
    const supplierId = this.supplierControl.value; const status = this.statusControl.value;
    this.api.list({
      pageSize: 25, ...(reset ? {} : { nextToken: this.nextToken() ?? undefined }),
      ...(this.searchControl.value.trim() ? { search: this.searchControl.value.trim() } : {}),
      ...(supplierId === 'ALL' ? {} : { supplierId }), ...(status === 'ALL' ? {} : { status }),
      ...(this.dateFromControl.value ? { dateFrom: this.dateFromControl.value } : {}),
      ...(this.dateToControl.value ? { dateTo: this.dateToControl.value } : {})
    }).pipe(finalize(() => this.loading.set(false))).subscribe({
      next: (page) => {
        this.purchases.set(reset ? page.items : [...this.purchases(), ...page.items]); this.nextToken.set(page.nextToken ?? null);
      }, error: () => this.errorMessage.set('Error al cargar compras.')
    });
  }
}
