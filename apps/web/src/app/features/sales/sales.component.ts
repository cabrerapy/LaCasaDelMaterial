import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import type { SaleCostingResponse, SaleResponse, SaleStatus } from '@lcm/contracts';
import { PermissionService } from '../../core/permissions/permission.service';
import { GuaraniPipe } from '../../shared/guarani.pipe';
import { SalesApiService } from './sales-api.service';
@Component({ selector: 'lcm-sales', imports: [FormsModule, RouterLink, GuaraniPipe], templateUrl: './sales.component.html', styleUrls: ['./sales.css', './costing.css'], changeDetection: ChangeDetectionStrategy.OnPush })
export class SalesComponent {
  private readonly api = inject(SalesApiService); private readonly route = inject(ActivatedRoute); private readonly permissions = inject(PermissionService);
  readonly sales = signal<readonly SaleResponse[]>([]); readonly selected = signal<SaleResponse | null>(null); readonly costing = signal<SaleCostingResponse | null>(null); readonly error = signal<string | null>(null);
  readonly canReadCosts = this.permissions.has('sales.costs.read'); readonly canReadMargins = this.permissions.has('sales.margins.read'); search = ''; status: 'ALL' | SaleStatus = 'ALL';
  constructor() { const id = this.route.snapshot.paramMap.get('id'); if (id) this.loadDetail(id); else this.load(); }
  load() { this.api.list({ ...(this.search.trim() ? { search: this.search.trim() } : {}), ...(this.status === 'ALL' ? {} : { status: this.status }) }).subscribe({ next: (page) => this.sales.set(page.items), error: () => this.error.set('No se pudieron cargar las ventas.') }); }
  loadDetail(id: string) { this.api.get(id).subscribe({ next: (sale) => { this.selected.set(sale); if (this.canReadCosts) this.api.costing(id).subscribe((value) => this.costing.set(value)); }, error: () => this.error.set('Venta no encontrada.') }); }
  voidSale(sale: SaleResponse) { const reason = window.prompt('Motivo de anulación'); if (reason) this.api.void(sale.id, reason).subscribe({ next: (value) => this.loadDetail(value.id), error: (error) => this.error.set(error.error?.message ?? 'No se pudo anular.') }); }
  retry(sale: SaleResponse) { this.api.retryCosting(sale.id).subscribe({ next: () => this.loadDetail(sale.id), error: (error) => this.error.set(error.error?.message ?? 'No se pudo completar el costeo.') }); }
  margin(value?: number) { return value === undefined ? '—' : `${new Intl.NumberFormat('es-PY', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value / 100)} %`; }
  costingLabel(value: SaleResponse['costingStatus']) { return { PENDING: 'Costeo pendiente', COSTED: 'Costeada', NOT_APPLICABLE: 'Sin costeo', VOIDED: 'Anulada' }[value]; }
}
