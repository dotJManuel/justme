import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Icon } from '../icons/icon';

/** Encabezado de una pantalla interna: flecha para volver + título. */
@Component({
  selector: 'ui-page-header',
  imports: [Icon, RouterLink],
  template: `
    <a class="back" [routerLink]="back()" [attr.aria-label]="'Volver a ' + backLabel()"><app-icon name="chevron-left" [size]="22" /></a>
    <h1>{{ title() }}</h1>
    <span class="grow"></span>
    <ng-content />
  `,
  styles: `
    :host { display: flex; align-items: center; gap: 4px; }
    .back { display: grid; place-items: center; flex: none; width: var(--touch); height: var(--touch); margin-left: -8px; border-radius: var(--rf-2); color: var(--tx); }
    .back:hover { background: var(--s2); }
    h1 { font-size: 28px; line-height: 36px; font-weight: 700; letter-spacing: -0.02em; }
    .grow { flex: 1; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PageHeader {
  readonly title = input.required<string>();
  readonly back = input('/perfil');
  readonly backLabel = input('Perfil');
}
