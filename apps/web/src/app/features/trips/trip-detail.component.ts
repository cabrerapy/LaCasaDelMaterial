import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import type { CreateTripRequest, DriverResponse, TripResponse, TruckResponse } from '@lcm/contracts';
import { finalize, forkJoin, of } from 'rxjs';
import { DriversApiService } from '../drivers/drivers-api.service';
import { TrucksApiService } from '../trucks/trucks-api.service';
import { TripsApiService } from './trips-api.service';

@Component({
  selector:'lcm-trip-detail', imports:[ReactiveFormsModule,RouterLink],
  template:`<main class="page"><header><a routerLink="/trips">← Volver a viajes</a><h1>{{isNew?'Nuevo viaje':trip()?.tripNumber||'Viaje'}}</h1></header>
    @if(error()){<p class="feedback error" role="alert">{{error()}}</p>}
    @if(loading()){<p role="status">Cargando viaje…</p>}
    @else if(isNew||trip()){
      @if(readonly()){<section class="list-card"><h2>Datos del viaje</h2><p>Estado: {{trip()?.status}}</p><p>Camión: {{trip()?.truckLabel}}</p><p>Chofer: {{trip()?.driverName}}</p><p>Fecha: {{trip()?.scheduledDate}}</p><p>Destino: {{trip()?.destinationName}}</p><p>Dirección: {{trip()?.destinationAddress}}</p><p>Venta: {{trip()?.saleNumber||'Sin venta asociada'}}</p><p>Observaciones: {{trip()?.notes||'—'}}</p><a routerLink="/trips">Volver para ver carga y operar</a></section>}
      @else{<form class="list-card" [formGroup]="form" (ngSubmit)="save()"><div class="form-grid">
        <label>Camión *<select formControlName="truckId"><option value="">Seleccionar</option>@for(t of trucks();track t.id){<option [value]="t.id">{{t.internalCode||t.plate}} · {{t.plate}}</option>}</select></label>
        <label>Chofer *<select formControlName="driverId"><option value="">Seleccionar</option>@for(d of drivers();track d.id){<option [value]="d.id">{{d.displayName}}</option>}</select></label>
        <label>Fecha programada *<input type="date" formControlName="scheduledDate"></label>
        <label>Venta asociada (ID, opcional)<input formControlName="saleId" [readonly]="!isNew" placeholder="UUID de venta confirmada con flota propia"></label>
        <label>Origen<input formControlName="originName" maxlength="150"></label><label>Dirección de origen<input formControlName="originAddress" maxlength="300"></label>
        <label>Destino *<input formControlName="destinationName" maxlength="150"></label><label>Dirección de destino *<input formControlName="destinationAddress" maxlength="300"></label>
        <label>Ciudad<input formControlName="destinationCity" maxlength="120"></label><label>Flete (Gs.)<input type="number" min="0" step="1" formControlName="freightChargeGuarani"></label>
        <label class="wide">Observaciones<textarea formControlName="notes" maxlength="1500" rows="3"></textarea></label>
      </div>@if(trucksNext()){<button type="button" (click)="moreTrucks()" [disabled]="optionsLoading()">Más camiones</button>}@if(driversNext()){<button type="button" (click)="moreDrivers()" [disabled]="optionsLoading()">Más choferes</button>}<p>Solo se guardan viajes en borrador. La carga y el inicio se operan desde Viajes.</p><div class="modal-actions"><a routerLink="/trips">Cancelar</a><button type="submit" class="primary" [disabled]="saving()">{{saving()?'Guardando…':'Guardar viaje'}}</button></div></form>}
    }
  </main>`,
  styles:[`:host{display:block;padding:1rem}.page{max-width:960px;margin:auto}input,select,textarea{width:100%;min-width:0}label{min-width:0}.feedback{overflow-wrap:anywhere}button{min-height:44px}`],
  styleUrl:'../trucks/trucks.component.css', changeDetection:ChangeDetectionStrategy.OnPush
})
export class TripDetailComponent {
  private readonly api=inject(TripsApiService);
  private readonly trucksApi=inject(TrucksApiService);
  private readonly driversApi=inject(DriversApiService);
  private readonly route=inject(ActivatedRoute);
  private readonly router=inject(Router);
  readonly isNew=this.route.snapshot.routeConfig?.path==='trips/new';
  readonly editing=this.route.snapshot.routeConfig?.path==='trips/:id/edit';
  readonly loading=signal(true); readonly saving=signal(false); readonly error=signal<string|null>(null);
  readonly trip=signal<TripResponse|null>(null); readonly trucks=signal<readonly TruckResponse[]>([]); readonly drivers=signal<readonly DriverResponse[]>([]);
  readonly trucksNext=signal<string|undefined>(undefined); readonly driversNext=signal<string|undefined>(undefined); readonly optionsLoading=signal(false);
  readonly readonly=signal(!this.isNew&&!this.editing);
  readonly form=new FormGroup({
    truckId:new FormControl('',{nonNullable:true,validators:[Validators.required]}), driverId:new FormControl('',{nonNullable:true,validators:[Validators.required]}),
    scheduledDate:new FormControl('',{nonNullable:true,validators:[Validators.required]}), saleId:new FormControl('',{nonNullable:true,validators:[Validators.pattern(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)]}),
    originName:new FormControl('La Casa del Material',{nonNullable:true}),originAddress:new FormControl('',{nonNullable:true}),
    destinationName:new FormControl('',{nonNullable:true,validators:[Validators.required]}),destinationAddress:new FormControl('',{nonNullable:true,validators:[Validators.required]}),destinationCity:new FormControl('',{nonNullable:true}),
    freightChargeGuarani:new FormControl(0,{nonNullable:true,validators:[Validators.required,Validators.min(0)]}),notes:new FormControl('',{nonNullable:true})
  });
  constructor(){
    const id=this.route.snapshot.paramMap.get('id');
    if(!this.isNew&&!id){this.error.set('Viaje no encontrado.');this.loading.set(false);return;}
    (this.isNew?of<TripResponse|null>(null):this.api.get(id!)).subscribe({next:trip=>{
      this.trip.set(trip);if(trip){this.form.patchValue(trip);if(trip.status!=='DRAFT')this.readonly.set(true);}else{this.form.controls.saleId.setValue(this.route.snapshot.queryParamMap.get('saleId')??'');}
      if(this.readonly()){this.loading.set(false);return;}
      this.loadOptions();
    },error:()=>{this.error.set('No se pudo cargar el viaje.');this.loading.set(false);}});
  }
  private loadOptions(){
    forkJoin({trucks:this.trucksApi.list({status:'ACTIVE',pageSize:100}),drivers:this.driversApi.list({status:'ACTIVE',pageSize:100})}).pipe(finalize(()=>this.loading.set(false))).subscribe({next:result=>{
      this.trucks.set(result.trucks.items);this.drivers.set(result.drivers.items.filter(d=>!d.licenseExpired));
      this.trucksNext.set(result.trucks.nextToken);this.driversNext.set(result.drivers.nextToken);
    },error:()=>this.error.set('No se pudieron cargar camiones y choferes disponibles.')});
  }
  moreTrucks(){const nextToken=this.trucksNext();if(!nextToken||this.optionsLoading())return;this.optionsLoading.set(true);this.trucksApi.list({status:'ACTIVE',pageSize:100,nextToken}).pipe(finalize(()=>this.optionsLoading.set(false))).subscribe({next:p=>{this.trucks.update(items=>[...items,...p.items]);this.trucksNext.set(p.nextToken);},error:()=>this.error.set('No se pudieron cargar más camiones.')});}
  moreDrivers(){const nextToken=this.driversNext();if(!nextToken||this.optionsLoading())return;this.optionsLoading.set(true);this.driversApi.list({status:'ACTIVE',pageSize:100,nextToken}).pipe(finalize(()=>this.optionsLoading.set(false))).subscribe({next:p=>{this.drivers.update(items=>[...items,...p.items.filter(d=>!d.licenseExpired)]);this.driversNext.set(p.nextToken);},error:()=>this.error.set('No se pudieron cargar más choferes.')});}
  save(){
    if(this.readonly()||this.loading()||this.saving())return;
    this.form.markAllAsTouched();const value=this.form.getRawValue();
    if(this.form.invalid||!value.destinationName.trim()||!value.destinationAddress.trim()||!Number.isSafeInteger(value.freightChargeGuarani)){this.error.set('Completá camión, chofer, fecha y destino. El flete debe ser un entero no negativo y la venta un UUID válido.');return;}
    const input:CreateTripRequest={truckId:value.truckId,driverId:value.driverId,scheduledDate:value.scheduledDate,destinationName:value.destinationName.trim(),destinationAddress:value.destinationAddress.trim(),freightChargeGuarani:value.freightChargeGuarani,...(value.saleId?{saleId:value.saleId}:{}),...(value.originName.trim()?{originName:value.originName.trim()}:{}),...(value.originAddress.trim()?{originAddress:value.originAddress.trim()}:{}),...(value.destinationCity.trim()?{destinationCity:value.destinationCity.trim()}:{}),...(value.notes.trim()?{notes:value.notes.trim()}:{})};
    this.saving.set(true);this.error.set(null);
    (this.isNew?this.api.create(input):this.api.update(this.trip()!.id,input)).pipe(finalize(()=>this.saving.set(false))).subscribe({next:()=>void this.router.navigate(['/trips']),error:()=>this.error.set('No se pudo guardar. Verificá disponibilidad, licencia, venta, flete y estado del viaje.')});
  }
}
