import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';
import { COGNITO_LOGIN } from './app/core/auth/cognito-login.token';
import { loadRuntimeLogin } from './app/core/auth/runtime-config';

loadRuntimeLogin(sessionStorage, window.location.origin).then(cognito =>
  bootstrapApplication(AppComponent, {
    ...appConfig, providers: [...appConfig.providers, { provide: COGNITO_LOGIN, useValue: cognito }]
  })
).catch(() => {
  // Fail closed: a missing/invalid Cognito config must not enable local login.
  const root = document.querySelector('lcm-root');
  if (root) root.textContent = 'No pudimos iniciar la aplicación. Verifique la configuración y vuelva a cargar la página.';
  console.error('Application startup failed');
});
