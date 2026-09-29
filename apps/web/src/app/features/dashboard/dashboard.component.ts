import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { catchError, of } from 'rxjs';
import { HealthService } from '../../core/health.service';

type ApiStatus = 'checking' | 'connected' | 'unavailable';

interface MenuItem {
  readonly label: string;
  readonly symbol: string;
}

@Component({
  selector: 'lcm-dashboard',
  imports: [RouterLink],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DashboardComponent {
  private readonly healthService = inject(HealthService);

  readonly menuOpen = signal(false);
  readonly apiStatus = signal<ApiStatus>('checking');
  readonly menuItems: readonly MenuItem[] = [
    { label: 'Dashboard', symbol: '▦' },
    { label: 'Ventas', symbol: '◫' },
    { label: 'Compras', symbol: '▣' },
    { label: 'Inventario', symbol: '◈' },
    { label: 'Productos', symbol: '◇' },
    { label: 'Clientes', symbol: '◎' },
    { label: 'Proveedores', symbol: '◉' },
    { label: 'Camiones', symbol: '▰' },
    { label: 'Viajes', symbol: '➜' },
    { label: 'Combustible', symbol: '◐' },
    { label: 'Reportes', symbol: '▥' },
    { label: 'Usuarios', symbol: '♙' }
  ];

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
}
