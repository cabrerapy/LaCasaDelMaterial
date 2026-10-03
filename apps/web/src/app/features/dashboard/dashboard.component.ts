import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { finalize } from 'rxjs';
import { HealthService } from '../../core/health.service';
import { AuthService } from '../../core/auth/auth.service';
import { NAVIGATION_ITEMS } from '../../core/navigation/navigation.config';
import { PermissionService } from '../../core/permissions/permission.service';
import { DashboardApiService } from './dashboard-api.service';
import type { DashboardSummaryResponse } from '@lcm/contracts';
import { GuaraniPipe } from '../../shared/guarani.pipe';
import { FormsModule } from '@angular/forms';

type ApiStatus = 'checking' | 'connected' | 'unavailable';

@Component({
  selector: 'lcm-dashboard',
  imports: [RouterLink, RouterLinkActive,GuaraniPipe,FormsModule],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DashboardComponent {
  private readonly healthService = inject(HealthService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly permissions = inject(PermissionService);
  private readonly dashboard=inject(DashboardApiService);

  readonly currentUser = this.auth.currentUser;
  readonly menuOpen = signal(false);
  readonly apiStatus = signal<ApiStatus>('checking');
  readonly summary=signal<DashboardSummaryResponse|null>(null);readonly loading=signal(true);readonly dashboardError=signal<string|null>(null);period='TODAY';dateFrom='';dateTo='';
  readonly menuItems = computed(() =>
    NAVIGATION_ITEMS.filter((item) => this.permissions.has(item.requiredPermission))
  );

  constructor() {
    this.healthService.check().subscribe({next:()=>this.apiStatus.set('connected'),error:()=>this.apiStatus.set('unavailable')});this.selectPeriod('TODAY');
  }

  toggleMenu(): void {
    this.menuOpen.update((open) => !open);
  }

  logout(): void {
    this.auth.logout();
    void this.router.navigate(['/login']);
  }
  selectPeriod(value:string){this.period=value;const now=new Date(),day=(d:Date)=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Asuncion',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);this.dateTo=day(now);if(value==='YESTERDAY'){const d=new Date(now);d.setDate(d.getDate()-1);this.dateFrom=this.dateTo=day(d);}else if(value==='7D'){const d=new Date(now);d.setDate(d.getDate()-6);this.dateFrom=day(d);}else if(value==='MONTH'){this.dateFrom=`${this.dateTo.slice(0,7)}-01`;}else this.dateFrom=this.dateTo;if(value!=='CUSTOM')this.load();}
  load(){if(!this.dateFrom||!this.dateTo)return;this.loading.set(true);this.dashboardError.set(null);this.dashboard.summary(this.dateFrom,this.dateTo).pipe(finalize(()=>this.loading.set(false))).subscribe({next:x=>this.summary.set(x),error:()=>this.dashboardError.set('No pudimos cargar el resumen.')});}
  percent(amount:number,total:number){return total?Math.round(amount*100/total):0;} liters(milli:number){return new Intl.NumberFormat('es-PY',{maximumFractionDigits:3}).format(milli/1000);}
}
