import { TestBed } from '@angular/core/testing';
import type { CashSessionResponse } from '@lcm/contracts';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PermissionService } from '../../core/permissions/permission.service';
import { CashApiService } from './cash-api.service';
import { CashComponent } from './cash.component';

describe('Cash history selection', () => {
  const api = { current: vi.fn(), list: vi.fn(), summary: vi.fn(), movements: vi.fn() };
  const permissions = { has: vi.fn() };
  beforeEach(() => {
    vi.clearAllMocks();
    api.current.mockReturnValue(of(null));
    api.list.mockReturnValue(of({ items: [] }));
    api.summary.mockReturnValue(of(null));
    api.movements.mockReturnValue(of({ items: [] }));
    permissions.has.mockReturnValue(true);
    TestBed.configureTestingModule({ providers: [
      { provide: CashApiService, useValue: api },
      { provide: PermissionService, useValue: permissions }
    ] });
  });
  it('lets auditors load the selected session and resets operation inputs', () => {
    const component = TestBed.runInInjectionContext(() => new CashComponent());
    const session = { id: 'qa-session', status: 'OPEN' } as CashSessionResponse;
    component.counted = 174000;
    component.manualReason = 'Previous session';
    component.selectHistoricalSession(session);
    expect(component.session()).toEqual(session);
    expect(api.summary).toHaveBeenCalledWith('qa-session');
    expect(api.movements).toHaveBeenCalledWith('qa-session');
    expect(component.counted).toBe(0);
    expect(component.manualReason).toBe('');
  });
  it('does not allow history selection without audit permission', () => {
    permissions.has.mockReturnValue(false);
    const component = TestBed.runInInjectionContext(() => new CashComponent());
    component.selectHistoricalSession({ id: 'other-session', status: 'OPEN' } as CashSessionResponse);
    expect(component.session()).toBeNull();
    expect(api.summary).not.toHaveBeenCalled();
    expect(api.list).not.toHaveBeenCalled();
  });
});
