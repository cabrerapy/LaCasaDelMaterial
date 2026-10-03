import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { ReportQuery, ReportResponse, ReportType, ReportsHubResponse } from '@lcm/contracts';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class ReportsApiService {
  private readonly http = inject(HttpClient);

  hub(): Observable<ReportsHubResponse> { return this.http.get<ReportsHubResponse>('/api/reports'); }
  report(type: ReportType, query: ReportQuery): Observable<ReportResponse> {
    return this.http.get<ReportResponse>(`/api/reports/${type}`, { params: params(query) });
  }
  export(type: ReportType, query: ReportQuery): Observable<Blob> {
    return this.http.get(`/api/reports/${type}/export`, { params: params(query), responseType: 'blob' });
  }
}

function params(query: ReportQuery): HttpParams {
  let result = new HttpParams();
  for (const [key, value] of Object.entries(query)) if (value !== undefined && value !== '') result = result.set(key, String(value));
  return result;
}
