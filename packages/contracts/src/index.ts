export interface HealthResponse {
  readonly status: 'ok';
  readonly service: 'la-casa-del-material-api';
  readonly version: string;
  readonly environment: string;
}
