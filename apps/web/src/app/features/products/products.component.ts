import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormArray, NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  BASE_UNITS,
  BASE_UNIT_LABELS,
  type BaseUnit,
  type CreateProductPresentationRequest,
  type CreateProductRequest,
  type ProductCategoryResponse,
  type ProductResponse,
  type ProductStatus
} from '@lcm/contracts';
import { concatMap, debounceTime, distinctUntilChanged, finalize, from, of, switchMap, toArray } from 'rxjs';
import { PermissionService } from '../../core/permissions/permission.service';
import { CategoriesApiService } from '../categories/categories-api.service';
import { GuaraniPipe } from '../../shared/guarani.pipe';
import { displayToInternal } from '../../shared/quantity';
import { ProductsApiService } from './products-api.service';

type StatusFilter = 'ALL' | ProductStatus;
type FormMode = 'create' | 'edit';

@Component({
  selector: 'lcm-products',
  imports: [ReactiveFormsModule, RouterLink, GuaraniPipe],
  templateUrl: './products.component.html',
  styleUrl: './products.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProductsComponent {
  private readonly api = inject(ProductsApiService);
  private readonly categoriesApi = inject(CategoriesApiService);
  private readonly permissions = inject(PermissionService);
  private readonly fb = inject(NonNullableFormBuilder);

  readonly products = signal<readonly ProductResponse[]>([]);
  readonly categories = signal<readonly ProductCategoryResponse[]>([]);
  readonly nextToken = signal<string | null>(null);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);
  readonly formMode = signal<FormMode | null>(null);
  readonly selectedProduct = signal<ProductResponse | null>(null);
  readonly statusTarget = signal<ProductResponse | null>(null);
  readonly baseUnits = BASE_UNITS;
  readonly unitLabels = BASE_UNIT_LABELS;
  readonly canCreate = this.permissions.has('products.create');
  readonly canUpdate = this.permissions.has('products.update');
  readonly canDisable = this.permissions.has('products.disable');
  readonly canManagePrices = this.permissions.has('products.prices.manage');
  readonly searchControl = this.fb.control('');
  readonly categoryControl = this.fb.control('ALL');
  readonly statusControl = this.fb.control<StatusFilter>('ACTIVE');
  readonly presentations = new FormArray([this.presentationGroup()]);
  readonly form = this.fb.group({
    code: ['', [Validators.required, Validators.maxLength(50), Validators.pattern(/^[A-Za-z0-9_-]+$/)]],
    name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(150)]],
    categoryId: ['', Validators.required], description: ['', Validators.maxLength(1000)],
    baseUnit: this.fb.control<BaseUnit>('UNIT'),
    quantityScale: [1, [Validators.required, Validators.min(1), Validators.pattern(/^\d+$/)]],
    minStock: [0, [Validators.required, Validators.min(0)]], trackStock: [true],
    presentations: this.presentations
  });

  constructor() {
    this.searchControl.valueChanges.pipe(debounceTime(350), distinctUntilChanged()).subscribe(() => this.load(true));
    this.categoryControl.valueChanges.subscribe(() => this.load(true));
    this.statusControl.valueChanges.subscribe(() => this.load(true));
    this.categoriesApi.list({ pageSize: 100, status: 'ACTIVE' }).subscribe({
      next: (page) => this.categories.set(page.items),
      error: () => this.errorMessage.set('No fue posible cargar las categorías.')
    });
    this.load(true);
  }

  load(reset = false): void {
    if (this.loading()) return;
    this.loading.set(true); this.errorMessage.set(null);
    const status = this.statusControl.value;
    const categoryId = this.categoryControl.value;
    this.api.list({
      pageSize: 25, ...(reset ? {} : { nextToken: this.nextToken() ?? undefined }),
      ...(status === 'ALL' ? {} : { status }),
      ...(categoryId === 'ALL' ? {} : { categoryId }),
      ...(this.searchControl.value.trim() ? { search: this.searchControl.value.trim() } : {})
    }).pipe(finalize(() => this.loading.set(false))).subscribe({
      next: (page) => {
        this.products.set(reset ? page.items : [...this.products(), ...page.items]);
        this.nextToken.set(page.nextToken ?? null);
      },
      error: () => this.errorMessage.set('No fue posible cargar los productos.')
    });
  }

  openCreate(): void {
    this.selectedProduct.set(null); this.presentations.clear(); this.presentations.push(this.presentationGroup(true));
    this.form.reset({ code: '', name: '', categoryId: '', description: '', baseUnit: 'UNIT', quantityScale: 1, minStock: 0, trackStock: true });
    this.form.controls.code.enable(); this.form.controls.baseUnit.enable(); this.form.controls.quantityScale.enable();
    this.formMode.set('create'); this.clearFeedback();
  }
  openEdit(product: ProductResponse): void {
    this.selectedProduct.set(product); this.presentations.clear();
    product.presentations.forEach((item) => this.presentations.push(this.presentationGroup(item.isDefault, item)));
    this.form.reset({
      code: product.code, name: product.name, categoryId: product.category.id,
      description: product.description ?? '', baseUnit: product.baseUnit,
      quantityScale: product.quantityScale, minStock: product.minStock, trackStock: product.trackStock
    });
    this.form.controls.code.disable(); this.form.controls.baseUnit.disable(); this.form.controls.quantityScale.disable();
    this.formMode.set('edit'); this.clearFeedback();
  }
  closeForm(): void { if (!this.saving()) this.formMode.set(null); }
  addPresentation(): void {
    if (this.presentations.length < 7) this.presentations.push(this.presentationGroup(false));
  }
  removePresentation(index: number): void {
    if (this.presentations.length <= 1) return;
    this.presentations.removeAt(index);
    if (!this.presentations.controls.some((control) => control.controls.isDefault.value)) {
      this.presentations.at(0).controls.isDefault.setValue(true);
    }
  }
  selectDefault(index: number): void {
    this.presentations.controls.forEach((control, current) => control.controls.isDefault.setValue(current === index));
  }
  togglePresentation(index: number): void {
    const product = this.selectedProduct();
    const control = this.presentations.at(index);
    const presentationId = control.controls.id.value;
    if (!product || !presentationId) return;
    const status: ProductStatus = control.controls.status.value === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    this.saving.set(true);
    this.api.updatePresentationStatus(product.id, presentationId, status).pipe(
      finalize(() => this.saving.set(false))
    ).subscribe({
      next: (updated) => {
        control.controls.status.setValue(updated.status);
        control.controls.isDefault.setValue(updated.isDefault);
        if (updated.isDefault) {
          this.presentations.controls.forEach((item, current) => {
            if (current !== index) item.controls.isDefault.setValue(false);
          });
        } else if (!this.presentations.controls.some((item) =>
          item.controls.status.value === 'ACTIVE' && item.controls.isDefault.value)) {
          this.presentations.controls.find((item) => item.controls.status.value === 'ACTIVE')
            ?.controls.isDefault.setValue(true);
        }
        this.successMessage.set(status === 'ACTIVE' ? 'Presentación activada.' : 'Presentación desactivada.');
      },
      error: (error: { error?: { message?: string } }) => this.saveFailed(error)
    });
  }
  unitChanged(unit: BaseUnit): void {
    if (this.formMode() !== 'create') return;
    this.form.controls.quantityScale.setValue(unit === 'M3' ? 1000 : 1);
  }
  internalPreview(index: number): string {
    const value = this.presentations.at(index).controls.baseQuantity.value;
    try { return String(displayToInternal(value, this.form.controls.quantityScale.value)); }
    catch { return '—'; }
  }
  defaultPrice(product: ProductResponse): number | null {
    return product.presentations.find((item) => item.status === 'ACTIVE' && item.isDefault)?.salePriceGuarani ?? null;
  }

  save(): void {
    if (this.form.invalid || this.presentations.length === 0 || !this.formMode()) {
      this.form.markAllAsTouched(); return;
    }
    if (this.presentations.controls.filter((control) => control.controls.isDefault.value).length !== 1) {
      this.errorMessage.set('Selecciona exactamente una presentación predeterminada.'); return;
    }
    this.saving.set(true); this.errorMessage.set(null);
    const raw = this.form.getRawValue();
    const presentationInputs = raw.presentations.map((item): CreateProductPresentationRequest => ({
      name: item.name, ...(item.sku.trim() ? { sku: item.sku } : {}),
      ...(item.barcode.trim() ? { barcode: item.barcode } : {}), baseQuantity: item.baseQuantity,
      salePriceGuarani: item.salePriceGuarani, isDefault: item.isDefault, sortOrder: item.sortOrder
    }));
    if (this.formMode() === 'create') {
      const input: CreateProductRequest = {
        code: raw.code, name: raw.name, categoryId: raw.categoryId,
        ...(raw.description.trim() ? { description: raw.description } : {}),
        baseUnit: raw.baseUnit, quantityScale: raw.quantityScale, minStock: raw.minStock,
        trackStock: raw.trackStock, presentations: presentationInputs
      };
      this.finishSave(this.api.create(input), 'Producto creado correctamente.');
      return;
    }
    const product = this.selectedProduct();
    if (!product) return;
    this.api.update(product.id, {
      name: raw.name, categoryId: raw.categoryId,
      ...(raw.description.trim() ? { description: raw.description } : { description: '' }),
      minStock: raw.minStock, trackStock: raw.trackStock
    }).pipe(switchMap(() => {
      const ordered = presentationInputs.map((input, index) => ({ input, index }))
        .sort((left, right) => Number(right.input.isDefault) - Number(left.input.isDefault));
      const requests = ordered.map(({ input, index }) => {
        const presentationId = this.presentations.at(index).controls.id.value;
        return presentationId
          ? this.api.updatePresentation(product.id, presentationId, input)
          : this.api.createPresentation(product.id, input);
      });
      return requests.length ? from(requests).pipe(concatMap((request) => request), toArray()) : of([]);
    })).pipe(finalize(() => this.saving.set(false))).subscribe({
      next: () => this.saved('Producto actualizado correctamente.'),
      error: (error: { error?: { message?: string } }) => this.saveFailed(error)
    });
  }
  requestStatusChange(product: ProductResponse): void { this.statusTarget.set(product); this.clearFeedback(); }
  cancelStatusChange(): void { this.statusTarget.set(null); }
  confirmStatusChange(): void {
    const product = this.statusTarget(); if (!product) return;
    const status: ProductStatus = product.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    this.saving.set(true);
    this.api.updateStatus(product.id, status).pipe(finalize(() => this.saving.set(false))).subscribe({
      next: () => { this.statusTarget.set(null); this.saved(status === 'ACTIVE' ? 'Producto activado.' : 'Producto desactivado.'); },
      error: (error: { error?: { message?: string } }) => { this.statusTarget.set(null); this.saveFailed(error); }
    });
  }

  private presentationGroup(isDefault = false, item?: ProductResponse['presentations'][number]) {
    return this.fb.group({
      id: [item?.id ?? ''], name: [item?.name ?? '', [Validators.required, Validators.maxLength(120)]],
      sku: [item?.sku ?? '', Validators.maxLength(100)], barcode: [item?.barcode ?? '', Validators.maxLength(100)],
      baseQuantity: [item?.baseQuantity ?? 1, [Validators.required, Validators.min(Number.EPSILON)]],
      salePriceGuarani: [item?.salePriceGuarani ?? 0, [Validators.required, Validators.min(0), Validators.pattern(/^\d+$/)]],
      isDefault: [isDefault], status: this.fb.control<ProductStatus>(item?.status ?? 'ACTIVE'),
      sortOrder: [item?.sortOrder ?? 0, [Validators.required, Validators.min(0), Validators.pattern(/^\d+$/)]]
    });
  }
  private finishSave(request: ReturnType<ProductsApiService['create']>, message: string): void {
    request.pipe(finalize(() => this.saving.set(false))).subscribe({
      next: () => this.saved(message), error: (error: { error?: { message?: string } }) => this.saveFailed(error)
    });
  }
  private saved(message: string): void { this.formMode.set(null); this.successMessage.set(message); this.load(true); }
  private saveFailed(error: { error?: { message?: string } }): void {
    this.errorMessage.set(error.error?.message ?? 'No fue posible guardar el producto.');
  }
  private clearFeedback(): void { this.errorMessage.set(null); this.successMessage.set(null); }
}
