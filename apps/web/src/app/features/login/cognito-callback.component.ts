import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal, type OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'lcm-cognito-callback', imports: [RouterLink], changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './login.component.css',
  template: `<main class="login-page"><section class="form-panel" aria-live="polite">
    <h1>Acceso seguro</h1>
    @if (failed()) { <p role="alert">No fue posible validar tu acceso. Inicia sesión nuevamente.</p><a routerLink="/login">Volver al acceso</a> }
    @else { <p>Validando tu identidad y permisos…</p> }
  </section></main>`
})
export class CognitoCallbackComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  readonly failed = signal(false);
  ngOnInit(): void {
    const callback = window.location.href;
    // Remove authorization code/state from browser history before token exchange.
    window.history.replaceState(window.history.state, '', window.location.pathname);
    this.auth.completeCognitoLogin(callback).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => void this.router.navigateByUrl('/dashboard', { replaceUrl: true }),
      error: () => this.failed.set(true)
    });
  }
}
