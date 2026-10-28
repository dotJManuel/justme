import { ChangeDetectionStrategy, Component, inject, output } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { Icon } from '../icons/icon';
import { ThemeMode, ThemeService } from '../theme.service';
import { Button } from './button';
import { FINANZAS_SECTIONS, NAV_AFTER_ADD, NAV_BEFORE_ADD, NavDestination } from './nav.config';
import { Segmented } from './segmented';

/** Barra lateral de escritorio (≥ 1024 px): logo, "Agregar", destinos, subsecciones de Finanzas y selector de tema. */
@Component({
  selector: 'ui-sidebar',
  imports: [RouterLink, RouterLinkActive, Icon, Button, Segmented],
  template: `
    <div class="brand">
      <span class="logo"><app-icon name="check" [size]="18" [stroke]="2.4" /></span>
      <span class="name">JustMe</span>
    </div>
    <button uiBtn block type="button" (click)="add.emit()"><app-icon name="plus" [size]="18" [stroke]="2.2" />Agregar</button>
    <nav aria-label="Principal">
      @for (d of destinations; track d.path) {
        <a class="dest" [routerLink]="d.path" routerLinkActive="on" [routerLinkActiveOptions]="{ exact: !!d.exact }" ariaCurrentWhenActive="page">
          <app-icon [name]="d.icon" [size]="20" />{{ d.label }}
        </a>
        @if (d.path === '/finanzas') {
          <div class="subs">
            @for (s of sections; track s.path) {
              <a [routerLink]="s.path" routerLinkActive="on" ariaCurrentWhenActive="page">{{ s.label }}</a>
            }
          </div>
        }
      }
    </nav>
    <span class="grow"></span>
    <ui-segmented label="Tema" [options]="themes" [value]="theme.mode()" (valueChange)="theme.set($any($event))" />
  `,
  styles: `
    :host {
      display: none; position: sticky; top: 0; flex: none; width: 240px; height: 100dvh; flex-direction: column; gap: var(--sp-5);
      padding: var(--sp-5) var(--sp-4); background: var(--sf); box-shadow: inset -1px 0 0 var(--bd);
    }
    @media (min-width: 1024px) { :host { display: flex; } }
    .brand { display: flex; align-items: center; gap: 10px; padding: 0 8px; }
    .logo { display: grid; place-items: center; width: 32px; height: 32px; border-radius: var(--rf-2); background: var(--ac); color: var(--onac); }
    .name { font-size: 18px; font-weight: 700; letter-spacing: -0.01em; }
    nav { display: flex; flex-direction: column; gap: 2px; }
    .dest {
      display: flex; align-items: center; gap: 12px; height: var(--touch); padding: 0 12px; border-radius: var(--rf-2);
      color: var(--tx2); font-size: 14px; font-weight: 500; text-decoration: none;
    }
    .dest:hover { background: var(--s2); }
    .dest.on { background: var(--acs); color: var(--ac); font-weight: 700; }
    .subs { display: flex; flex-direction: column; gap: 2px; padding: 4px 0 4px 44px; }
    .subs a {
      display: flex; align-items: center; height: 36px; padding: 0 12px; border-radius: 8px;
      color: var(--tx2); font-size: 14px; text-decoration: none;
    }
    .subs a:hover { background: var(--s2); }
    .subs a.on { background: var(--s2); color: var(--tx); font-weight: 600; }
    .grow { flex: 1; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Sidebar {
  protected readonly theme = inject(ThemeService);
  protected readonly destinations: NavDestination[] = [...NAV_BEFORE_ADD, ...NAV_AFTER_ADD];
  protected readonly sections = FINANZAS_SECTIONS;
  protected readonly themes: { value: ThemeMode; label: string }[] = [
    { value: 'light', label: 'Claro' },
    { value: 'dark', label: 'Oscuro' },
    { value: 'auto', label: 'Auto' },
  ];
  readonly add = output<void>();
}
