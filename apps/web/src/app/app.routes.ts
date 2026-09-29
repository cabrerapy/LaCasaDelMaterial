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
