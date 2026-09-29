import { inject } from '@angular/core';
import type { CanActivateFn } from '@angular/router';
import { Router } from '@angular/router';
import type { Permission } from '@lcm/contracts';
import { catchError, map, of } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { PermissionService } from './permission.service';

export const permissionGuard: CanActivateFn = (route) => {
  const permission = route.data['permission'] as Permission | undefined;
  const permissions = inject(PermissionService);
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!permission) {
    return true;
  }
  if (auth.currentUser()) {
    return permissions.has(permission) ? true : router.createUrlTree(['/forbidden']);
  }
  return auth.getCurrentUser().pipe(
    map((user) => user
      ? (permissions.has(permission) ? true : router.createUrlTree(['/forbidden']))
      : router.createUrlTree(['/login'])
    ),
    catchError(() => of(router.createUrlTree(['/login'])))
  );
};
