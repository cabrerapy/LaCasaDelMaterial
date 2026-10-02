import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { CashMovementResponse, CashSessionResponse, CashSummaryResponse } from '@lcm/contracts';
import { PermissionService } from '../../core/permissions/permission.service';
import { GuaraniPipe } from '../../shared/guarani.pipe';
import { CashApiService } from './cash-api.service';
@Component({ selector: 'lcm-cash', imports: [FormsModule, GuaraniPipe, DatePipe], templateUrl: './cash.component.html', styleUrl: './cash.component.css', changeDetection: ChangeDetectionStrategy.OnPush })
export class CashComponent {
  private readonly api = inject(CashApiService); private readonly permissions = inject(PermissionService);
  readonly session = signal<CashSessionResponse | null>(null); readonly summary = signal<CashSummaryResponse | null>(null); readonly movements = signal<readonly CashMovementResponse[]>([]); readonly history = signal<readonly CashSessionResponse[]>([]); readonly error = signal<string | null>(null);
  readonly canIn = this.permissions.has('cash.manual_in'); readonly canOut = this.permissions.has('cash.manual_out'); readonly canAudit = this.permissions.has('cash.audit');
  opening = 0; openingNotes = ''; manualAmount = 0; manualReason = ''; manualNotes = ''; counted = 0; closingNotes = '';
  constructor() { this.refresh(); if (this.canAudit) this.api.list().subscribe((page) => this.history.set(page.items)); }
  refresh() { this.api.current().subscribe({ next: (session) => { this.session.set(session); if (session) this.loadSession(session.id); }, error: () => this.error.set('No se pudo cargar la caja.') }); }
  loadSession(id: string) { this.api.summary(id).subscribe((summary) => this.summary.set(summary)); this.api.movements(id).subscribe((page) => this.movements.set(page.items)); }
  open() { this.api.open(Number(this.opening), this.openingNotes).subscribe({ next: (session) => { this.session.set(session); this.loadSession(session.id); }, error: (error) => this.fail(error) }); }
  manual(type: 'in' | 'out') { const session = this.session(); if (!session) return; this.api.manual(session.id, type, Number(this.manualAmount), this.manualReason, this.manualNotes).subscribe({ next: () => { this.manualAmount = 0; this.manualReason = ''; this.loadSession(session.id); }, error: (error) => this.fail(error) }); }
  close() { const session = this.session(); if (!session) return; this.api.close(session.id, Number(this.counted), this.closingNotes).subscribe({ next: (closed) => { this.session.set(closed); this.loadSession(closed.id); }, error: (error) => this.fail(error) }); }
  difference() { return Number(this.counted) - Number(this.summary()?.expectedCashGuarani ?? 0); }
  private fail(error: { error?: { message?: string } }) { this.error.set(error.error?.message ?? 'No se pudo completar la operación.'); }
}
