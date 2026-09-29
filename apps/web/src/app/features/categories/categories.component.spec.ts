import { TestBed } from '@angular/core/testing';
import type { CategoriesPageResponse, ProductCategoryResponse } from '@lcm/contracts';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PermissionService } from '../../core/permissions/permission.service';
import { CategoriesApiService } from './categories-api.service';
import { CategoriesComponent } from './categories.component';

const arena: ProductCategoryResponse = {
  id: 'category-id',
  name: 'Arena',
  slug: 'arena',
  description: 'Arena fina',
  status: 'ACTIVE',
  sortOrder: 10,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z'
};

describe('CategoriesComponent', () => {
  let component: CategoriesComponent;
  const page: CategoriesPageResponse = { items: [arena] };
  const api = {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateStatus: vi.fn()
  };
  const permissions = { has: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    api.list.mockReturnValue(of(page));
    permissions.has.mockReturnValue(true);
    TestBed.configureTestingModule({
      providers: [
        { provide: CategoriesApiService, useValue: api },
        { provide: PermissionService, useValue: permissions }
      ]
    });
    component = TestBed.runInInjectionContext(() => new CategoriesComponent());
  });

  it('loads active categories by default', () => {
    expect(api.list).toHaveBeenCalledWith({ pageSize: 25, status: 'ACTIVE' });
    expect(component.categories()).toEqual([arena]);
  });

  it('derives available actions from centralized permissions', () => {
    expect(component.canCreate).toBe(true);
    expect(component.canUpdate).toBe(true);
    expect(component.canDisable).toBe(true);
    permissions.has.mockImplementation((permission: string) => permission === 'categories.read');
    const readOnly = TestBed.runInInjectionContext(() => new CategoriesComponent());
    expect(readOnly.canCreate).toBe(false);
    expect(readOnly.canUpdate).toBe(false);
    expect(readOnly.canDisable).toBe(false);
  });

  it('creates a category from valid form data', () => {
    api.create.mockReturnValue(of(arena));
    component.openCreate();
    component.form.setValue({ name: 'Arena', description: 'Arena fina', sortOrder: 10 });
    component.save();
    expect(api.create).toHaveBeenCalledWith({
      name: 'Arena', description: 'Arena fina', sortOrder: 10
    });
    expect(component.successMessage()).toBe('Categoría creada correctamente.');
  });

  it('edits a category without exposing the slug field', () => {
    api.update.mockReturnValue(of({ ...arena, name: 'Arena fina', slug: 'arena-fina' }));
    component.openEdit(arena);
    component.form.patchValue({ name: 'Arena fina' });
    component.save();
    expect(api.update).toHaveBeenCalledWith('category-id', {
      name: 'Arena fina', description: 'Arena fina', sortOrder: 10
    });
  });

  it('does not submit an invalid category', () => {
    component.openCreate();
    component.form.patchValue({ name: ' ' });
    component.save();
    expect(api.create).not.toHaveBeenCalled();
  });

  it('reloads the list when status filter changes', () => {
    component.statusControl.setValue('INACTIVE');
    expect(api.list).toHaveBeenLastCalledWith({ pageSize: 25, status: 'INACTIVE' });
  });
});
