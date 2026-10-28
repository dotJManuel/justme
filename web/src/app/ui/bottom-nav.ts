import { ChangeDetectionStrategy, Component, output } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { Icon } from '../icons/icon';
import { NAV_AFTER_ADD, NAV_BEFORE_ADD } from './nav.config';

/** Barra inferior fija (móvil): 4 destinos y el "+" al centro. En escritorio la reemplaza la barra lateral. */
@Component({
  selector: 'ui-bottom-nav',
  imports: [RouterLink, RouterLinkActive, Icon],
  template: `
    <nav aria-label="Principal">
      @for (d of before; track d.path) {
        <a [routerLink]="d.path" routerLinkActive="on" [routerLinkActiveOptions]="{ exact: !!d.exact }" ariaCurrentWhenActive="page">
          <app-icon [name]="d.icon" [size]="22" />{{ d.label }}
        </a>
      }
      <span class="mid"><button type="button" class="add" aria-label="Agregar" (click)="add.emit()"><app-icon name="plus" [size]="24" [stroke]="2.2" /></button></span>
      @for (d of after; track d.path) {
        <a [routerLink]="d.path" routerLinkActive="on" [routerLinkActiveOptions]="{ exact: !!d.exact }" ariaCurrentWhenActive="page">
          <app-icon [name]="d.icon" [size]="22" />{{ d.label }}
        </a>
      }
    </nav>
  `,
  styles: `
    :host {
      position: fixed; z-index: 40; left: 0; right: 0; bottom: 0; background: var(--sf); box-shadow: 0 -1px 0 var(--bd);
      padding: 0 max(8px, env(safe-area-inset-right, 0px)) var(--safe-b) max(8px, env(safe-area-inset-left, 0px));
    }
    @media (min-width: 1024px) { :host { display: none; } }
    nav { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); align-items: center; height: var(--nav-h); }
    a {
      display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; min-height: var(--touch); height: 100%;
      color: var(--tx2); font-size: 11px; line-height: 14px; font-weight: 500; text-decoration: none;
    }
    a.on { color: var(--ac); font-weight: 600; }
    .mid { display: flex; justify-content: center; }
    .add {
      display: grid; place-items: center; width: 52px; height: 52px; border: 0; border-radius: 18px;
      background: var(--ac); color: var(--onac); cursor: pointer; transition: transform 0.1s, background-color 0.15s;
    }
    .add:hover { background: var(--ach); }
    .add:active { transform: scale(0.95); }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BottomNav {
  protected readonly before = NAV_BEFORE_ADD;
  protected readonly after = NAV_AFTER_ADD;
  readonly add = output<void>();
}
