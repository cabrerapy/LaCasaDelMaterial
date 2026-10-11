import { InjectionToken } from '@angular/core';
import type { CognitoPkce } from './cognito-pkce';

// Production bootstrap supplies validated public config; local remains unchanged.
export const COGNITO_LOGIN = new InjectionToken<CognitoPkce | null>('LCM Cognito login', {
  providedIn: 'root', factory: () => null
});
