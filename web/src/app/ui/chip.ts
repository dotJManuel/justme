import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type ChipTone = 'neutral' | 'orange' | 'green' | 'red' | 'yellow' | 'accent';

/**
 * Chip. Con `interactive` es un botón de filtro (`selected` lo marca); sin él es una etiqueta de estado.
 * Los tonos de color sirven a un solo significado: naranja = racha, verde/rojo = ingreso/gasto, amarillo = alerta.
 */
@Component({
  selector: 'ui-chip',
  imports: [NgTemplateOutlet],
  host: { '[class]': "'tone-' + tone()" },
  template: `
    <ng-template #content><ng-content /></ng-template>
    @if (interactive()) {
      <button type="button" class="c" [class.sel]="selected()" [attr.aria-pressed]="selected()"><ng-container *ngTemplateOutlet="content" /></button>
    } @else {
      <span class="c"><ng-container *ngTemplateOutlet="content" /></span>
    }
  `,
  styles: `
    :host { display: inline-flex; }
    .c {
      display: inline-flex; align-items: center; gap: 6px; padding: 0 12px; min-height: 28px; border: 0; border-radius: var(--rr-pill);
      font: inherit; font-size: 13px; line-height: 16px; font-weight: 600; white-space: nowrap;
      background: var(--s2); color: var(--tx2);
    }
    :host(.tone-orange) .c { background: var(--ors); color: var(--or); }
    :host(.tone-green) .c { background: var(--grs); color: var(--gr); }
    :host(.tone-red) .c { background: var(--rds); color: var(--rd); }
    :host(.tone-yellow) .c { background: var(--yls); color: var(--yl); }
    :host(.tone-accent) .c { background: var(--acs); color: var(--ac); }
    /* Filtro: 36 px de alto (la zona táctil de 44 la da el margen vertical del contenedor) */
    button.c { position: relative; min-height: 36px; padding: 0 14px; border-radius: 8px; font-size: 14px; font-weight: 500; background: var(--sf); box-shadow: inset 0 0 0 1px var(--bd); cursor: pointer; }
    button.c::after { content: ""; position: absolute; inset: -4px 0; }
    button.c.sel { background: var(--tx); color: var(--bg); font-weight: 600; box-shadow: none; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Chip {
  readonly tone = input<ChipTone>('neutral');
  readonly interactive = input(false);
  readonly selected = input(false);
}
