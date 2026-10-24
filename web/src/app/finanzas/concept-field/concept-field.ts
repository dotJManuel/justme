import { Component, computed, input, output, signal } from '@angular/core';
import { Concept } from '../finanzas.models';

/** Concepto de un registro: uno del catálogo (id) o texto libre (text). Nunca los dos. */
export interface ConceptValue {
  id: string | null;
  text: string;
}

/**
 * Cambio pedido por el campo. Quien lo recibe guarda (o rechaza) y avisa con `done`: si no se pudo guardar,
 * el campo vuelve a mostrar el valor anterior.
 */
export interface ConceptChange {
  value: ConceptValue;
  done: (saved: boolean) => void;
}

/**
 * Convierte lo que se escribió en un concepto: si coincide (sin importar mayúsculas) con uno activo del
 * catálogo, se enlaza a él; si no, queda como texto libre. `keepId` es el concepto que ya tenía el registro:
 * se puede conservar aunque esté desactivado.
 */
export function resolveConcept(options: Concept[], raw: string, keepId: string | null = null): ConceptValue {
  const text = raw.trim();
  if (!text) return { id: null, text: '' };
  const hit = options.find((o) => (o.active || o.id === keepId) && o.name.trim().toLowerCase() === text.toLowerCase());
  return hit ? { id: hit.id, text: '' } : { id: null, text };
}

let nextId = 0;

/**
 * Campo de concepto: se escribe libremente y, mientras se escribe, aparecen como sugerencia los conceptos
 * del catálogo que coinciden; al elegir una sugerencia se pone su texto.
 */
@Component({
  selector: 'app-concept-field',
  templateUrl: './concept-field.html',
  styleUrl: '../finanzas.shared.css',
})
export class ConceptField {
  /** Todos los conceptos del catálogo que corresponden; solo se sugieren los activos. */
  readonly options = input.required<Concept[]>();
  readonly value = input.required<ConceptValue>();
  readonly placeholder = input('Elige o escribe un concepto');
  readonly label = input('Concepto');
  readonly maxLength = input(120);
  /** En formularios de alta: avisa a cada tecla, para que el botón Agregar se active al escribir. */
  readonly live = input(false);

  readonly valueChange = output<ConceptChange>();

  protected readonly listId = `concepto-${nextId++}`;

  /** Lo último que se pidió guardar, mientras se guarda; después manda el valor que llega de afuera. */
  private readonly local = signal<ConceptValue | null>(null);
  protected readonly current = computed(() => this.local() ?? this.value());
  protected readonly shown = computed(() => this.display(this.current()));
  protected readonly suggestions = computed(() => this.options().filter((o) => o.active));

  private display(v: ConceptValue): string {
    return v.text || this.options().find((o) => o.id === v.id)?.name || '';
  }

  protected onInput(el: HTMLInputElement) {
    if (this.live()) this.valueChange.emit({ value: { id: null, text: el.value }, done: () => undefined });
  }

  protected onChange(el: HTMLInputElement) {
    const resolved = resolveConcept(this.options(), el.value, this.value().id);
    el.value = this.display(resolved);
    const now = this.value();
    if (resolved.id === now.id && resolved.text === now.text) return;
    this.local.set(resolved);
    this.valueChange.emit({
      value: resolved,
      done: (saved) => {
        this.local.set(null);
        if (!saved) el.value = this.shown();
      },
    });
  }
}
