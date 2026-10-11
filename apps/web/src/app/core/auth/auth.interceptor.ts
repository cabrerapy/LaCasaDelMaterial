import type { HttpInterceptorFn } from '@angular/common/http';
import { HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthSessionService } from './auth-session.service';

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const session = inject(AuthSessionService);
  const router = inject(Router);
  const token = session.token;
  const isApplicationApi = request.url === '/api' || request.url.startsWith('/api/');
  const authenticatedRequest = token && isApplicationApi
    ? request.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : request;

  return next(authenticatedRequest).pipe(
    catchError((error: unknown) => {
      if (
        error instanceof HttpErrorResponse &&
        error.status === 401 &&
        isApplicationApi &&
        !request.url.endsWith('/api/auth/login')
      ) {
        session.clear();
        void router.navigate(['/login']);
      }
      return throwError(() => error);
    })
  );
};
