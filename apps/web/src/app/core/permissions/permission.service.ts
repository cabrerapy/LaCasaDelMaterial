import { inject, Injectable } from '@angular/core';
import { hasPermission, type Permission } from '@lcm/contracts';
import { AuthService } from '../auth/auth.service';

@Injectable({ providedIn: 'root' })
export class PermissionService {
  private readonly auth = inject(AuthService);

  has(permission: Permission): boolean {
    const user = this.auth.currentUser();
    return user ? hasPermission(user.role, permission) : false;
  }
}
