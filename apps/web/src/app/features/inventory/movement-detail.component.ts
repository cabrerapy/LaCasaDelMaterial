import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import type { InventoryMovementResponse } from '@lcm/contracts';
import { PermissionService } from '../../core/permissions/permission.service';
import { GuaraniPipe } from '../../shared/guarani.pipe';
import { InventoryApiService } from './inventory-api.service';
import { movementQuantity, MOVEMENT_LABELS } from './movement-format';
@Component({
  selector: 'lcm-movement-detail', imports: [RouterLink, DatePipe, GuaraniPipe], styleUrl: './inventory.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<main class="page"><a routerLink="/inventory/movements">← Movimientos</a>
  @if (item(); as movement) { <header><div><p class="eyebrow">Inventario · {{ labels[movement.type] }}</p><h1>{{ movement.movementNumber }}</h1></div><strong class="positive">{{ quantity(movement) }}</strong></header>
  <section class="card detail"><div><small>Producto</small><strong>{{ movement.productSnapshot.name }}</strong><span>{{ movement.productSnapshot.code }}</span></div>
  <div><small>Lote</small><a [routerLink]="['/lots', movement.lotId]">{{ movement.lotNumber }}</a></div>
  <div><small>Recepción de origen</small><a [routerLink]="['/purchase-receipts', movement.sourceId]">{{ movement.referenceNumber }}</a></div>
  <div><small>Compra</small><a [routerLink]="['/purchases', movement.purchaseId]">Ver compra</a></div>
  <div><small>Fecha del movimiento</small><span>{{ movement.occurredAt | date:'dd/MM/yyyy':'UTC' }}</span></div>
  <div><small>Registrado</small><span>{{ movement.createdAt | date:'dd/MM/yyyy HH:mm' }}</span></div>
  <div><small>Registrado por</small><span>{{ movement.createdBy }}</span></div>
  @if (canReadCosts) { <div><small>Costo directo</small><strong>{{ movement.costGuarani | guarani }}</strong></div> }
  @if (movement.notes) { <div><small>Observaciones</small><p>{{ movement.notes }}</p></div> }
  </section><p class="muted">Registro histórico de solo lectura.</p>
  } @else { <p role="status">{{ error() || 'Cargando movimiento…' }}</p> }</main>`
})
export class MovementDetailComponent {
  private readonly api = inject(InventoryApiService); private readonly route = inject(ActivatedRoute);
  readonly canReadCosts = inject(PermissionService).has('inventory.costs.read');
  readonly item = signal<InventoryMovementResponse | null>(null); readonly error = signal('');
  readonly quantity = movementQuantity; readonly labels = MOVEMENT_LABELS;
  constructor() { this.api.get(this.route.snapshot.paramMap.get('id') ?? '').subscribe({
    next: (item) => this.item.set(item), error: () => this.error.set('Movimiento no disponible.')
  }); }
}
