import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type {
  CreateUserRequest,
  UpdateUserRequest,
  UserResponse,
  UsersPageResponse,
  UserStatus
} from '@lcm/contracts';
import type { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class UsersApiService {
  private readonly http = inject(HttpClient);

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
