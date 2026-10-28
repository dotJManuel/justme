import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { Icon, IconName } from '../icons/icon';
import { Button } from './button';

/** Esqueleto con la forma del contenido que va a llegar (no hay spinners). */
@Component({
  selector: 'ui-skeleton',
  host: {
    'aria-hidden': 'true',
    '[style.width]': 'width()',
    '[style.height]': 'height()',
    '[style.border-radius]': "circle() ? '50%' : radius()",
  },
  template: '',
  styles: `
    :host {
      display: block; max-width: 100%; background: linear-gradient(90deg, var(--s2) 25%, var(--s3) 50%, var(--s2) 75%);
      background-size: 200% 100%; animation: shimmer 1.4s linear infinite;
    }
    @keyframes shimmer { to { background-position: -200% 0; } }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Skeleton {
  readonly width = input('100%');
  readonly height = input('16px');
  readonly radius = input('8px');
  readonly circle = input(false);
}

/** Vacío: ícono + título + una frase + una acción principal (el botón va dentro de la etiqueta). */
@Component({
  selector: 'ui-empty-state',
  imports: [Icon],
  template: `
    <span class="ico"><app-icon [name]="icon()" [size]="24" /></span>
    <h3>{{ title() }}</h3>
    @if (text()) {
      <p>{{ text() }}</p>
    }
    <div class="act"><ng-content /></div>
  `,
  styles: `
    :host { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: var(--sp-6) var(--sp-4); text-align: center; }
    .ico { display: grid; place-items: center; width: 56px; height: 56px; border-radius: 50%; background: var(--s2); color: var(--tx2); }
    h3 { margin-top: 4px; font-size: 16px; line-height: 24px; font-weight: 600; }
    p { max-width: 320px; font-size: 14px; line-height: 20px; color: var(--tx2); }
    .act { margin-top: 8px; }
    .act:empty { display: none; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmptyState {
  readonly icon = input<IconName>('search');
  readonly title = input.required<string>();
  readonly text = input('');
}

/**
 * Error con "Reintentar". `inline` es el aviso de una franja (sobre lo que ya está en pantalla); sin él ocupa
 * el lugar del contenido. Nunca borra lo que la persona ya capturó: eso lo decide quien lo usa.
 */
@Component({
  selector: 'ui-error-state',
  imports: [Icon, Button],
  host: { role: 'alert', '[class.inline]': 'inline()' },
  template: `
    <app-icon name="alert" [size]="inline() ? 18 : 24" />
    <div class="txt">
      <b>{{ message() }}</b>
      @if (detail()) {
        <span>{{ detail() }}</span>
      }
    </div>
    <button uiBtn [variant]="inline() ? 'ghost' : 'secondary'" [small]="inline()" type="button" (click)="retry.emit()">Reintentar</button>
  `,
  styles: `
    :host { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: var(--sp-6) var(--sp-4); text-align: center; color: var(--rd); }
    .txt { display: flex; flex-direction: column; gap: 2px; }
    b { font-size: 16px; line-height: 24px; font-weight: 600; color: var(--tx); }
    span { font-size: 14px; line-height: 20px; color: var(--tx2); }
    :host(.inline) {
      flex-direction: row; align-items: center; gap: 10px; padding: 8px 8px 8px 14px; text-align: left;
      border-radius: var(--rf-3); background: var(--rds); box-shadow: inset 0 0 0 1px var(--rd);
    }
    :host(.inline) .txt { flex: 1; }
    :host(.inline) b { font-size: 14px; line-height: 20px; font-weight: 500; color: var(--rd); }
    :host(.inline) button { color: var(--rd); }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ErrorState {
  readonly message = input('No se pudo cargar');
  readonly detail = input('');
  readonly inline = input(false);
  readonly retry = output<void>();
}
