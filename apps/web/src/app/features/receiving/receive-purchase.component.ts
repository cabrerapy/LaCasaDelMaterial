import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormArray, FormControl, FormGroup, NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import type { CreatePurchaseReceiptRequest, PurchaseReceivingStatusResponse } from '@lcm/contracts';
import { ReceivingApiService } from './receiving-api.service';

@Component({ selector: 'lcm-receive-purchase', imports: [ReactiveFormsModule, RouterLink], changeDetection: ChangeDetectionStrategy.OnPush,
template: `<main class="page"><a [routerLink]="['/purchases',purchaseId]">← Volver a compra</a><h1>Registrar recepción</h1>
@if(error()){<p class="error">{{error()}}</p>} @if(status();as current){<p><strong>{{current.purchaseNumber}}</strong> · {{current.status}}</p>
<form [formGroup]="form"><section formArrayName="lines">@for(item of current.items;track item.purchaseItemId;let i=$index){<article [formGroupName]="i"><div><strong>{{item.productSnapshot.name}}</strong><small>{{item.presentationSnapshot.name}}</small></div><p>Comprado: {{item.orderedQuantity}} {{item.productSnapshot.baseUnit}}<br>Recibido: {{item.receivedQuantity}}<br>Pendiente: <strong>{{item.pendingQuantity}}</strong></p><label>Recibir ahora<input formControlName="receivedQuantity" inputmode="decimal" placeholder="0"></label></article>}</section>
<div class="meta"><label>Fecha<input formControlName="receiptDate" type="date"></label><label>Documento<input formControlName="deliveryDocumentNumber"></label><label>Observaciones<textarea formControlName="notes"></textarea></label></div><button type="button" (click)="save(false)">Guardar borrador</button><button class="primary" type="button" (click)="save(true)">Confirmar recepción</button></form>}</main>`,
styles: [`.page{padding:1.5rem;max-width:900px;margin:auto}article{display:grid;grid-template-columns:2fr 2fr 1fr;gap:1rem;background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:1rem;margin:1rem 0}article div,article label{display:flex;flex-direction:column}.meta{display:grid;gap:.75rem}.meta label{display:flex;flex-direction:column}button{margin:.8rem .8rem 0 0}.primary{background:var(--green-700);color:var(--text-on-dark)}.error{color:var(--error)}@media(max-width:650px){article{grid-template-columns:1fr}}`] })
export class ReceivePurchaseComponent {
  private readonly api = inject(ReceivingApiService); private readonly fb = inject(NonNullableFormBuilder);
  private readonly router = inject(Router); private readonly route = inject(ActivatedRoute);
  readonly purchaseId = this.route.snapshot.paramMap.get('id') ?? '';
  readonly status = signal<PurchaseReceivingStatusResponse | null>(null); readonly error = signal<string | null>(null);
  readonly lines = new FormArray<FormGroup<{ receivedQuantity: FormControl<string> }>>([]);
  readonly form = this.fb.group({ receiptDate: [today(), Validators.required], deliveryDocumentNumber: ['', Validators.maxLength(100)], notes: ['', Validators.maxLength(1500)], lines: this.lines });
  constructor() { this.api.status(this.purchaseId).subscribe({ next: (value) => { this.status.set(value); value.items.forEach(() => this.lines.push(this.fb.group({ receivedQuantity: ['', Validators.pattern(/^\d+(?:[.,]\d+)?$/)] }))); }, error: () => this.error.set('No se pudo cargar la compra.') }); }
  save(confirm: boolean): void {
    const current = this.status(); if (!current) return; const values = this.lines.getRawValue();
    const lines = current.items.map((item, index) => ({ purchaseItemId: item.purchaseItemId, receivedQuantity: values[index]?.receivedQuantity ?? '' })).filter((item) => item.receivedQuantity !== '' && item.receivedQuantity !== '0');
    if (!lines.length) { this.error.set('Ingresa al menos una cantidad.'); return; }
    if (lines.some((line) => Number(line.receivedQuantity.replace(',', '.')) > Number(current.items.find((item) => item.purchaseItemId === line.purchaseItemId)?.pendingQuantity ?? 0))) { this.error.set('Una cantidad supera lo pendiente.'); return; }
    const request: CreatePurchaseReceiptRequest = { purchaseId: this.purchaseId, receiptDate: this.form.controls.receiptDate.value, lines, ...optional('deliveryDocumentNumber', this.form.controls.deliveryDocumentNumber.value), ...optional('notes', this.form.controls.notes.value) };
    this.api.create(request).subscribe({ next: (receipt) => { if (confirm) this.api.confirm(receipt.id).subscribe({ next: (value) => void this.router.navigate(['/purchase-receipts', value.id]), error: (error: { error?: { message?: string } }) => this.error.set(error.error?.message ?? 'No se pudo confirmar.') }); else void this.router.navigate(['/purchase-receipts', receipt.id]); }, error: (error: { error?: { message?: string } }) => this.error.set(error.error?.message ?? 'No se pudo guardar.') });
  }
}
function today(): string { return new Date().toISOString().slice(0, 10); }
function optional<K extends 'deliveryDocumentNumber' | 'notes'>(key: K, value: string): Partial<Record<K, string>> { return value.trim() ? { [key]: value.trim() } as Partial<Record<K, string>> : {}; }
