import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TripsApiService } from './trips-api.service';

describe('Evidence downloads', () => {
  let service: TripsApiService;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(TripsApiService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('preserves the authenticated local blob download', async () => {
    const result = firstValueFrom(service.evidenceFile('evidence'));
    http.expectOne('/api/delivery-evidence/evidence/download').flush({ kind: 'local' });
    const file = http.expectOne('/api/delivery-evidence/evidence/file');
    expect(file.request.responseType).toBe('blob');
    const blob = new Blob(['fixture']);
    file.flush(blob);
    expect(await result).toBe(blob);
  });

  it('returns a signed URL without sending an HttpClient request to S3', async () => {
    const result = firstValueFrom(service.evidenceFile('evidence'));
    const url = 'https://evidence.s3.amazonaws.com/file?signature=fixture';
    http.expectOne('/api/delivery-evidence/evidence/download').flush({ kind: 'signed', url });
    expect(await result).toBe(url);
    http.expectNone(url);
  });

  it.each(['http://example.com/file', 'javascript:alert(1)', 'https://user:secret@example.com/file', 'invalid'])('rejects unsafe URL %s', async url => {
    const result = firstValueFrom(service.evidenceFile('evidence'));
    const rejected = expect(result).rejects.toThrow('Invalid evidence download');
    http.expectOne('/api/delivery-evidence/evidence/download').flush({ kind: 'signed', url });
    await rejected;
  });
});
