import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { debounceTime, distinctUntilChanged, finalize, switchMap, catchError, of } from 'rxjs';
import type { InventoryMovementFilters, InventoryMovementResponse, InventoryMovementType, ProductResponse } from '@lcm/contracts';
import { PermissionService } from '../../core/permissions/permission.service';
import { GuaraniPipe } from '../../shared/guarani.pipe';
import { ProductsApiService } from '../products/products-api.service';
import { InventoryApiService } from './inventory-api.service';
import { movementQuantity, MOVEMENT_LABELS } from './movement-format';

@Component({
  selector: 'lcm-movements', imports: [ReactiveFormsModule, RouterLink, DatePipe, GuaraniPipe],
  templateUrl: './movements.component.html', styleUrl: './inventory.css', changeDetection: ChangeDetectionStrategy.OnPush
})
export class MovementsComponent {
  private readonly api = inject(InventoryApiService); private readonly productsApi = inject(ProductsApiService);
  private readonly fb = inject(NonNullableFormBuilder); private readonly destroyRef = inject(DestroyRef);
  readonly permissions = inject(PermissionService);
  readonly items = signal<readonly InventoryMovementResponse[]>([]); readonly products = signal<readonly ProductResponse[]>([]);
  readonly loading = signal(false); readonly error = signal(''); readonly nextToken = signal<string | undefined>(undefined);
  readonly canReadCosts = this.permissions.has('inventory.costs.read'); readonly quantity = movementQuantity; readonly labels = MOVEMENT_LABELS;
  readonly productSearch = this.fb.control('');
  readonly form = this.fb.group({ productId: [''], type: this.fb.control<InventoryMovementType | ''>(''), dateFrom: [''], dateTo: [''], search: [''] });
  private tokens: Array<string | undefined> = [undefined]; readonly page = signal(1);
  constructor() {
    this.productsApi.list({ pageSize: 50 }).subscribe({ next: (result) => this.products.set(result.items), error: () => this.error.set('No se pudo cargar el selector de productos.') });
    this.productSearch.valueChanges.pipe(debounceTime(350), distinctUntilChanged(),
      switchMap((search) => this.productsApi.list({ pageSize: 50, search }).pipe(catchError(() => of({ items: [] })))),
      takeUntilDestroyed(this.destroyRef)).subscribe((result) => this.products.set(result.items));
    this.load();
  }
  apply(): void { this.tokens = [undefined]; this.page.set(1); this.load(); }
  next(): void { const token = this.nextToken(); if (!token || this.loading()) return; this.tokens.push(token); this.page.set(this.tokens.length); this.load(); }
  previous(): void { if (this.tokens.length === 1 || this.loading()) return; this.tokens.pop(); this.page.set(this.tokens.length); this.load(); }
  load(): void {
    const value = this.form.getRawValue();
    if (value.dateFrom && value.dateTo && value.dateFrom > value.dateTo) { this.error.set('La fecha desde debe ser anterior a la fecha hasta.'); return; }
    const token = this.tokens.at(-1); this.loading.set(true); this.error.set('');
    const filters: InventoryMovementFilters = { pageSize: 25, ...(value.productId ? { productId: value.productId } : {}),
      ...(value.type ? { type: value.type } : {}), ...(value.search.trim() ? { search: value.search.trim() } : {}),
      ...(value.dateFrom ? { dateFrom: value.dateFrom } : {}), ...(value.dateTo ? { dateTo: value.dateTo } : {}), ...(token ? { nextToken: token } : {}) };
    this.api.list(filters).pipe(finalize(() => this.loading.set(false))).subscribe({
      next: (result) => { this.items.set(result.items); this.nextToken.set(result.nextToken); },
      error: () => { this.error.set('No se pudieron cargar los movimientos. Intenta nuevamente.'); this.items.set([]); this.nextToken.set(undefined); }
    });
  }
}
