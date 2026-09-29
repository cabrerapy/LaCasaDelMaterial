import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  USER_ROLES,
  USER_ROLE_LABELS,
  type CreateUserRequest,
  type UserResponse,
  type UserRole,
  type UserStatus
} from '@lcm/contracts';
import { finalize } from 'rxjs';
import { UsersApiService } from './users-api.service';

type FormMode = 'create' | 'edit';

@Component({
  selector: 'lcm-users',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './users.component.html',
  styleUrl: './users.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class UsersComponent {
  private readonly usersApi = inject(UsersApiService);
  private readonly formBuilder = inject(NonNullableFormBuilder);

  readonly users = signal<readonly UserResponse[]>([]);
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
    this.form.reset({ name: '', username: '', email: '', password: '', role: 'CASHIER' });
    this.form.controls.username.enable();
    this.form.controls.password.enable();
    this.selectedUserId.set(null);
    this.formMode.set('create');
    this.errorMessage.set(null);
  }

  openEdit(user: UserResponse): void {
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
    if (this.form.invalid || !this.formMode()) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.errorMessage.set(null);
    const value = this.form.getRawValue();
    const request = this.formMode() === 'create'
      ? this.usersApi.create(value as CreateUserRequest)
      : this.usersApi.update(this.selectedUserId() ?? '', {
          name: value.name,
          email: value.email,
          role: value.role
        });
    request.pipe(finalize(() => this.saving.set(false))).subscribe({
      next: () => {
        this.formMode.set(null);
        this.load(true);
      },
      error: (error: { error?: { message?: string } }) =>
        this.errorMessage.set(error.error?.message ?? 'No fue posible guardar el usuario.')
    });
  }

  requestStatusChange(user: UserResponse): void {
    this.statusTarget.set(user);
  }

  cancelStatusChange(): void {
    this.statusTarget.set(null);
  }

  confirmStatusChange(): void {
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
}
