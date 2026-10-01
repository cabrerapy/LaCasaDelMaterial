import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, debounceTime, distinctUntilChanged, switchMap, catchError, of, expand, EMPTY, reduce } from 'rxjs';
import type { InventorySummary, StockFilters, StockResponse, ProductCategoryResponse, StockStatus } from '@lcm/contracts';
import { PermissionService } from '../../core/permissions/permission.service';
import { CategoriesApiService } from '../categories/categories-api.service';
import { StockApiService } from './stock-api.service';
import { currentStock, stockQuantity, STOCK_LABELS } from './stock-format';
@Component({ selector: 'lcm-stock', imports: [DatePipe, RouterLink, ReactiveFormsModule],
  templateUrl: './stock.component.html', styleUrls: ['./inventory.css', './stock.css'], changeDetection: ChangeDetectionStrategy.OnPush })
export class StockComponent {
  private readonly api = inject(StockApiService); private readonly categoriesApi = inject(CategoriesApiService);
  private readonly fb = inject(NonNullableFormBuilder); private readonly destroyRef = inject(DestroyRef);
  readonly permissions = inject(PermissionService);
  readonly items = signal<readonly StockResponse[]>([]); readonly summary = signal<InventorySummary | null>(null);
  readonly categories = signal<readonly ProductCategoryResponse[]>([]); readonly error = signal('');
  readonly summaryError = signal(''); readonly categoryError = signal('');
  readonly loading = signal(false); readonly nextToken = signal<string | undefined>(undefined);
  readonly page = signal(1); private tokens: Array<string | undefined> = [undefined];
  private readonly requests = new Subject<StockFilters>();
  readonly labels = STOCK_LABELS; readonly quantity = stockQuantity; readonly current = currentStock;
  readonly form = this.fb.group({ search: [''], categoryId: [''], stockStatus: this.fb.control<StockStatus | ''>(''),
    productStatus: this.fb.control<'ACTIVE' | 'INACTIVE' | 'ALL'>('ACTIVE'), sort: this.fb.control<'name' | 'code' | 'stockStatus'>('name') });
  constructor() {
    this.requests.pipe(switchMap((filters) => {
      this.loading.set(true); this.error.set('');
      return this.api.list(filters).pipe(catchError(() => { this.error.set('No se pudo consultar el stock. Intenta nuevamente.'); return of({ items: [], nextToken: undefined }); }));
    }), takeUntilDestroyed(this.destroyRef)).subscribe((result) => {
      this.items.set(result.items); this.nextToken.set(result.nextToken); this.loading.set(false);
    });
    this.form.controls.search.valueChanges.pipe(debounceTime(350), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef)).subscribe(() => this.apply());
    this.api.summary().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (value) => this.summary.set(value), error: () => this.summaryError.set('No se pudo cargar el resumen.')
    });
    if (this.permissions.has('categories.read')) this.categoriesApi.list({ pageSize: 100 }).pipe(
      expand((page) => page.nextToken ? this.categoriesApi.list({ pageSize: 100, nextToken: page.nextToken }) : EMPTY),
      reduce((items, page) => [...items, ...page.items], [] as ProductCategoryResponse[]),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe({ next: (items) => this.categories.set(items), error: () => this.categoryError.set('No se pudieron cargar las categorías.') });
    this.load();
  }
  apply(): void { this.tokens = [undefined]; this.page.set(1); this.load(); }
  next(): void { const token = this.nextToken(); if (!token || this.loading()) return; this.tokens.push(token); this.page.set(this.tokens.length); this.load(); }
  previous(): void { if (this.tokens.length < 2 || this.loading()) return; this.tokens.pop(); this.page.set(this.tokens.length); this.load(); }
  load(): void {
    const value = this.form.getRawValue(); const token = this.tokens.at(-1);
    this.requests.next({ pageSize: 25, productStatus: value.productStatus, sort: value.sort,
      ...(value.search.trim() ? { search: value.search.trim() } : {}), ...(value.categoryId ? { categoryId: value.categoryId } : {}),
      ...(value.stockStatus ? { stockStatus: value.stockStatus } : {}), ...(token ? { nextToken: token } : {}) });
  }
}
