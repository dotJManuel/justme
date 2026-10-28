import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

/** Marco de Racha: título, el selector Hoy / Logros (en píldora) y la pantalla elegida. */
@Component({
  selector: 'app-racha-page',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  template: `
    <div class="page">
      <header>
        <h1>Racha</h1>
        <nav class="pill" aria-label="Secciones de Racha">
          <a routerLink="/racha" routerLinkActive="on" [routerLinkActiveOptions]="{ exact: true }" ariaCurrentWhenActive="page">Hoy</a>
          <a routerLink="/racha/logros" routerLinkActive="on" ariaCurrentWhenActive="page">Logros</a>
        </nav>
      </header>
      <router-outlet />
    </div>
  `,
  styles: `
    :host { display: block; }
    .page { display: flex; flex-direction: column; gap: var(--sp-4); max-width: 1160px; margin: 0 auto; padding: var(--sp-5) var(--sp-4) var(--sp-6); }
    @media (min-width: 1024px) { .page { padding: var(--sp-6) var(--sp-5) var(--sp-7); gap: 20px; } }
    header { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-4); }
    h1 { font-size: 28px; line-height: 36px; font-weight: 700; letter-spacing: -0.02em; }
    .pill { display: flex; gap: 4px; padding: 4px; border-radius: var(--rr-pill); background: var(--s2); }
    a {
      display: flex; align-items: center; min-height: var(--touch); padding: 0 16px; border-radius: var(--rr-pill);
      color: var(--tx2); font-size: 14px; font-weight: 500; text-decoration: none;
    }
    a.on { background: var(--sf); color: var(--tx); font-weight: 600; box-shadow: var(--sh1); }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RachaPage {}
