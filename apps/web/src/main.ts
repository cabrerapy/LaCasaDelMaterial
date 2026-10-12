import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';
import { COGNITO_LOGIN } from './app/core/auth/cognito-login.token';
import { loadRuntimeAuth } from './app/core/auth/runtime-config';
import { COGNITO_ENROLLMENT } from './app/core/auth/cognito-enrollment.token';

loadRuntimeAuth(sessionStorage, window.location.origin).then(config =>
  bootstrapApplication(AppComponent, {
    ...appConfig, providers: [...appConfig.providers, { provide: COGNITO_LOGIN, useValue: config.login },
      { provide: COGNITO_ENROLLMENT, useValue: config.enrollment }]
  })
).catch(() => {
  // Fail closed: a missing/invalid Cognito config must not enable local login.
  const root = document.querySelector('lcm-root');
  if (root) root.textContent = 'No pudimos iniciar la aplicación. Verifique la configuración y vuelva a cargar la página.';
  console.error('Application startup failed');
});
