import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { switchMap, catchError, of } from 'rxjs';
import type { StockDetailResponse } from '@lcm/contracts';
import { PermissionService } from '../../core/permissions/permission.service';
import { GuaraniPipe } from '../../shared/guarani.pipe';
import { StockApiService } from './stock-api.service';
import { currentStock, stockQuantity, STOCK_LABELS } from './stock-format';
import { movementQuantity, MOVEMENT_LABELS } from './movement-format';
@Component({ selector: 'lcm-stock-detail', imports: [DatePipe, RouterLink, GuaraniPipe],
  templateUrl: './stock-detail.component.html', styleUrls: ['./inventory.css', './stock.css'], changeDetection: ChangeDetectionStrategy.OnPush })
export class StockDetailComponent {
  private readonly api = inject(StockApiService); private readonly route = inject(ActivatedRoute);
  readonly permissions = inject(PermissionService); readonly item = signal<StockDetailResponse | null>(null);
  readonly error = signal(''); readonly loading = signal(true);
  readonly quantity = stockQuantity; readonly current = currentStock; readonly labels = STOCK_LABELS;
  readonly movementQuantity = movementQuantity; readonly movementLabels = MOVEMENT_LABELS;
  constructor() {
    this.route.paramMap.pipe(switchMap((params) => {
      this.loading.set(true); this.error.set(''); this.item.set(null);
      return this.api.detail(params.get('productId') ?? '').pipe(catchError(() => { this.error.set('No se pudo cargar el producto. Puede no existir o no estar disponible.'); return of(null); }));
    }), takeUntilDestroyed(inject(DestroyRef))).subscribe((item) => { this.item.set(item); this.loading.set(false); });
  }
}
