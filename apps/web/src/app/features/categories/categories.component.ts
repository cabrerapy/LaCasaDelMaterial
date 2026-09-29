import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import type {
  CategoryStatus,
  CreateCategoryRequest,
  ProductCategoryResponse
} from '@lcm/contracts';
import { debounceTime, distinctUntilChanged, finalize } from 'rxjs';
import { PermissionService } from '../../core/permissions/permission.service';
import { CategoriesApiService } from './categories-api.service';

type CategoryFilter = 'ALL' | CategoryStatus;
type FormMode = 'create' | 'edit';

@Component({
  selector: 'lcm-categories',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './categories.component.html',
  styleUrl: './categories.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CategoriesComponent {
  private readonly api = inject(CategoriesApiService);
  private readonly permissions = inject(PermissionService);
  private readonly formBuilder = inject(NonNullableFormBuilder);

  readonly categories = signal<readonly ProductCategoryResponse[]>([]);
  readonly nextToken = signal<string | null>(null);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);
  readonly formMode = signal<FormMode | null>(null);
  readonly selectedId = signal<string | null>(null);
  readonly statusTarget = signal<ProductCategoryResponse | null>(null);
  readonly canCreate = this.permissions.has('categories.create');
  readonly canUpdate = this.permissions.has('categories.update');
  readonly canDisable = this.permissions.has('categories.disable');
  readonly searchControl = this.formBuilder.control('');
  readonly statusControl = this.formBuilder.control<CategoryFilter>('ACTIVE');
  readonly form = this.formBuilder.group({
    name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(100)]],
    description: ['', Validators.maxLength(500)],
    sortOrder: [0, [
      Validators.required,
      Validators.min(0),
      Validators.max(1_000_000),
      Validators.pattern(/^\d+$/)
    ]]
  });

  constructor() {
    this.searchControl.valueChanges.pipe(
      debounceTime(350),
      distinctUntilChanged()
    ).subscribe(() => this.load(true));
    this.statusControl.valueChanges.subscribe(() => this.load(true));
    this.load(true);
  }

  load(reset = false): void {
    if (this.loading()) return;
    this.loading.set(true);
    this.errorMessage.set(null);
    const status = this.statusControl.value;
    this.api.list({
      pageSize: 25,
      ...(reset ? {} : { nextToken: this.nextToken() ?? undefined }),
      ...(status === 'ALL' ? {} : { status }),
      ...(this.searchControl.value.trim() ? { search: this.searchControl.value.trim() } : {})
    }).pipe(finalize(() => this.loading.set(false))).subscribe({
      next: (page) => {
        this.categories.set(reset ? page.items : [...this.categories(), ...page.items]);
        this.nextToken.set(page.nextToken ?? null);
      },
      error: () => this.errorMessage.set('Error al cargar categorías.')
    });
  }

  openCreate(): void {
    this.form.reset({ name: '', description: '', sortOrder: 0 });
    this.selectedId.set(null);
    this.formMode.set('create');
    this.clearFeedback();
  }

  openEdit(category: ProductCategoryResponse): void {
    this.form.reset({
      name: category.name,
      description: category.description ?? '',
      sortOrder: category.sortOrder
    });
    this.selectedId.set(category.id);
    this.formMode.set('edit');
    this.clearFeedback();
  }

  closeForm(): void {
    if (!this.saving()) this.formMode.set(null);
  }

  save(): void {
    if (this.form.invalid || !this.formMode()) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.errorMessage.set(null);
    const value = this.form.getRawValue();
    const input: CreateCategoryRequest = {
      name: value.name,
      ...(value.description.trim() ? { description: value.description } : {}),
      sortOrder: value.sortOrder
    };
    const editing = this.formMode() === 'edit';
    const request = editing
      ? this.api.update(this.selectedId() ?? '', input)
      : this.api.create(input);
    request.pipe(finalize(() => this.saving.set(false))).subscribe({
      next: () => {
        this.formMode.set(null);
        this.successMessage.set(editing
          ? 'Categoría actualizada correctamente.'
          : 'Categoría creada correctamente.');
        this.load(true);
      },
      error: (error: { error?: { message?: string } }) =>
        this.errorMessage.set(error.error?.message ?? 'No fue posible guardar la categoría.')
    });
  }

  requestStatusChange(category: ProductCategoryResponse): void {
    this.statusTarget.set(category);
    this.clearFeedback();
  }

  cancelStatusChange(): void { this.statusTarget.set(null); }

  confirmStatusChange(): void {
    const target = this.statusTarget();
    if (!target) return;
    const status: CategoryStatus = target.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    this.saving.set(true);
    this.api.updateStatus(target.id, status).pipe(
      finalize(() => this.saving.set(false))
    ).subscribe({
      next: () => {
        this.statusTarget.set(null);
        this.successMessage.set(status === 'INACTIVE'
          ? 'Categoría desactivada correctamente.'
          : 'Categoría activada correctamente.');
        this.load(true);
      },
      error: (error: { error?: { message?: string } }) => {
        this.statusTarget.set(null);
        this.errorMessage.set(error.error?.message ?? 'No fue posible cambiar el estado.');
      }
    });
  }

  private clearFeedback(): void {
    this.errorMessage.set(null);
    this.successMessage.set(null);
  }
}
