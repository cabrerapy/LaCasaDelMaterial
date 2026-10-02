import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'lcm-forbidden',
  imports: [RouterLink],
  template: `
    <main class="page">
      <section>
        <img src="assets/brand/mascot-circle.png" alt="" width="88" height="88">
        <span aria-hidden="true">403</span>
        <h1>Acceso no autorizado</h1>
        <p>No tienes permisos para acceder a esta sección.</p>
        <a routerLink="/dashboard">Volver al Dashboard</a>
      </section>
    </main>
  `,
  styles: [`
    :host { display: block; min-height: 100vh; }
    .page { min-height: 100vh; display: grid; place-items: center; padding: 1.5rem; background: var(--background); }
    section { max-width: 30rem; padding: 2.5rem; border: 1px solid var(--color-border); border-radius: 1rem; background: var(--color-surface); text-align: center; box-shadow: 0 1rem 3rem var(--green-shadow-subtle); }
    img { display: block; margin: 0 auto .75rem; border-radius: 50%; }
    span { display: block; color: var(--lcm-gold-800); font-size: 3rem; font-weight: 900; }
    h1 { color: var(--color-text); }
    p { color: var(--text-secondary); }
    a { display: inline-block; margin-top: 1rem; padding: .8rem 1rem; border-radius: .6rem; background: var(--color-primary); color: var(--lcm-ink); text-decoration: none; font-weight: 800; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ForbiddenComponent {}
