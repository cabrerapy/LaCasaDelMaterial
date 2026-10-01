import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import type { CreateCustomerRequest, CustomerResponse, CustomerStatus, CustomerType, UpdateCustomerRequest } from '@lcm/contracts';
import { debounceTime, distinctUntilChanged, finalize } from 'rxjs';
import { PermissionService } from '../../core/permissions/permission.service';
import { CustomersApiService } from './customers-api.service';
@Component({ selector: 'lcm-customers', imports: [ReactiveFormsModule, RouterLink], templateUrl: './customers.component.html',
  styleUrl: '../suppliers/suppliers.component.css', changeDetection: ChangeDetectionStrategy.OnPush })
export class CustomersComponent {
  private readonly api = inject(CustomersApiService); private readonly fb = inject(NonNullableFormBuilder);
  private readonly permissions = inject(PermissionService);
  readonly items = signal<readonly CustomerResponse[]>([]); readonly nextToken = signal<string | null>(null);
  readonly loading = signal(false); readonly saving = signal(false); readonly error = signal<string | null>(null);
  readonly success = signal<string | null>(null); readonly mode = signal<'create' | 'edit' | null>(null);
  readonly selected = signal<CustomerResponse | null>(null); readonly statusTarget = signal<CustomerResponse | null>(null);
  readonly canCreate = this.permissions.has('customers.create'); readonly canUpdate = this.permissions.has('customers.update');
  readonly canDisable = this.permissions.has('customers.disable');
  readonly search = this.fb.control(''); readonly typeFilter = this.fb.control<'ALL' | CustomerType>('ALL');
  readonly statusFilter = this.fb.control<'ALL' | CustomerStatus>('ACTIVE');
  readonly form = this.fb.group({ type: this.fb.control<CustomerType>('PERSON'), firstName: ['', Validators.maxLength(120)],
    lastName: ['', Validators.maxLength(120)], businessName: ['', Validators.maxLength(180)], documentType: [''],
    documentNumber: ['', Validators.maxLength(60)], taxId: ['', Validators.maxLength(40)], phone: ['', Validators.maxLength(50)],
    email: ['', [Validators.email, Validators.maxLength(254)]], address: ['', Validators.maxLength(300)],
    city: ['', Validators.maxLength(120)], notes: ['', Validators.maxLength(1500)] });
  constructor() {
    this.search.valueChanges.pipe(debounceTime(350), distinctUntilChanged()).subscribe(() => this.load(true));
    this.typeFilter.valueChanges.subscribe(() => this.load(true)); this.statusFilter.valueChanges.subscribe(() => this.load(true)); this.load(true);
  }
  load(reset = false): void {
    if (this.loading()) return; this.loading.set(true); this.error.set(null);
    this.api.list({ pageSize: 25, ...(!reset && this.nextToken() ? { nextToken: this.nextToken()! } : {}),
      ...(this.search.value.trim() ? { search: this.search.value.trim() } : {}),
      ...(this.typeFilter.value === 'ALL' ? {} : { type: this.typeFilter.value }),
      ...(this.statusFilter.value === 'ALL' ? {} : { status: this.statusFilter.value }) })
      .pipe(finalize(() => this.loading.set(false))).subscribe({ next: (page) => {
        this.items.set(reset ? page.items : [...this.items(), ...page.items]); this.nextToken.set(page.nextToken ?? null);
      }, error: () => this.error.set('Error al cargar clientes.') });
  }
  openCreate(): void { this.form.reset(empty()); this.selected.set(null); this.mode.set('create'); this.clear(); }
  openEdit(c: CustomerResponse): void {
    this.form.reset({ type: c.type, firstName: c.firstName ?? '', lastName: c.lastName ?? '', businessName: c.businessName ?? '',
      documentType: c.documentType ?? '', documentNumber: c.documentNumber ?? '', taxId: c.taxId ?? '', phone: c.phone ?? '',
      email: c.email ?? '', address: c.address ?? '', city: c.city ?? '', notes: c.notes ?? '' });
    this.selected.set(c); this.mode.set('edit'); this.clear();
  }
  save(): void {
    const value = this.form.getRawValue();
    if (this.form.invalid || (value.type === 'PERSON' && !value.firstName.trim()) || (value.type === 'COMPANY' && !value.businessName.trim())) {
      this.form.markAllAsTouched(); this.error.set(value.type === 'PERSON' ? 'El nombre es obligatorio.' : 'La razón social es obligatoria.'); return;
    }
    const input = clean(value); const editing = this.mode() === 'edit'; if (editing) delete input['type']; this.saving.set(true);
    const request = editing ? this.api.update(this.selected()?.id ?? '', input as UpdateCustomerRequest)
      : this.api.create(input as unknown as CreateCustomerRequest);
    request.pipe(finalize(() => this.saving.set(false))).subscribe({ next: () => {
      this.mode.set(null); this.success.set(editing ? 'Cliente actualizado correctamente.' : 'Cliente creado correctamente.'); this.load(true);
    }, error: (e: { error?: { message?: string } }) => this.error.set(e.error?.message ?? 'No fue posible guardar el cliente.') });
  }
  requestStatus(c: CustomerResponse): void { this.statusTarget.set(c); this.clear(); }
  cancelStatus(): void { this.statusTarget.set(null); }
  confirmStatus(): void {
    const c = this.statusTarget(); if (!c) return; const status: CustomerStatus = c.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'; this.saving.set(true);
    this.api.status(c.id, status).pipe(finalize(() => this.saving.set(false))).subscribe({ next: () => {
      this.statusTarget.set(null); this.success.set(status === 'ACTIVE' ? 'Cliente activado correctamente.' : 'Cliente desactivado correctamente.'); this.load(true);
    }, error: () => this.error.set('No fue posible cambiar el estado.') });
  }
  close(): void { if (!this.saving()) this.mode.set(null); }
  private clear(): void { this.error.set(null); this.success.set(null); }
}
function empty() { return { type: 'PERSON' as CustomerType, firstName: '', lastName: '', businessName: '', documentType: '',
  documentNumber: '', taxId: '', phone: '', email: '', address: '', city: '', notes: '' }; }
function clean(value: ReturnType<typeof empty>): Record<string, string> {
  const result: Record<string, string> = { type: value.type };
  for (const [key, field] of Object.entries(value)) if (key !== 'type' && field.trim()) result[key] = field;
  return result;
}
