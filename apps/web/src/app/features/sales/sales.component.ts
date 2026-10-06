import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import type { DeliveryReceiptResponse, SaleCostingResponse, SaleResponse, SaleStatus, TripResponse } from '@lcm/contracts';
import { PermissionService } from '../../core/permissions/permission.service';
import { GuaraniPipe } from '../../shared/guarani.pipe';
import { SalesApiService } from './sales-api.service';
import { internalToDisplay } from '../../shared/quantity';
import { finalize } from 'rxjs';
@Component({ selector: 'lcm-sales', imports: [FormsModule, RouterLink, GuaraniPipe], templateUrl: './sales.component.html', styleUrls: ['./sales.css', './costing.css'], changeDetection: ChangeDetectionStrategy.OnPush })
export class SalesComponent {
  private readonly api = inject(SalesApiService); private readonly route = inject(ActivatedRoute); private readonly permissions = inject(PermissionService);
  readonly sales = signal<readonly SaleResponse[]>([]); readonly selected = signal<SaleResponse | null>(null); readonly costing = signal<SaleCostingResponse | null>(null); readonly error = signal<string | null>(null);
  readonly trips=signal<readonly TripResponse[]>([]);readonly deliveries=signal<readonly DeliveryReceiptResponse[]>([]);
  readonly logisticsExpanded=signal(false);
  readonly confirming=signal(false);
  readonly canConfirm=this.permissions.has('sales.confirm');
  confirmDraft(sale: SaleResponse) {
    if (!this.canConfirm || sale.status !== 'DRAFT' || this.confirming()) return;
    this.confirming.set(true); this.error.set(null);
    this.api.confirm(sale.id).pipe(finalize(() => this.confirming.set(false))).subscribe({
      next: value => { this.selected.set(value); this.loadDetail(value.id); },
      error: (error: { error?: { message?: string } }) => this.error.set(error.error?.message ?? 'No se pudo confirmar la venta.')
    });
  }
  readonly canReadCosts = this.permissions.has('sales.costs.read'); readonly canReadMargins = this.permissions.has('sales.margins.read'); search = ''; status: 'ALL' | SaleStatus = 'ALL';
  constructor() { const id = this.route.snapshot.paramMap.get('id'); if (id) this.loadDetail(id); else this.load(); }
  load() { this.api.list({ ...(this.search.trim() ? { search: this.search.trim() } : {}), ...(this.status === 'ALL' ? {} : { status: this.status }) }).subscribe({ next: (page) => this.sales.set(page.items), error: () => this.error.set('No se pudieron cargar las ventas.') }); }
  loadDetail(id: string) { this.api.get(id).subscribe({ next: (sale) => { this.selected.set(sale); if(sale.deliveryType==='OWN_FLEET'){this.api.trips(id).subscribe(x=>this.trips.set(x.items));if(this.permissions.has('deliveries.read'))this.api.deliveries(id).subscribe(x=>this.deliveries.set(x.items));} if (this.canReadCosts) this.api.costing(id).subscribe((value) => this.costing.set(value)); }, error: () => this.error.set('Venta no encontrada.') }); }
  deliveredFor(saleItemId:string){return this.deliveries().filter(x=>x.status==='CONFIRMED').flatMap(x=>x.lines).filter(x=>x.saleItemId===saleItemId).reduce((n,x)=>n+x.deliveredQuantityBaseInternal,0);}
  completedItems(sale:SaleResponse){return sale.items.filter(x=>this.deliveredFor(x.id)>=x.quantityBaseInternal).length;}
  pendingItems(sale:SaleResponse){return sale.items.length-this.completedItems(sale);}
  logisticsOutcome(sale:SaleResponse){const delivered=sale.items.reduce((n,x)=>n+this.deliveredFor(x.id),0);if(!delivered)return'Pendiente';return this.pendingItems(sale)?'Entrega parcial':'Entrega completa';}
  quantity(value:number,scale:number){return internalToDisplay(value,scale);}
  voidSale(sale: SaleResponse) { const reason = window.prompt('Motivo de anulación'); if (reason) this.api.void(sale.id, reason).subscribe({ next: (value) => this.loadDetail(value.id), error: (error) => this.error.set(error.error?.message ?? 'No se pudo anular.') }); }
  retry(sale: SaleResponse) { this.api.retryCosting(sale.id).subscribe({ next: () => this.loadDetail(sale.id), error: (error) => this.error.set(error.error?.message ?? 'No se pudo completar el costeo.') }); }
  margin(value?: number) { return value === undefined ? '—' : `${new Intl.NumberFormat('es-PY', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value / 100)} %`; }
  costingLabel(value: SaleResponse['costingStatus']) { return { PENDING: 'Costeo pendiente', COSTED: 'Costeada', NOT_APPLICABLE: 'Sin costeo', VOIDED: 'Anulada' }[value]; }
}
