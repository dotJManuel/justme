import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Icon } from '../icons/icon';
import { Logo } from './logo';

/** Barra superior de móvil: la marca y el acceso a Perfil (que ya no está en la barra inferior). Se va con el scroll. */
@Component({
  selector: 'ui-top-bar',
  imports: [Icon, Logo, RouterLink],
  template: `
    <span class="brand"><ui-logo [size]="28" /><span class="name">JustMe</span></span>
    <a class="user" routerLink="/perfil" aria-label="Perfil"><app-icon name="user" [size]="22" /></a>
  `,
  styles: `
    :host { display: flex; align-items: center; justify-content: space-between; min-height: 52px; padding: 4px var(--sp-4) 0; }
    @media (min-width: 1024px) { :host { display: none; } }
    .brand { display: flex; align-items: center; gap: 8px; }
    .name { font-size: 17px; font-weight: 700; letter-spacing: -0.01em; }
    .user {
      display: grid; place-items: center; width: var(--touch); height: var(--touch); margin-right: -8px; border-radius: 50%;
      background: var(--s2); color: var(--tx2); text-decoration: none;
    }
    .user:hover { background: var(--s3); color: var(--tx); }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TopBar {}
