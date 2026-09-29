import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { catchError, of } from 'rxjs';
import { HealthService } from '../../core/health.service';
import { AuthService } from '../../core/auth/auth.service';
import { NAVIGATION_ITEMS } from '../../core/navigation/navigation.config';
import { PermissionService } from '../../core/permissions/permission.service';

type ApiStatus = 'checking' | 'connected' | 'unavailable';

@Component({
  selector: 'lcm-dashboard',
  imports: [RouterLink],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DashboardComponent {
  private readonly healthService = inject(HealthService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly permissions = inject(PermissionService);

  readonly currentUser = this.auth.currentUser;
  readonly menuOpen = signal(false);
  readonly apiStatus = signal<ApiStatus>('checking');
  readonly menuItems = computed(() =>
    NAVIGATION_ITEMS.filter((item) => this.permissions.has(item.requiredPermission))
  );

  constructor() {
    this.healthService
      .check()
      .pipe(
        catchError(() => {
          this.apiStatus.set('unavailable');
          return of(null);
        })
      )
      .subscribe((response) => {
        if (response?.status === 'ok') {
          this.apiStatus.set('connected');
        }
      });
  }

  toggleMenu(): void {
    this.menuOpen.update((open) => !open);
  }

  logout(): void {
    this.auth.logout();
    void this.router.navigate(['/login']);
  }
}
