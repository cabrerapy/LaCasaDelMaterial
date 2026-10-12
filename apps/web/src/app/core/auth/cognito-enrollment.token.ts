import { InjectionToken } from '@angular/core';
import type { CognitoPkce } from './cognito-pkce';

export const COGNITO_ENROLLMENT = new InjectionToken<CognitoPkce | null>('LCM Cognito enrollment', {
  providedIn: 'root', factory: () => null
});
