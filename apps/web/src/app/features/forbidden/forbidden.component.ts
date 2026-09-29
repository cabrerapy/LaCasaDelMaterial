import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'lcm-forbidden',
  imports: [RouterLink],
  template: `
    <main class="page">
      <section>
        <span aria-hidden="true">403</span>
        <h1>Acceso no autorizado</h1>
        <p>No tienes permisos para acceder a esta sección.</p>
        <a routerLink="/dashboard">Volver al Dashboard</a>
      </section>
    </main>
  `,
  styles: [`
    :host { display: block; min-height: 100vh; }
    .page { min-height: 100vh; display: grid; place-items: center; padding: 1.5rem; background: #f3f5f1; }
    section { max-width: 30rem; padding: 2.5rem; border-radius: 1rem; background: #fff; text-align: center; box-shadow: 0 1rem 3rem rgb(23 60 42 / 12%); }
    span { color: #d7a92f; font-size: 3rem; font-weight: 900; }
    h1 { color: #173c2a; }
    p { color: #657169; }
    a { display: inline-block; margin-top: 1rem; padding: .8rem 1rem; border-radius: .6rem; background: #1f5136; color: #fff; text-decoration: none; font-weight: 700; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ForbiddenComponent {}
