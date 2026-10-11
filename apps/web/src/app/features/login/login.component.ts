import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { finalize } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'lcm-login',
  imports: [ReactiveFormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LoginComponent {
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  readonly usesCognito = this.auth.usesCognito;

  readonly loading = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly form = this.formBuilder.group({
    username: ['', [Validators.required, Validators.maxLength(100)]],
    password: ['', [Validators.required, Validators.maxLength(256)]]
  });

  submit(): void {
    this.errorMessage.set(null);
    if (this.usesCognito) {
      this.loading.set(true);
      void this.auth.beginCognitoLogin().then(url => window.location.assign(url)).catch(() => {
        this.loading.set(false);
        this.errorMessage.set('No fue posible iniciar el acceso seguro. Intenta nuevamente.');
      });
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    this.auth.login(this.form.getRawValue()).pipe(
      finalize(() => this.loading.set(false))
    ).subscribe({
      next: () => void this.router.navigate(['/dashboard']),
      error: (error: unknown) => {
        this.errorMessage.set(
          error instanceof HttpErrorResponse && error.status === 401
            ? 'Usuario o contraseña incorrectos.'
            : 'No fue posible iniciar sesión. Intenta nuevamente.'
        );
      }
    });
  }
}
