import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';

export interface SegmentOption<T extends string = string> {
  value: T;
  label: string;
}

/** Control segmentado (Resumen / Tarjetas…). `pill` es la versión redonda de Racha. */
@Component({
  selector: 'ui-segmented',
  host: { role: 'radiogroup', '[attr.aria-label]': 'label()', '[class.pill]': "shape() === 'pill'" },
  template: `
    @for (o of options(); track o.value) {
      <button
        type="button"
        role="radio"
        [attr.aria-checked]="o.value === value()"
        [tabindex]="o.value === value() ? 0 : -1"
        [class.on]="o.value === value()"
        (click)="value.set(o.value)"
        (keydown)="key($event, o.value)"
      >{{ o.label }}</button>
    }
  `,
  styles: `
    :host { display: flex; gap: 4px; padding: 4px; border-radius: var(--rf-2); background: var(--s2); }
    :host(.pill) { border-radius: var(--rr-pill); }
    button {
      flex: 1 1 0; min-width: 0; min-height: var(--touch); padding: 0 6px; border: 0; border-radius: 7px; background: transparent;
      color: var(--tx2); font-size: 14px; font-weight: 500; cursor: pointer; white-space: nowrap;
    }
    :host(.pill) button { border-radius: var(--rr-pill); }
    button.on { background: var(--sf); color: var(--tx); font-weight: 600; box-shadow: var(--sh1); }
    :host(.pill) button.on { background: var(--orf); color: var(--ink); box-shadow: none; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Segmented {
  readonly options = input.required<SegmentOption[]>();
  readonly value = model('');
  readonly label = input('');
  readonly shape = input<'default' | 'pill'>('default');

  /** Flechas: pasa a la opción vecina, como en cualquier grupo de radios. */
  protected key(e: KeyboardEvent, current: string) {
    const dir = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const list = this.options();
    const i = list.findIndex((o) => o.value === current);
    const target = list[(i + dir + list.length) % list.length];
    this.value.set(target.value);
    queueMicrotask(() => (e.target as HTMLElement).parentElement?.querySelector<HTMLElement>('[tabindex="0"]')?.focus());
  }
}
