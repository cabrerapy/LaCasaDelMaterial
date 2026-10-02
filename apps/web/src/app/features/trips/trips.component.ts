import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TRIP_STATUS_LABELS, type FuelSummaryResponse, type SaleItemDeliveryBalanceResponse, type TripLoadResponse, type TripResponse } from '@lcm/contracts';
import { PermissionService } from '../../core/permissions/permission.service';
import { GuaraniPipe } from '../../shared/guarani.pipe';
import { TripsApiService } from './trips-api.service';
import { FuelApiService } from '../fuel/fuel-api.service';
@Component({ selector: 'lcm-trips', imports: [FormsModule, RouterLink, GuaraniPipe], templateUrl: './trips.component.html', styleUrl: '../trucks/trucks.component.css', changeDetection: ChangeDetectionStrategy.OnPush })
export class TripsComponent {
  private readonly api = inject(TripsApiService); private readonly fuelApi = inject(FuelApiService); private readonly permissions = inject(PermissionService);
  readonly labels: Readonly<Record<string, string>> = TRIP_STATUS_LABELS; readonly items = signal<readonly TripResponse[]>([]); readonly selected = signal<TripResponse | null>(null); readonly error = signal<string | null>(null);
  readonly loadDetail = signal<TripLoadResponse | null>(null); readonly balances = signal<readonly SaleItemDeliveryBalanceResponse[]>([]); readonly loadQuantities: Record<string, number> = {};
  readonly fuelSummary = signal<FuelSummaryResponse | null>(null); readonly canFuel = this.permissions.has('fuel.read'); readonly canCreateFuel = this.permissions.has('fuel.create'); readonly canReadFuelCosts = this.permissions.has('fuel.costs.read');
  readonly canCreate = this.permissions.has('trips.create'); readonly canUpdate = this.permissions.has('trips.update'); readonly canReady = this.permissions.has('trips.ready'); readonly canCancel = this.permissions.has('trips.cancel');
  search = ''; status = ''; odometer = 0; notes = ''; reason = '';
  constructor() { this.load(); }
  load() { this.api.list({ pageSize: 25, search: this.search, status: this.status }).subscribe({ next: (result) => this.items.set(result.items), error: () => this.error.set('No se pudieron cargar los viajes.') }); }
  open(trip: TripResponse) { this.selected.set(trip); this.odometer = trip.status === 'READY' ? (trip.odometerStartKm ?? 0) : (trip.odometerEndKm ?? trip.odometerStartKm ?? 0); if(trip.saleId)this.loadCargo(trip); if(this.canFuel)this.fuelApi.tripSummary(trip.id).subscribe({next:s=>this.fuelSummary.set(s)}); }
  loadCargo(trip:TripResponse){this.api.getLoad(trip.id).subscribe({next:l=>{this.loadDetail.set(l);for(const line of l?.lines??[])this.loadQuantities[line.saleItemId]=line.quantityBaseInternal;}});this.api.getBalances(trip.id).subscribe({next:b=>this.balances.set(b)});}
  saveCargo(trip:TripResponse){const lines=this.balances().map(b=>({saleItemId:b.saleItemId,quantityBaseInternal:Number(this.loadQuantities[b.saleItemId]??0)})).filter(x=>x.quantityBaseInternal>0);this.api.saveLoad(trip.id,{lines},!!this.loadDetail()).subscribe({next:l=>this.loadDetail.set(l),error:()=>this.error.set('No se pudo guardar la carga.')});}
  confirmCargo(trip:TripResponse){this.api.confirmLoad(trip.id).subscribe({next:l=>{this.loadDetail.set(l);this.loadCargo(trip);},error:()=>this.error.set('No se pudo confirmar la carga.')});}
  ready(trip: TripResponse) { this.api.ready(trip.id).subscribe(() => this.load()); }
  start(trip: TripResponse) { this.api.start(trip.id, { odometerStartKm: Number(this.odometer) }).subscribe(() => { this.selected.set(null); this.load(); }); }
  deliver(trip: TripResponse) { this.api.deliver(trip.id, { odometerEndKm: Number(this.odometer), ...(this.notes.trim() ? { notes: this.notes } : {}) }).subscribe(() => { this.selected.set(null); this.load(); }); }
  cancel(trip: TripResponse) { this.api.cancel(trip.id, this.reason).subscribe(() => { this.selected.set(null); this.load(); }); }
}
