import type { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/auth/auth.guard';
import { permissionGuard } from './core/permissions/permission.guard';

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () =>
      import('./features/login/login.component').then((module) => module.LoginComponent)
  },
  {
    path: 'dashboard',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/dashboard/dashboard.component').then(
        (module) => module.DashboardComponent
      )
  },
  {
    path: 'users',
    canActivate: [authGuard, permissionGuard],
    data: { permission: 'users.read' },
    loadComponent: () =>
      import('./features/users/users.component').then((module) => module.UsersComponent)
  },
  {
    path: 'categories',
    canActivate: [authGuard, permissionGuard],
    data: { permission: 'categories.read' },
    loadComponent: () =>
      import('./features/categories/categories.component').then(
        (module) => module.CategoriesComponent
      )
  },
  {
    path: 'products',
    canActivate: [authGuard, permissionGuard],
    data: { permission: 'products.read' },
    loadComponent: () =>
      import('./features/products/products.component').then((module) => module.ProductsComponent)
  },
  {
    path: 'suppliers',
    canActivate: [authGuard, permissionGuard],
    data: { permission: 'suppliers.read' },
    loadComponent: () =>
      import('./features/suppliers/suppliers.component').then((module) => module.SuppliersComponent)
  },
  {
    path: 'purchases/new', canActivate: [authGuard, permissionGuard],
    data: { permission: 'purchases.create' },
    loadComponent: () => import('./features/purchases/purchase-detail.component').then((module) => module.PurchaseDetailComponent)
  },
  {
    path: 'purchases/:id/edit', canActivate: [authGuard, permissionGuard],
    data: { permission: 'purchases.update' },
    loadComponent: () => import('./features/purchases/purchase-detail.component').then((module) => module.PurchaseDetailComponent)
  },
  {
    path: 'purchases/:id', canActivate: [authGuard, permissionGuard],
    data: { permission: 'purchases.read' },
    loadComponent: () => import('./features/purchases/purchase-detail.component').then((module) => module.PurchaseDetailComponent)
  },
  {
    path: 'purchases', canActivate: [authGuard, permissionGuard],
    data: { permission: 'purchases.read' },
    loadComponent: () => import('./features/purchases/purchases.component').then((module) => module.PurchasesComponent)
  },
  {
    path: 'forbidden',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/forbidden/forbidden.component').then(
        (module) => module.ForbiddenComponent
      )
  },
  { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
  { path: '**', redirectTo: 'dashboard' }
];
