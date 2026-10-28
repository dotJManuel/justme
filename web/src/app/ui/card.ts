import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Tarjeta contenedora. `shape="racha"` usa el radio redondo (20); `tone="racha"` pinta el fondo suave naranja
 * y `tone="ok"` el verde de "hecho". Sin `padded` el contenido llega hasta el borde (para listas).
 */
@Component({
  selector: 'ui-card',
  host: {
    '[class.racha]': "shape() === 'racha'",
    '[class.tone-racha]': "tone() === 'racha'",
    '[class.tone-ok]': "tone() === 'ok'",
    '[class.padded]': 'padded()',
  },
  template: '<ng-content />',
  styles: `
    :host { display: block; min-width: 0; border-radius: var(--rf-3); background: var(--sf); box-shadow: var(--sh1), inset 0 0 0 1px var(--bd); }
    :host(.racha) { border-radius: var(--rr-2); }
    :host(.padded) { padding: var(--sp-4); }
    :host(.tone-racha) { background: var(--ors); box-shadow: inset 0 0 0 1px var(--orf); }
    :host(.tone-ok) { background: var(--grs); box-shadow: inset 0 0 0 1px var(--grf); }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Card {
  readonly shape = input<'fin' | 'racha'>('fin');
  readonly tone = input<'default' | 'racha' | 'ok'>('default');
  readonly padded = input(true);
}
