import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import type { ReportResponse } from '@lcm/contracts';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReportsApiService } from './reports-api.service';
import { ReportsComponent } from './reports.component';

const response: ReportResponse = {
  reportType: 'sales', title: 'Ventas', description: 'Detalle',
  period: { dateFrom: '2026-10-01T00:00:00.000Z', dateTo: '2026-10-31T23:59:59.999Z', timezone: 'America/Asuncion' },
  filters: [], summary: [{ key: 'count', label: 'Cantidad de ventas', value: 0, kind: 'NUMBER' }],
  items: [], pagination: { pageSize: 50 }
};

describe('ReportsComponent', () => {
  const api = { hub: vi.fn(), report: vi.fn(), export: vi.fn() };
  const router = { navigateByUrl: vi.fn() };

  beforeEach(() => { vi.clearAllMocks(); api.hub.mockReturnValue(of({ reports: [] })); api.report.mockReturnValue(of(response)); });

  it('loads the permission-filtered reports hub', () => {
    const component = create({});
    expect(api.hub).toHaveBeenCalledOnce();
    expect(component.loading()).toBe(false);
  });

  it('loads a temporal report, validates custom dates and resets filters', () => {
    const component = create({ type: 'sales' });
    expect(api.report).toHaveBeenCalledOnce();
    expect(component.report()?.title).toBe('Ventas');
    component.setFilter('dateFrom', '2026-10-03T15:00');
    component.setFilter('dateTo', '2026-10-03T10:00');
    expect(component.validPeriod()).toBe(false);
    component.clearFilters();
    expect(component.validPeriod()).toBe(true);
    expect(component.pageIndex()).toBe(1);
  });

  function create(params: Record<string, string>): ReportsComponent {
    TestBed.configureTestingModule({ providers: [
      { provide: ReportsApiService, useValue: api },
      { provide: Router, useValue: router },
      { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap(params)) } }
    ] });
    return TestBed.runInInjectionContext(() => new ReportsComponent());
  }
});
