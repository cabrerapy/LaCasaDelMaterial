import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { REPORT_TYPES, type ReportCell, type ReportDefinition, type ReportQuery, type ReportResponse, type ReportType } from '@lcm/contracts';
import { ReportsApiService } from './reports-api.service';

type QuickPeriod = 'TODAY' | 'YESTERDAY' | 'LAST_7' | 'THIS_MONTH' | 'PREVIOUS_MONTH' | 'CUSTOM';
type FilterDefinition = { readonly key: keyof ReportQuery; readonly label: string; readonly placeholder?: string };

const FILTERS: Readonly<Partial<Record<ReportType, readonly FilterDefinition[]>>> = {
  sales: [f('status', 'Estado'), f('customerId', 'Cliente ID'), f('userId', 'Cajero ID'), f('paymentMethod', 'Medio de pago'), f('deliveryMethod', 'Tipo de entrega'), f('search', 'Buscar')],
  payments: [f('paymentMethod', 'Medio de pago'), f('userId', 'Cajero ID'), f('saleId', 'Venta ID'), f('transferAccountId', 'Cuenta receptora')],
  transfers: [f('transferAccountId', 'Cuenta receptora'), f('userId', 'Cajero ID'), f('saleId', 'Venta ID'), f('customerId', 'Cliente ID'), f('status', 'Estado')],
  'gross-margin': [f('productId', 'Producto ID'), f('categoryId', 'Categoría ID'), f('customerId', 'Cliente ID'), f('saleId', 'Venta ID')],
  cash: [f('userId', 'Cajero ID'), f('cashSessionId', 'Sesión ID'), f('movementType', 'Tipo de movimiento')],
  purchases: [f('supplierId', 'Proveedor ID'), f('status', 'Estado'), f('search', 'Buscar')],
  inventory: [f('search', 'Buscar'), f('categoryId', 'Categoría ID'), f('stockStatus', 'Estado de stock'), f('productStatus', 'Estado de producto')],
  'inventory-movements': [f('productId', 'Producto ID'), f('movementType', 'Tipo'), f('sourceType', 'Origen'), f('referenceNumber', 'Referencia')],
  'low-stock': [f('categoryId', 'Categoría ID'), f('search', 'Buscar')],
  trips: [f('status', 'Estado'), f('truckId', 'Camión ID'), f('driverId', 'Chofer ID'), f('saleId', 'Venta ID')],
  deliveries: [f('outcome', 'Resultado'), f('status', 'Estado'), f('driverId', 'Chofer ID'), f('customerId', 'Cliente ID'), f('saleId', 'Venta ID')],
  fuel: [f('truckId', 'Camión ID'), f('driverId', 'Chofer ID'), f('tripId', 'Viaje ID'), f('status', 'Estado')]
};

@Component({
  selector: 'lcm-reports',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './reports.component.html',
  styleUrl: './reports.component.css'
})
export class ReportsComponent {
  private readonly api = inject(ReportsApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly loading = signal(true);
  readonly exporting = signal(false);
  readonly error = signal('');
  readonly hub = signal<readonly ReportDefinition[]>([]);
  readonly report = signal<ReportResponse | null>(null);
  readonly type = signal<ReportType | null>(null);
  readonly filterPanel = signal(false);
  readonly generatedAt = new Date();
  readonly reportGroups: readonly { readonly key: ReportDefinition['category']; readonly label: string }[] = [
    { key: 'FINANCE', label: 'Finanzas y ventas' },
    { key: 'INVENTORY', label: 'Compras e inventario' },
    { key: 'LOGISTICS', label: 'Logística' }
  ];
  readonly quickPeriods: readonly { readonly value: QuickPeriod; readonly label: string }[] = [
    { value: 'TODAY', label: 'Hoy' }, { value: 'YESTERDAY', label: 'Ayer' },
    { value: 'LAST_7', label: 'Últimos 7 días' }, { value: 'THIS_MONTH', label: 'Este mes' },
    { value: 'PREVIOUS_MONTH', label: 'Mes anterior' }, { value: 'CUSTOM', label: 'Personalizado' }
  ];
  readonly quickPeriod = signal<QuickPeriod>('THIS_MONTH');
  readonly filters = signal<Record<string, string>>({});
  readonly cursorHistory = signal<readonly (string | undefined)[]>([undefined]);
  readonly pageIndex = computed(() => this.cursorHistory().length);
  readonly filterDefinitions = computed(() => this.type() ? FILTERS[this.type()!] ?? [] : []);
  readonly grouped = computed(() => ({
    FINANCE: this.hub().filter((item) => item.category === 'FINANCE'),
    INVENTORY: this.hub().filter((item) => item.category === 'INVENTORY'),
    LOGISTICS: this.hub().filter((item) => item.category === 'LOGISTICS')
  }));

  constructor() {
    this.route.paramMap.subscribe((params) => {
      const value = params.get('type');
      if (value && REPORT_TYPES.includes(value as ReportType)) {
        this.type.set(value as ReportType);
        this.setQuickPeriod('THIS_MONTH', false);
        this.loadReport();
      } else {
        this.type.set(null);
        this.loadHub();
      }
    });
  }

  setFilter(key: keyof ReportQuery, value: string): void { this.filters.update((current) => ({ ...current, [key]: value })); }
  value(key: keyof ReportQuery): string { return this.filters()[key] ?? ''; }

  setQuickPeriod(period: QuickPeriod, reload = true): void {
    this.quickPeriod.set(period);
    if (period !== 'CUSTOM') {
      const now = new Date();
      const start = new Date(now); const end = new Date(now);
      if (period === 'TODAY') setDay(start, end, now);
      if (period === 'YESTERDAY') { const day = new Date(now); day.setDate(day.getDate() - 1); setDay(start, end, day); }
      if (period === 'LAST_7') { start.setDate(now.getDate() - 6); start.setHours(0, 0, 0, 0); end.setHours(23, 59, 59, 999); }
      if (period === 'THIS_MONTH') { start.setDate(1); start.setHours(0, 0, 0, 0); end.setHours(23, 59, 59, 999); }
      if (period === 'PREVIOUS_MONTH') { start.setMonth(now.getMonth() - 1, 1); start.setHours(0, 0, 0, 0); end.setDate(0); end.setHours(23, 59, 59, 999); }
      this.filters.update((current) => ({ ...current, dateFrom: localInput(start), dateTo: localInput(end) }));
    }
    if (reload) this.applyFilters();
  }

  applyFilters(): void {
    if (!this.validPeriod()) return;
    this.cursorHistory.set([undefined]);
    this.loadReport();
    this.filterPanel.set(false);
  }
  clearFilters(): void { this.filters.set({}); this.setQuickPeriod('THIS_MONTH'); }
  validPeriod(): boolean {
    const report = this.report();
    if (report && !report.period.dateFrom) return true;
    const from = this.value('dateFrom'); const to = this.value('dateTo');
    return !!from && !!to && new Date(from).getTime() <= new Date(to).getTime();
  }
  next(): void { const cursor = this.report()?.pagination.nextCursor; if (!cursor) return; this.cursorHistory.update((history) => [...history, cursor]); this.loadReport(cursor); }
  previous(): void { const history = this.cursorHistory(); if (history.length <= 1) return; const next = history.slice(0, -1); this.cursorHistory.set(next); this.loadReport(next.at(-1)); }
  retry(): void { this.type() ? this.loadReport(this.cursorHistory().at(-1)) : this.loadHub(); }
  print(): void { window.print(); }
  open(rowUrl?: string): void { if (rowUrl) void this.router.navigateByUrl(rowUrl); }

  exportCsv(): void {
    const type = this.type(); if (!type || this.exporting()) return;
    this.exporting.set(true); this.error.set('');
    this.api.export(type, this.query()).subscribe({
      next: (blob) => { const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `reporte-${type}.csv`; anchor.click(); URL.revokeObjectURL(url); this.exporting.set(false); },
      error: () => { this.error.set('No pudimos exportar el reporte. Reduzca el rango o revise sus permisos.'); this.exporting.set(false); }
    });
  }

  format(cell: ReportCell): string {
    if (cell.kind === 'MONEY' && typeof cell.value === 'number') return `Gs. ${cell.value.toLocaleString('es-PY')}`;
    if (cell.kind === 'DATE_TIME') return new Intl.DateTimeFormat('es-PY', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(String(cell.value)));
    if (cell.kind === 'NUMBER' && typeof cell.value === 'number') return cell.value.toLocaleString('es-PY');
    return String(cell.value);
  }

  private loadHub(): void {
    this.loading.set(true); this.error.set('');
    this.api.hub().subscribe({ next: (response) => { this.hub.set(response.reports); this.loading.set(false); }, error: () => { this.error.set('No pudimos cargar los reportes disponibles.'); this.loading.set(false); } });
  }
  private loadReport(cursor?: string): void {
    const type = this.type(); if (!type) return;
    this.loading.set(true); this.error.set('');
    this.api.report(type, { ...this.query(), ...(cursor ? { cursor } : {}) }).subscribe({ next: (response) => { this.report.set(response); this.loading.set(false); }, error: () => { this.error.set('No pudimos generar el reporte.'); this.loading.set(false); } });
  }
  private query(): ReportQuery {
    const temporal = !['inventory', 'low-stock'].includes(this.type() ?? '');
    const raw = this.filters();
    return {
      pageSize: 50,
      ...(temporal && raw['dateFrom'] ? { dateFrom: new Date(raw['dateFrom']).toISOString() } : {}),
      ...(temporal && raw['dateTo'] ? { dateTo: new Date(raw['dateTo']).toISOString() } : {}),
      ...Object.fromEntries(Object.entries(raw).filter(([key, value]) => !['dateFrom', 'dateTo'].includes(key) && value))
    } as ReportQuery;
  }
}

function f(key: keyof ReportQuery, label: string, placeholder?: string): FilterDefinition { return { key, label, ...(placeholder ? { placeholder } : {}) }; }
function setDay(start: Date, end: Date, day: Date): void { start.setTime(day.getTime()); end.setTime(day.getTime()); start.setHours(0, 0, 0, 0); end.setHours(23, 59, 59, 999); }
function localInput(date: Date): string { const offset = date.getTimezoneOffset(); return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16); }
