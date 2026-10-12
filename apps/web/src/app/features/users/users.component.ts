import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule, NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  USER_ROLES,
  USER_ROLE_LABELS,
  type CreateUserRequest,
  type UserResponse,
  type UserRole,
  type UserStatus
} from '@lcm/contracts';
import type { UsersCapabilitiesResponse } from '@lcm/contracts';
import { finalize, type Observable } from 'rxjs';
import { UsersApiService } from './users-api.service';

type FormMode = 'create' | 'edit';
type LifecycleAction = 'invite' | 'activate' | 'deactivate';

@Component({
  selector: 'lcm-users',
  imports: [ReactiveFormsModule, FormsModule, RouterLink],
  templateUrl: './users.component.html',
  styleUrl: './users.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class UsersComponent {
  private readonly usersApi = inject(UsersApiService);
  private readonly formBuilder = inject(NonNullableFormBuilder);

  readonly users = signal<readonly UserResponse[]>([]);
  readonly capabilities = signal<UsersCapabilitiesResponse | null>(null);
  readonly feedback = signal<string | null>(null);
  readonly lifecycleTarget = signal<{ user: UserResponse; action: LifecycleAction } | null>(null);
  deactivationReason = '';
  readonly nextToken = signal<string | null>(null);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly formMode = signal<FormMode | null>(null);
  readonly selectedUserId = signal<string | null>(null);
  readonly statusTarget = signal<UserResponse | null>(null);
  readonly roles = USER_ROLES;
  readonly roleLabels = USER_ROLE_LABELS;
  readonly form = this.formBuilder.group({
    name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(120)]],
    username: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(40), Validators.pattern(/^[a-zA-Z0-9._-]+$/)]],
    email: ['', [Validators.required, Validators.email, Validators.maxLength(254)]],
    password: ['', [Validators.required, Validators.minLength(10), Validators.pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9]).+$/)]],
    role: ['CASHIER' as UserRole, Validators.required]
  });

  constructor() {
    this.load(true);
    this.usersApi.capabilities().subscribe({ next: value => this.capabilities.set(value),
      error: () => this.errorMessage.set('No se pudo comprobar qué acciones de usuarios están habilitadas. La vista queda en solo lectura.') });
  }

  load(reset = false): void {
    if (this.loading()) return;
    this.loading.set(true);
    this.errorMessage.set(null);
    this.usersApi.list(25, reset ? undefined : this.nextToken() ?? undefined).pipe(
      finalize(() => this.loading.set(false))
    ).subscribe({
      next: (page) => {
        this.users.set(reset ? page.items : [...this.users(), ...page.items]);
        this.nextToken.set(page.nextToken ?? null);
      },
      error: () => this.errorMessage.set('No fue posible cargar los usuarios.')
    });
  }

  openCreate(): void {
    if (!this.capabilities()?.create || this.saving()) return;
    this.form.reset({ name: '', username: '', email: '', password: '', role: 'CASHIER' });
    this.form.controls.username.enable();
    this.form.controls.password.enable();
    if (this.capabilities()?.mode === 'cognito') this.form.controls.password.disable();
    this.selectedUserId.set(null);
    this.formMode.set('create');
    this.errorMessage.set(null);
  }

  openEdit(user: UserResponse): void {
    if (!this.capabilities()?.edit || this.saving()) return;
    this.form.reset({
      name: user.name,
      username: user.username,
      email: user.email,
      password: 'NotChanged1',
      role: user.role
    });
    this.form.controls.username.disable();
    this.form.controls.password.disable();
    this.selectedUserId.set(user.id);
    this.formMode.set('edit');
    this.errorMessage.set(null);
  }

  closeForm(): void {
    if (!this.saving()) this.formMode.set(null);
  }

  save(): void {
    const capabilities = this.capabilities();
    if (this.saving() || !capabilities || (this.formMode() === 'create' ? !capabilities.create : !capabilities.edit)) return;
    if (this.form.invalid || !this.formMode()) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.errorMessage.set(null);
    const value = this.form.getRawValue();
    const request: Observable<unknown> = this.formMode() === 'create'
      ? capabilities.mode === 'cognito'
        ? this.usersApi.stageCognito({ name: value.name, username: value.username, email: value.email, role: value.role })
        : this.usersApi.create(value as CreateUserRequest)
      : this.usersApi.update(this.selectedUserId() ?? '', {
          name: value.name,
          email: value.email,
          role: value.role
        });
    request.pipe(finalize(() => this.saving.set(false))).subscribe({
      next: () => {
        if (capabilities.mode === 'cognito') this.feedback.set('Usuario creado inactivo. La invitación y la activación son pasos separados.');
        this.formMode.set(null);
        this.load(true);
      },
      error: (error: { error?: { message?: string } }) =>
        this.errorMessage.set(error.error?.message ?? 'No fue posible guardar el usuario.')
    });
  }

  requestStatusChange(user: UserResponse): void {
    if (!this.capabilities()?.status || this.saving()) return;
    this.statusTarget.set(user);
  }

  cancelStatusChange(): void {
    this.statusTarget.set(null);
  }

  confirmStatusChange(): void {
    if (!this.capabilities()?.status || this.saving()) return;
    const target = this.statusTarget();
    if (!target) return;
    const status: UserStatus = target.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    this.saving.set(true);
    this.usersApi.updateStatus(target.id, status).pipe(
      finalize(() => this.saving.set(false))
    ).subscribe({
      next: (updated) => {
        this.users.update((users) => users.map((user) => user.id === updated.id ? updated : user));
        this.statusTarget.set(null);
      },
      error: (error: { error?: { message?: string } }) => {
        this.errorMessage.set(error.error?.message ?? 'No fue posible cambiar el estado.');
        this.statusTarget.set(null);
      }
    });
  }

  requestLifecycle(user: UserResponse, action: LifecycleAction): void {
    const capability = this.capabilities();
    if (this.saving() || capability?.mode !== 'cognito' || !capability[action] ||
      (action === 'deactivate' ? user.role === 'ADMIN' : user.status !== 'INACTIVE' || user.cognitoDeactivated)) return;
    this.deactivationReason = '';
    this.lifecycleTarget.set({ user, action });
    this.feedback.set(null);
    this.errorMessage.set(null);
  }

  cancelLifecycle(): void { if (!this.saving()) this.lifecycleTarget.set(null); }

  confirmLifecycle(): void {
    const target = this.lifecycleTarget();
    const capabilities = this.capabilities();
    if (!target || this.saving() || capabilities?.mode !== 'cognito' ||
      !capabilities[target.action]) return;
    if (target.action !== 'deactivate' && (target.user.status !== 'INACTIVE' || target.user.cognitoDeactivated)) return;
    if (target.action === 'deactivate' && (target.user.role === 'ADMIN' ||
      this.deactivationReason.trim().length < 5 || this.deactivationReason.trim().length > 500)) {
      this.errorMessage.set('Ingresá un motivo de entre 5 y 500 caracteres.');
      return;
    }
    this.saving.set(true);
    this.errorMessage.set(null);
    const request: Observable<unknown> = target.action === 'invite'
      ? this.usersApi.inviteCognito(target.user.id) : target.action === 'activate'
        ? this.usersApi.activateCognito(target.user.id)
        : this.usersApi.deactivateCognito(target.user.id, this.deactivationReason.trim());
    request.pipe(finalize(() => this.saving.set(false))).subscribe({ next: () => {
      this.lifecycleTarget.set(null);
      this.feedback.set(target.action === 'invite'
        ? 'Se solicitó la invitación. El usuario continúa inactivo; esto no confirma la entrega del correo.'
        : target.action === 'activate' ? 'Usuario activado correctamente.' : 'Usuario desactivado. La reactivación requiere un procedimiento separado.');
      this.load(true);
    }, error: (error: { error?: { message?: string } }) => {
      this.lifecycleTarget.set(null);
      if (target.action === 'deactivate') this.load(true);
      const message = error.error?.message ?? 'No se pudo completar la acción. Verificá el estado antes de reintentar.';
      this.errorMessage.set(target.action === 'deactivate'
        ? message + ' El usuario puede haber quedado bloqueado. Revisá el estado antes de reintentar.'
        : message);
    } });
  }
}
