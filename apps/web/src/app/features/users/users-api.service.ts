import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type {
  CreateUserRequest,
  UpdateUserRequest,
  UserResponse,
  UsersPageResponse,
  UserStatus
} from '@lcm/contracts';
import type { UsersCapabilitiesResponse } from '@lcm/contracts';
import type { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class UsersApiService {
  private readonly http = inject(HttpClient);

  capabilities(): Observable<UsersCapabilitiesResponse> {
    return this.http.get<UsersCapabilitiesResponse>('/api/users/capabilities');
  }

  stageCognito(input: Omit<CreateUserRequest, 'password'>): Observable<{ userId: string; status: 'INACTIVE' }> {
    const { name, username, email, role } = input;
    return this.http.post<{ userId: string; status: 'INACTIVE' }>('/api/users/cognito', { name, username, email, role });
  }

  inviteCognito(id: string): Observable<{ userId: string; status: 'INACTIVE'; invitation: 'REQUESTED' }> {
    return this.http.post<{ userId: string; status: 'INACTIVE'; invitation: 'REQUESTED' }>(
      `/api/users/cognito/${id}/invitation`, {});
  }

  activateCognito(id: string): Observable<{ userId: string; status: 'ACTIVE' }> {
    return this.http.post<{ userId: string; status: 'ACTIVE' }>(`/api/users/cognito/${id}/activation`, {});
  }

  deactivateCognito(id: string, reason: string): Observable<{ userId: string; status: 'INACTIVE' }> {
    return this.http.post<{ userId: string; status: 'INACTIVE' }>(`/api/users/cognito/${id}/deactivation`, { reason });
  }

  list(pageSize = 25, nextToken?: string): Observable<UsersPageResponse> {
    let params = new HttpParams().set('pageSize', pageSize);
    if (nextToken) {
      params = params.set('nextToken', nextToken);
    }
    return this.http.get<UsersPageResponse>('/api/users', { params });
  }

  create(input: CreateUserRequest): Observable<UserResponse> {
    return this.http.post<UserResponse>('/api/users', input);
  }

  update(id: string, input: UpdateUserRequest): Observable<UserResponse> {
    return this.http.patch<UserResponse>(`/api/users/${id}`, input);
  }

  updateStatus(id: string, status: UserStatus): Observable<UserResponse> {
    return this.http.patch<UserResponse>(`/api/users/${id}/status`, { status });
  }
}
