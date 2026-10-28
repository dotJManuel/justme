import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';
import { plain } from '../finanzas/finanzas.calc';
import { Concept } from '../finanzas/finanzas.models';
import { Input } from '../ui/input';

/** Máximo de sugerencias que se muestran bajo el campo. */
const MAX = 5;

/**
 * Concepto: se escribe libremente y debajo salen, como atajos, los conceptos del catálogo que coinciden (sin
 * escribir nada, los primeros). Al guardar, `resolveConcept` decide si el texto es uno del catálogo o texto libre.
 */
@Component({
  selector: 'app-concept-input',
  imports: [Input],
  template: `
    <ui-input [label]="label()" [placeholder]="placeholder()" [error]="error()" [(value)]="text" autocomplete="off" />
    @if (suggestions().length) {
      <div class="sug" role="group" aria-label="Sugerencias de concepto">
        @for (c of suggestions(); track c.id) {
          <button type="button" (click)="text.set(c.name)">{{ c.name }}</button>
        }
      </div>
    }
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: 8px; }
    .sug { display: flex; flex-wrap: wrap; gap: 6px; }
    button {
      position: relative; min-height: 32px; padding: 0 12px; border: 0; border-radius: 8px; background: var(--s2); color: var(--tx2);
      font: inherit; font-size: 13px; font-weight: 500; cursor: pointer;
    }
    button:hover { background: var(--s3); }
    button::after { content: ""; position: absolute; inset: -6px 0; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConceptInput {
  readonly label = input('Concepto');
  readonly placeholder = input('Ej. Netflix');
  readonly error = input('');
  /** Conceptos del catálogo que corresponden; solo se sugieren los activos. */
  readonly options = input.required<Concept[]>();
  readonly text = model('');

  protected readonly suggestions = computed(() => {
    const q = plain(this.text());
    const active = this.options().filter((c) => c.active);
    const hits = q ? active.filter((c) => plain(c.name).includes(q) && plain(c.name) !== q) : active;
    return hits.slice(0, MAX);
  });
}
