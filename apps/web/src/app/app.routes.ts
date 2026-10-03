import type { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/auth/auth.guard';
import { permissionGuard } from './core/permissions/permission.guard';

export const routes: Routes = [
  { path: 'reports/:type', canActivate: [authGuard, permissionGuard], data: { permission: 'reports.read' }, loadComponent: () => import('./features/reports/reports.component').then(m => m.ReportsComponent) },
  { path: 'reports', canActivate: [authGuard, permissionGuard], data: { permission: 'reports.read' }, loadComponent: () => import('./features/reports/reports.component').then(m => m.ReportsComponent) },
  { path: 'fuel', canActivate: [authGuard, permissionGuard], data: { permission: 'fuel.read' }, loadComponent: () => import('./features/fuel/fuel.component').then(m => m.FuelComponent) },
  { path: 'trips/:id/delivery', canActivate: [authGuard, permissionGuard], data: { permission: 'deliveries.read' }, loadComponent: () => import('./features/trips/delivery-page.component').then(m => m.DeliveryPageComponent) },
  { path: 'trips', canActivate: [authGuard, permissionGuard], data: { permission: 'trips.read' }, loadComponent: () => import('./features/trips/trips.component').then(m => m.TripsComponent) },
  { path: 'drivers', canActivate: [authGuard, permissionGuard], data: { permission: 'drivers.read' }, loadComponent: () => import('./features/drivers/drivers.component').then((module) => module.DriversComponent) },
  { path: 'trucks', canActivate: [authGuard, permissionGuard], data: { permission: 'trucks.read' }, loadComponent: () => import('./features/trucks/trucks.component').then((module) => module.TrucksComponent) },
  { path: 'cash', canActivate: [authGuard, permissionGuard], data: { permission: 'cash.read' }, loadComponent: () => import('./features/cash/cash.component').then(m => m.CashComponent) },
  { path: 'pos', canActivate: [authGuard, permissionGuard], data: { permission: 'sales.create' }, loadComponent: () => import('./features/sales/pos.component').then(m => m.PosComponent) },
  { path: 'sales/:id', canActivate: [authGuard, permissionGuard], data: { permission: 'sales.authorized.read' }, loadComponent: () => import('./features/sales/sales.component').then(m => m.SalesComponent) },
  { path: 'sales', canActivate: [authGuard, permissionGuard], data: { permission: 'sales.authorized.read' }, loadComponent: () => import('./features/sales/sales.component').then(m => m.SalesComponent) },
  { path: 'inventory/movements/:id', canActivate: [authGuard, permissionGuard], data: { permission: 'inventory.movements.read' }, loadComponent: () => import('./features/inventory/movement-detail.component').then((module) => module.MovementDetailComponent) },
  { path: 'inventory/movements', canActivate: [authGuard, permissionGuard], data: { permission: 'inventory.movements.read' }, loadComponent: () => import('./features/inventory/movements.component').then((module) => module.MovementsComponent) },
  {
    path: 'inventory', canActivate: [authGuard, permissionGuard], data: { permission: 'inventory.read' },
    loadComponent: () => import('./features/inventory/stock.component').then((module) => module.StockComponent)
  },
  {
    path: 'inventory/:productId', canActivate: [authGuard, permissionGuard], data: { permission: 'inventory.read' },
    loadComponent: () => import('./features/inventory/stock-detail.component').then((module) => module.StockDetailComponent)
  },
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
    path: 'customers', canActivate: [authGuard, permissionGuard], data: { permission: 'customers.read' },
    loadComponent: () => import('./features/customers/customers.component').then((module) => module.CustomersComponent)
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
  { path: 'purchases/:id/receive', canActivate: [authGuard, permissionGuard], data: { permission: 'receipts.create' }, loadComponent: () => import('./features/receiving/receive-purchase.component').then((module) => module.ReceivePurchaseComponent) },
  { path: 'purchase-receipts/:id', canActivate: [authGuard, permissionGuard], data: { permission: 'receipts.read' }, loadComponent: () => import('./features/receiving/receipt-detail.component').then((module) => module.ReceiptDetailComponent) },
  { path: 'purchase-receipts', canActivate: [authGuard, permissionGuard], data: { permission: 'receipts.read' }, loadComponent: () => import('./features/receiving/receipts.component').then((module) => module.ReceiptsComponent) },
  { path: 'lots/:id', canActivate: [authGuard, permissionGuard], data: { permission: 'lots.read' }, loadComponent: () => import('./features/receiving/lots.component').then((module) => module.LotsComponent) },
  { path: 'lots', canActivate: [authGuard, permissionGuard], data: { permission: 'lots.read' }, loadComponent: () => import('./features/receiving/lots.component').then((module) => module.LotsComponent) },
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
