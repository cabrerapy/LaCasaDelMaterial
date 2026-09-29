import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { HealthResponse } from '@lcm/contracts';
import type { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class HealthService {
  private readonly http = inject(HttpClient);

  check(): Observable<HealthResponse> {
    return this.http.get<HealthResponse>('/api/health');
  }
}
