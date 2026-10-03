import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TRIP_STATUS_LABELS, type DeliveryEvidenceResponse, type DeliveryIncidentType, type DeliveryReceiptResponse, type FuelSummaryResponse, type SaleItemDeliveryBalanceResponse, type TripLoadResponse, type TripResponse } from '@lcm/contracts';
import { PermissionService } from '../../core/permissions/permission.service';
import { GuaraniPipe } from '../../shared/guarani.pipe';
import { TripsApiService } from './trips-api.service';
import { FuelApiService } from '../fuel/fuel-api.service';
import { displayToInternal, internalToDisplay } from '../../shared/quantity';
@Component({ selector: 'lcm-trips', imports: [FormsModule, RouterLink, GuaraniPipe], templateUrl: './trips.component.html', styleUrl: '../trucks/trucks.component.css', changeDetection: ChangeDetectionStrategy.OnPush })
export class TripsComponent {
  private readonly api = inject(TripsApiService); private readonly fuelApi = inject(FuelApiService); private readonly permissions = inject(PermissionService);
  readonly labels: Readonly<Record<string, string>> = TRIP_STATUS_LABELS; readonly items = signal<readonly TripResponse[]>([]); readonly selected = signal<TripResponse | null>(null); readonly error = signal<string | null>(null);
  readonly loadDetail = signal<TripLoadResponse | null>(null); readonly balances = signal<readonly SaleItemDeliveryBalanceResponse[]>([]); readonly loadQuantities: Record<string, number> = {};
  readonly fuelSummary = signal<FuelSummaryResponse | null>(null); readonly canFuel = this.permissions.has('fuel.read'); readonly canCreateFuel = this.permissions.has('fuel.create'); readonly canReadFuelCosts = this.permissions.has('fuel.costs.read');
  readonly delivery = signal<DeliveryReceiptResponse | null>(null); readonly canCreateDelivery=this.permissions.has('deliveries.create'); readonly canConfirmDelivery=this.permissions.has('deliveries.confirm'); readonly deliveryQuantities:Record<string,number>={}; readonly deliveryIncidents:Record<string,DeliveryIncidentType>={}; readonly deliveryNotes:Record<string,string>={};
  readonly evidence=signal<readonly DeliveryEvidenceResponse[]>([]);readonly canCreateEvidence=this.permissions.has('delivery_evidence.create');
  readonly canCreate = this.permissions.has('trips.create'); readonly canUpdate = this.permissions.has('trips.update'); readonly canReady = this.permissions.has('trips.ready'); readonly canCancel = this.permissions.has('trips.cancel');
  search = ''; status = ''; odometer = 0; notes = ''; reason = ''; receiverName=''; receiverDocument=''; receiverPhone='';
  constructor() { this.load(); }
  load() { this.api.list({ pageSize: 25, search: this.search, status: this.status }).subscribe({ next: (result) => this.items.set(result.items), error: () => this.error.set('No se pudieron cargar los viajes.') }); }
  open(trip: TripResponse) { this.selected.set(trip); this.odometer = trip.status === 'READY' ? (trip.odometerStartKm ?? 0) : (trip.odometerEndKm ?? trip.odometerStartKm ?? 0); if(trip.saleId){this.loadCargo(trip);this.loadDelivery(trip);} if(this.canFuel)this.fuelApi.tripSummary(trip.id).subscribe({next:s=>this.fuelSummary.set(s)}); }
  loadCargo(trip:TripResponse){this.api.getLoad(trip.id).subscribe({next:l=>{this.loadDetail.set(l);for(const line of l?.lines??[])this.loadQuantities[line.saleItemId]=line.quantityBaseInternal;}});this.api.getBalances(trip.id).subscribe({next:b=>this.balances.set(b)});}
  saveCargo(trip:TripResponse){const lines=this.balances().map(b=>({saleItemId:b.saleItemId,quantityBaseInternal:Number(this.loadQuantities[b.saleItemId]??0)})).filter(x=>x.quantityBaseInternal>0);this.api.saveLoad(trip.id,{lines},!!this.loadDetail()).subscribe({next:l=>this.loadDetail.set(l),error:()=>this.error.set('No se pudo guardar la carga.')});}
  confirmCargo(trip:TripResponse){this.api.confirmLoad(trip.id).subscribe({next:l=>{this.loadDetail.set(l);this.loadCargo(trip);},error:()=>this.error.set('No se pudo confirmar la carga.')});}
  ready(trip: TripResponse) { this.api.ready(trip.id).subscribe(() => this.load()); }
  start(trip: TripResponse) { this.api.start(trip.id, { odometerStartKm: Number(this.odometer) }).subscribe(() => { this.selected.set(null); this.load(); }); }
  deliver(trip: TripResponse) { this.api.deliver(trip.id, { odometerEndKm: Number(this.odometer), ...(this.notes.trim() ? { notes: this.notes } : {}) }).subscribe(() => { this.selected.set(null); this.load(); }); }
  loadDelivery(trip:TripResponse){this.api.getDelivery(trip.id).subscribe({next:d=>{this.delivery.set(d);if(d){this.api.evidence(trip.id).subscribe(x=>this.evidence.set(x));this.receiverName=d.receiverName??'';this.receiverDocument=d.receiverDocument??'';this.receiverPhone=d.receiverPhone??'';for(const line of d.lines){this.deliveryQuantities[line.tripLoadLineId]=internalToDisplay(line.deliveredQuantityBaseInternal,line.productSnapshot.quantityScale);this.deliveryIncidents[line.tripLoadLineId]=line.incidentType;this.deliveryNotes[line.tripLoadLineId]=line.incidentNotes??'';}}}});}
  beginDelivery(trip:TripResponse){this.api.createDelivery(trip.id,{}).subscribe({next:d=>{this.delivery.set(d);this.loadDelivery(trip);},error:()=>this.error.set('No se pudo iniciar el comprobante de entrega.')});}
  saveDelivery(trip:TripResponse){const input=this.deliveryInput();if(!input)return;this.api.updateDelivery(trip.id,input).subscribe({next:x=>this.delivery.set(x),error:()=>this.error.set('Revise cantidades, receptor e incidencias.')});}
  confirmDelivery(trip:TripResponse){const input=this.deliveryInput();if(!input)return;this.api.updateDelivery(trip.id,input).subscribe({next:x=>{this.delivery.set(x);this.api.confirmDelivery(trip.id,Number(this.odometer)).subscribe({next:d=>{this.delivery.set(d);this.selected.set(null);this.load();},error:()=>this.error.set('No se pudo confirmar la entrega. Revise los datos.')});},error:()=>this.error.set('Revise cantidades, receptor e incidencias.')});}
  displayQuantity(value:number,scale:number){return internalToDisplay(value,scale);}
  uploadEvidence(trip:TripResponse,event:Event){const file=(event.target as HTMLInputElement).files?.[0];if(!file)return;const type=file.type==='application/pdf'?'DOCUMENT':'PHOTO';this.api.uploadEvidence(trip.id,file,type).subscribe({next:()=>this.api.evidence(trip.id).subscribe(x=>this.evidence.set(x)),error:()=>this.error.set('No se pudo adjuntar la evidencia. Use JPG, PNG, WebP o PDF de hasta 5 MB.')});}
  private deliveryInput(){const d=this.delivery();if(!d)return null;const lines=d.lines.map(x=>({tripLoadLineId:x.tripLoadLineId,deliveredQuantityBaseInternal:displayToInternal(Number(this.deliveryQuantities[x.tripLoadLineId]),x.productSnapshot.quantityScale),incidentType:this.deliveryIncidents[x.tripLoadLineId]??'NONE',...(this.deliveryNotes[x.tripLoadLineId]?.trim()?{incidentNotes:this.deliveryNotes[x.tripLoadLineId].trim()}: {})}));return{receiverName:this.receiverName,receiverDocument:this.receiverDocument,receiverPhone:this.receiverPhone,generalNotes:this.notes,lines};}
  cancel(trip: TripResponse) { this.api.cancel(trip.id, this.reason).subscribe(() => { this.selected.set(null); this.load(); }); }
}
