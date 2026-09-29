import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import type {
  CreateSupplierRequest, SupplierResponse, SupplierStatus, UpdateSupplierRequest
} from '@lcm/contracts';
import { debounceTime, distinctUntilChanged, finalize } from 'rxjs';
import { PermissionService } from '../../core/permissions/permission.service';
import { SuppliersApiService } from './suppliers-api.service';

type StatusFilter = 'ALL' | SupplierStatus;
type FormMode = 'create' | 'edit';
@Component({
  selector: 'lcm-suppliers', imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './suppliers.component.html', styleUrl: './suppliers.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SuppliersComponent {
  private readonly api = inject(SuppliersApiService);
  private readonly permissions = inject(PermissionService);
  private readonly fb = inject(NonNullableFormBuilder);
  readonly suppliers = signal<readonly SupplierResponse[]>([]);
  readonly nextToken = signal<string | null>(null);
  readonly loading = signal(false); readonly saving = signal(false);
  readonly errorMessage = signal<string | null>(null); readonly successMessage = signal<string | null>(null);
  readonly formMode = signal<FormMode | null>(null); readonly selectedId = signal<string | null>(null);
  readonly statusTarget = signal<SupplierResponse | null>(null);
  readonly canCreate = this.permissions.has('suppliers.create');
  readonly canUpdate = this.permissions.has('suppliers.update');
  readonly canDisable = this.permissions.has('suppliers.disable');
  readonly searchControl = this.fb.control('');
  readonly statusControl = this.fb.control<StatusFilter>('ACTIVE');
  readonly form = this.fb.group({
    businessName: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(180)]],
    tradeName: ['', Validators.maxLength(180)], taxId: ['', Validators.maxLength(40)],
    phone: ['', Validators.maxLength(50)], email: ['', [Validators.email, Validators.maxLength(254)]],
    address: ['', Validators.maxLength(300)], city: ['', Validators.maxLength(120)],
    notes: ['', Validators.maxLength(1500)]
  });
  constructor() {
    this.searchControl.valueChanges.pipe(debounceTime(350), distinctUntilChanged()).subscribe(() => this.load(true));
    this.statusControl.valueChanges.subscribe(() => this.load(true)); this.load(true);
  }
  load(reset = false): void {
    if (this.loading()) return; this.loading.set(true); this.errorMessage.set(null);
    const status = this.statusControl.value;
    this.api.list({
      pageSize: 25, ...(reset ? {} : { nextToken: this.nextToken() ?? undefined }),
      ...(status === 'ALL' ? {} : { status }),
      ...(this.searchControl.value.trim() ? { search: this.searchControl.value.trim() } : {})
    }).pipe(finalize(() => this.loading.set(false))).subscribe({
      next: (page) => {
        this.suppliers.set(reset ? page.items : [...this.suppliers(), ...page.items]);
        this.nextToken.set(page.nextToken ?? null);
      }, error: () => this.errorMessage.set('Error al cargar proveedores.')
    });
  }
  openCreate(): void {
    this.form.reset(emptyForm()); this.selectedId.set(null); this.formMode.set('create'); this.clearFeedback();
  }
  openEdit(supplier: SupplierResponse): void {
    this.form.reset({
      businessName: supplier.businessName, tradeName: supplier.tradeName ?? '', taxId: supplier.taxId ?? '',
      phone: supplier.phone ?? '', email: supplier.email ?? '', address: supplier.address ?? '',
      city: supplier.city ?? '', notes: supplier.notes ?? ''
    });
    this.selectedId.set(supplier.id); this.formMode.set('edit'); this.clearFeedback();
  }
  closeForm(): void { if (!this.saving()) this.formMode.set(null); }
  save(): void {
    if (this.form.invalid || !this.formMode()) { this.form.markAllAsTouched(); return; }
    this.saving.set(true); this.errorMessage.set(null);
    const raw = this.form.getRawValue();
    const editing = this.formMode() === 'edit';
    const createInput: CreateSupplierRequest = { businessName: raw.businessName, ...optionalInput(raw) };
    const updateInput: UpdateSupplierRequest = { ...raw };
    const request = editing
      ? this.api.update(this.selectedId() ?? '', updateInput)
      : this.api.create(createInput);
    request.pipe(finalize(() => this.saving.set(false))).subscribe({
      next: () => {
        this.formMode.set(null); this.successMessage.set(editing
          ? 'Proveedor actualizado correctamente.' : 'Proveedor creado correctamente.'); this.load(true);
      }, error: (error: { error?: { message?: string } }) =>
        this.errorMessage.set(error.error?.message ?? 'No fue posible guardar el proveedor.')
    });
  }
  requestStatusChange(supplier: SupplierResponse): void { this.statusTarget.set(supplier); this.clearFeedback(); }
  cancelStatusChange(): void { this.statusTarget.set(null); }
  confirmStatusChange(): void {
    const target = this.statusTarget(); if (!target) return;
    const status: SupplierStatus = target.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'; this.saving.set(true);
    this.api.updateStatus(target.id, status).pipe(finalize(() => this.saving.set(false))).subscribe({
      next: () => {
        this.statusTarget.set(null); this.successMessage.set(status === 'ACTIVE'
          ? 'Proveedor activado correctamente.' : 'Proveedor desactivado correctamente.'); this.load(true);
      }, error: (error: { error?: { message?: string } }) => {
        this.statusTarget.set(null); this.errorMessage.set(error.error?.message ?? 'No fue posible cambiar el estado.');
      }
    });
  }
  private clearFeedback(): void { this.errorMessage.set(null); this.successMessage.set(null); }
}
function emptyForm() {
  return { businessName: '', tradeName: '', taxId: '', phone: '', email: '', address: '', city: '', notes: '' };
}
function optionalInput(raw: ReturnType<typeof emptyForm>): Omit<CreateSupplierRequest, 'businessName'> {
  return {
    ...(raw.tradeName.trim() ? { tradeName: raw.tradeName } : {}),
    ...(raw.taxId.trim() ? { taxId: raw.taxId } : {}), ...(raw.phone.trim() ? { phone: raw.phone } : {}),
    ...(raw.email.trim() ? { email: raw.email } : {}), ...(raw.address.trim() ? { address: raw.address } : {}),
    ...(raw.city.trim() ? { city: raw.city } : {}), ...(raw.notes.trim() ? { notes: raw.notes } : {})
  };
}
