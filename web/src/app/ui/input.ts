import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';

let next = 0;

/** Campo de texto con etiqueta, ayuda y error: `<ui-input label="Monto" [(value)]="amount" [error]="err()" />`. */
@Component({
  selector: 'ui-input',
  template: `
    <label class="lbl" [for]="id">{{ label() }}</label>
    <input
      [id]="id"
      [type]="type()"
      [attr.inputmode]="inputmode()"
      [attr.placeholder]="placeholder() || null"
      [attr.autocomplete]="autocomplete()"
      [attr.aria-invalid]="error() ? 'true' : null"
      [attr.aria-describedby]="described()"
      [class.bad]="!!error()"
      [value]="value()"
      (input)="value.set($any($event.target).value)"
    />
    @if (error()) {
      <span class="msg err" [id]="id + '-e'" role="alert">{{ error() }}</span>
    } @else if (hint()) {
      <span class="msg" [id]="id + '-h'">{{ hint() }}</span>
    }
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
    .lbl { font-size: 13px; line-height: 16px; font-weight: 600; color: var(--tx2); }
    input {
      height: var(--touch); padding: 0 12px; border: 1px solid var(--bd2); border-radius: var(--rf-2);
      background: var(--sf); color: var(--tx); font: inherit; font-size: 15px; font-variant-numeric: tabular-nums; min-width: 0;
    }
    input::placeholder { color: var(--tx3); }
    input.bad { border-color: var(--rd); box-shadow: inset 0 0 0 0.5px var(--rd); }
    input:disabled { background: var(--s2); color: var(--tx3); }
    .msg { font-size: 12px; line-height: 16px; color: var(--tx2); }
    .err { color: var(--rd); font-weight: 500; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Input {
  protected readonly id = `ui-input-${next++}`;

  readonly label = input.required<string>();
  readonly value = model('');
  readonly type = input('text');
  readonly inputmode = input<string | null>(null);
  readonly placeholder = input('');
  readonly autocomplete = input<string | null>(null);
  readonly hint = input('');
  readonly error = input('');

  protected readonly described = computed(() => (this.error() ? `${this.id}-e` : this.hint() ? `${this.id}-h` : null));
}
