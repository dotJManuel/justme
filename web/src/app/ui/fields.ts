import { ChangeDetectionStrategy, Component, input, model, output } from '@angular/core';

let next = 0;

export interface Option<T extends string = string> {
  value: T;
  label: string;
}

/** Lista desplegable nativa con etiqueta (en celular abre su selector del sistema). */
@Component({
  selector: 'ui-select',
  template: `
    <label class="lbl" [for]="id">{{ label() }}</label>
    <select [id]="id" [value]="value()" [disabled]="disabled()" (change)="value.set($any($event.target).value)">
      @if (placeholder()) {
        <option value="">{{ placeholder() }}</option>
      }
      @for (o of options(); track o.value) {
        <option [value]="o.value" [selected]="o.value === value()">{{ o.label }}</option>
      }
    </select>
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
    .lbl { font-size: 13px; line-height: 16px; font-weight: 600; color: var(--tx2); }
    select {
      height: var(--touch); padding: 0 12px; border: 1px solid var(--bd2); border-radius: var(--rf-2);
      background: var(--sf); color: var(--tx); font: inherit; font-size: 15px; min-width: 0;
    }
    select:disabled { background: var(--s2); color: var(--tx3); }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Select {
  protected readonly id = `ui-select-${next++}`;
  readonly label = input.required<string>();
  readonly options = input.required<Option[]>();
  readonly value = model('');
  readonly placeholder = input('');
  readonly disabled = input(false);
}

/** Grupo de opciones en cuadrícula (Pagar con · BBVA / Santander / Gasto fijo; meses sin intereses). Una sola elegida. */
@Component({
  selector: 'ui-choice',
  template: `
    <fieldset>
      <legend>{{ label() }}</legend>
      <div class="grid" [style.grid-template-columns]="columns()">
        @for (o of options(); track o.value) {
          <button type="button" [class.on]="o.value === value()" [attr.aria-pressed]="o.value === value()" (click)="value.set(o.value)">{{ o.label }}</button>
        }
      </div>
    </fieldset>
  `,
  styles: `
    :host { display: block; min-width: 0; }
    fieldset { margin: 0; padding: 0; border: 0; min-width: 0; }
    legend { padding: 0; margin-bottom: 8px; font-size: 13px; line-height: 16px; font-weight: 600; color: var(--tx2); }
    .grid { display: grid; gap: 8px; }
    button {
      min-height: var(--touch); padding: 0 8px; border: 0; border-radius: var(--rf-2); background: var(--sf); color: var(--tx);
      font: inherit; font-size: 14px; font-weight: 500; box-shadow: inset 0 0 0 1px var(--bd2); cursor: pointer;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    button:hover { background: var(--s2); }
    button.on { background: var(--acs); color: var(--ac); font-weight: 700; box-shadow: inset 0 0 0 2px var(--ac); }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Choice {
  readonly label = input.required<string>();
  readonly options = input.required<Option[]>();
  readonly value = model('');
  /** Plantilla de columnas CSS; por defecto, columnas iguales (hasta 3 por fila). */
  readonly columns = input('repeat(auto-fit, minmax(96px, 1fr))');
}

/** Monto grande y centrado, el protagonista de la hoja de captura. */
@Component({
  selector: 'ui-amount',
  template: `
    <label class="lbl" [for]="id">{{ label() }}</label>
    <div class="box" [class.bad]="!!error()">
      <span class="cur" aria-hidden="true">$</span>
      <input
        [id]="id" inputmode="decimal" placeholder="0.00" autocomplete="off"
        [attr.aria-invalid]="error() ? 'true' : null" [value]="value()" (input)="value.set($any($event.target).value)"
      />
    </div>
    @if (error()) {
      <span class="err" role="alert">{{ error() }}</span>
    }
  `,
  styles: `
    :host { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 6px 0; }
    .lbl { font-size: 13px; line-height: 16px; font-weight: 600; color: var(--tx2); }
    .box { display: flex; align-items: baseline; justify-content: center; gap: 2px; width: 100%; border-radius: var(--rf-2); }
    .cur, input { font-size: 44px; line-height: 52px; font-weight: 700; letter-spacing: -0.03em; font-variant-numeric: tabular-nums; color: var(--tx); }
    .cur { color: var(--tx3); }
    input { min-width: 2ch; max-width: 100%; border: 0; background: transparent; font-family: inherit; text-align: left; padding: 0; field-sizing: content; }
    @supports not (field-sizing: content) { input { width: 8ch; text-align: center; } }
    input::placeholder { color: var(--tx3); }
    input:focus-visible { box-shadow: none; outline: none; }
    .box:focus-within { box-shadow: var(--focus); }
    .err { font-size: 12px; color: var(--rd); font-weight: 500; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Amount {
  protected readonly id = `ui-amount-${next++}`;
  readonly label = input('Monto');
  readonly value = model('');
  readonly error = input('');
}

/** Interruptor (activar / desactivar). El nombre accesible va en `label`. */
@Component({
  selector: 'ui-switch',
  template: `
    <button type="button" role="switch" [attr.aria-checked]="checked()" [attr.aria-label]="label()" [disabled]="disabled()" (click)="toggled.emit(!checked())">
      <span class="knob"></span>
    </button>
  `,
  styles: `
    :host { display: inline-flex; flex: none; }
    button {
      position: relative; width: 52px; height: var(--touch); padding: 0; border: 0; background: none; cursor: pointer;
    }
    button::before {
      content: ''; position: absolute; left: 0; top: 50%; width: 44px; height: 26px; margin-top: -13px; border-radius: 999px;
      background: var(--s3); box-shadow: inset 0 0 0 1px var(--bd2); transition: background-color 0.15s;
    }
    .knob {
      position: absolute; left: 3px; top: 50%; width: 20px; height: 20px; margin-top: -10px; border-radius: 50%; background: var(--sf);
      box-shadow: var(--sh1); transition: transform 0.15s;
    }
    button[aria-checked='true']::before { background: var(--ac); box-shadow: none; }
    button[aria-checked='true'] .knob { transform: translateX(18px); background: var(--onac); }
    button:disabled { opacity: 0.5; cursor: default; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Switch {
  readonly checked = input(false);
  readonly label = input.required<string>();
  readonly disabled = input(false);
  /** Lo que se pidió (el nuevo valor): quien lo recibe guarda y, si sale bien, cambia `checked`. */
  readonly toggled = output<boolean>();
}
