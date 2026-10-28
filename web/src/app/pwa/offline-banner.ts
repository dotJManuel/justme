import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Icon } from '../icons/icon';
import { PwaService } from './pwa.service';

/** Franja que avisa que no hay conexión (la app abre, pero los datos y los guardados necesitan internet). */
@Component({
  selector: 'app-offline-banner',
  imports: [Icon],
  template: `
    @if (!pwa.online()) {
      <div class="bar" role="status">
        <app-icon name="alert" [size]="16" />
        <span>Sin conexión. Para ver o guardar tus datos hace falta internet.</span>
      </div>
    }
  `,
  styles: `
    :host { display: block; position: sticky; top: 0; z-index: 30; }
    .bar {
      display: flex; align-items: center; justify-content: center; gap: 8px; padding: 8px var(--sp-4); padding-top: calc(8px + env(safe-area-inset-top, 0px));
      background: var(--yls); color: var(--yl); box-shadow: inset 0 -1px 0 var(--yl); font-size: 13px; line-height: 18px; font-weight: 500; text-align: center;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OfflineBanner {
  protected readonly pwa = inject(PwaService);
}
