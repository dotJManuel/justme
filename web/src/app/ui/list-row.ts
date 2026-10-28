import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { Icon, IconName } from '../icons/icon';
import { MoneyTone, money } from './money';

/**
 * Fila de lista: ícono + título/subtítulo + monto. Varias filas seguidas se separan con una línea con sangría.
 * Con `interactive` es un botón (abre la edición); sin él, solo lectura.
 */
@Component({
  selector: 'ui-list-row',
  imports: [Icon, NgTemplateOutlet],
  template: `
    <ng-template #body>
      @if (icon()) {
        <span class="ico"><app-icon [name]="icon()!" [size]="18" /></span>
      }
      <span class="txt">
        <span class="t">{{ title() }}</span>
        @if (subtitle()) {
          <span class="s">{{ subtitle() }}</span>
        }
      </span>
      @if (shown(); as text) {
        <span class="amt num" [class.inc]="resolved() === 'income'" [class.exp]="resolved() === 'expense'">{{ text }}</span>
      }
      @if (interactive()) {
        <app-icon class="chev" name="chevron-right" [size]="16" />
      }
    </ng-template>
    @if (interactive()) {
      <button type="button" class="row" (click)="activated.emit()"><ng-container *ngTemplateOutlet="body" /></button>
    } @else {
      <div class="row"><ng-container *ngTemplateOutlet="body" /></div>
    }
  `,
  styles: `
    :host { display: block; position: relative; }
    :host(:not(:first-child))::before {
      content: ''; position: absolute; top: 0; right: 0; left: 62px; height: 1px; background: var(--bd);
    }
    .row {
      display: flex; align-items: center; gap: 12px; width: 100%; min-height: var(--touch); padding: 12px 14px;
      border: 0; background: transparent; color: inherit; font: inherit; text-align: left;
    }
    button.row { cursor: pointer; border-radius: inherit; }
    button.row:hover { background: var(--s2); }
    .ico { display: grid; place-items: center; flex: none; width: 36px; height: 36px; border-radius: 8px; background: var(--s2); color: var(--tx2); }
    .txt { display: flex; flex-direction: column; flex: 1; min-width: 0; }
    .t { font-size: 14px; line-height: 20px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .s { font-size: 12px; line-height: 16px; color: var(--tx2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .amt { font-size: 14px; line-height: 20px; font-weight: 600; flex: none; }
    .inc { color: var(--gr); }
    .exp { color: var(--rd); }
    .chev { color: var(--tx3); }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListRow {
  readonly icon = input<IconName | null>(null);
  readonly title = input.required<string>();
  readonly subtitle = input('');
  /** Monto con signo ($ y 2 decimales). Ingreso (+) en verde, gasto (−) en rojo, salvo que se fije `tone`. */
  readonly amount = input<number | null>(null);
  /** Texto en lugar del monto (por ejemplo "En 16 días"). */
  readonly amountText = input('');
  readonly tone = input<MoneyTone | 'auto'>('auto');
  readonly interactive = input(false);
  readonly activated = output<void>();

  protected readonly resolved = computed<MoneyTone>(() => {
    const t = this.tone();
    if (t !== 'auto') return t;
    const n = this.amount() ?? 0;
    return n > 0 ? 'income' : n < 0 ? 'expense' : 'neutral';
  });
  protected readonly shown = computed(() => this.amountText() || (this.amount() === null ? '' : money(this.amount()!, true)));
}
