import { Component, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { COGNITO_ENROLLMENT } from '../../core/auth/cognito-enrollment.token';
import { AuthSessionService } from '../../core/auth/auth-session.service';

@Component({
  selector: 'lcm-totp-enrollment', imports: [FormsModule, RouterLink],
  template: `<main><h1>Configurar autenticador</h1>
    <p>Este paso no activa su usuario ni permite operar el sistema.</p>
    @if (!client) { <p>El enrolamiento no está habilitado.</p> }
    @else if (secret() || alreadyEnabled()) {
      @if (alreadyEnabled()) { <p>Ya existe un autenticador. No se reemplazará su clave. Puede finalizar la configuración pendiente.</p> }
      @else {
      <p>Ingrese esta clave en su aplicación autenticadora (TOTP). No la comparta.</p>
      <code>{{ secret() }}</code>
      }
      <form (ngSubmit)="complete()"><label>Código de seis dígitos
        <input name="code" [(ngModel)]="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required />
      </label><button [disabled]="busy()">Confirmar TOTP</button></form>
    } @else if (!done()) { <button (click)="begin()" [disabled]="busy()">Iniciar enrolamiento</button> }
    @if (done()) { <p>TOTP configurado. Su usuario continúa inactivo; la activación es un paso separado.</p> }
    <p role="status">{{ message() }}</p><a routerLink="/login">Volver al acceso</a>
  </main>`,
  styles: [`main{max-width:32rem;margin:3rem auto;padding:2rem;background:var(--surface);border-radius:1rem}
    label,input,button{display:block;margin:1rem 0}code{overflow-wrap:anywhere}`]
})
export class TotpEnrollmentComponent implements OnInit, OnDestroy {
  readonly client = inject(COGNITO_ENROLLMENT);
  private readonly session = inject(AuthSessionService);
  readonly secret = signal(''); readonly message = signal('');
  readonly busy = signal(false); readonly done = signal(false);
  readonly alreadyEnabled = signal(false);
  code = '';
  private token = '';
  private readonly abort = new AbortController();
  private timer?: ReturnType<typeof setTimeout>;
  async ngOnInit(): Promise<void> {
    this.session.clear();
    if (window.location.pathname !== '/auth/enrollment/callback') return;
    const callback = window.location.href;
    history.replaceState(null, '', '/auth/enrollment/callback');
    if (!this.client) return;
    this.busy.set(true);
    try {
      const token = await this.client.complete(callback);
      if (this.abort.signal.aborted) return;
      this.token = token;
      this.timer = setTimeout(() => { this.clear(); this.message.set('La sesión expiró. Inicie nuevamente.'); }, 600000);
      const result = await this.request('begin', {});
      if (typeof result['secretCode'] !== 'string' || !/^[A-Z2-7]{16,128}$/.test(result['secretCode'])) throw new Error();
      if (!this.abort.signal.aborted && this.token) this.secret.set(result['secretCode']);
    } catch (error: unknown) {
      if (error instanceof EnrollmentHttpError && error.status === 409 && this.token && !this.abort.signal.aborted) {
        this.alreadyEnabled.set(true);
      } else { this.clear(); this.message.set('No se pudo iniciar el enrolamiento. Ingrese nuevamente o solicite revisión.'); }
    }
    finally { this.busy.set(false); }
  }
  async begin(): Promise<void> {
    if (!this.client || this.busy()) return;
    this.busy.set(true);
    try { window.location.assign(await this.client.begin()); }
    catch { this.message.set('No se pudo iniciar el acceso.'); this.busy.set(false); }
  }
  async complete(): Promise<void> {
    if (this.busy() || !this.token || !/^[0-9]{6}$/.test(this.code)) return;
    this.busy.set(true);
    try {
      const result = await this.request('complete', { code: this.code });
      if (result['status'] !== 'MFA_CONFIGURED_NOT_ACTIVE') throw new Error();
      if (!this.abort.signal.aborted && this.token) { this.clear(); this.done.set(true); }
    } catch { this.message.set('No se pudo confirmar. Revise el código o reinicie el enrolamiento.'); }
    finally { this.code = ''; this.busy.set(false); }
  }
  private async request(step: 'begin' | 'complete', body: object): Promise<Record<string, unknown>> {
    const response = await fetch('/api/auth/enrollment/totp/' + step, { method: 'POST',
      credentials: 'omit', cache: 'no-store', redirect: 'error', signal: this.abort.signal,
      headers: { Authorization: 'Bearer ' + this.token, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!response.ok) throw new EnrollmentHttpError(response.status);
    const result: unknown = await response.json();
    if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error();
    return result as Record<string, unknown>;
  }
  private clear(): void { this.token = ''; this.secret.set(''); this.alreadyEnabled.set(false); this.code = ''; if (this.timer) clearTimeout(this.timer); }
  ngOnDestroy(): void { this.abort.abort(); this.clear(); this.client?.cancel(); }
}
class EnrollmentHttpError extends Error { constructor(readonly status: number) { super('Enrollment request failed'); } }
