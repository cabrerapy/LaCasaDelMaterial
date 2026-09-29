import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LoginResponse } from '@lcm/contracts';
import { AuthService } from '../../core/auth/auth.service';
import { LoginComponent } from './login.component';

describe('LoginComponent', () => {
  let component: LoginComponent;
  const response: LoginResponse = {
    accessToken: 'token',
    user: {
      id: 'user-id',
      name: 'Administrador',
      username: 'admin',
      email: 'admin@lacasadelmaterial.local',
      role: 'ADMIN'
    }
  };
  const auth = { login: vi.fn() };
  const router = { navigate: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: auth },
        { provide: Router, useValue: router }
      ]
    });
    component = TestBed.runInInjectionContext(() => new LoginComponent());
  });

  it('does not submit invalid fields', () => {
    component.submit();
    expect(auth.login).not.toHaveBeenCalled();
  });

  it('submits valid credentials and navigates to dashboard', () => {
    auth.login.mockReturnValue(of(response));
    component.form.setValue({ username: 'admin', password: 'secret' });
    component.submit();

    expect(auth.login).toHaveBeenCalledWith({ username: 'admin', password: 'secret' });
    expect(router.navigate).toHaveBeenCalledWith(['/dashboard']);
  });
});
