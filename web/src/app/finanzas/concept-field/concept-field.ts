import { Component, ElementRef, computed, effect, input, output, signal, untracked, viewChild } from '@angular/core';
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

const OTHER = '__otro__';

/** Select de conceptos con la opción "Otro (escribir)…" para un concepto único que no entra al catálogo. */
@Component({
  selector: 'app-concept-field',
  templateUrl: './concept-field.html',
  styleUrls: ['../finanzas.shared.css', './concept-field.css'],
})
export class ConceptField {
  /** Todos los conceptos del catálogo que corresponden; aquí se ocultan los desactivados (salvo el actual). */
  readonly options = input.required<Concept[]>();
  readonly value = input.required<ConceptValue>();
  /** Texto de la opción vacía; sin texto, no hay opción vacía (concepto obligatorio en una fila ya guardada). */
  readonly blank = input('');
  readonly label = input('Concepto');
  readonly maxLength = input(120);

  readonly valueChange = output<ConceptChange>();

  private readonly sel = viewChild<ElementRef<HTMLSelectElement>>('sel');
  private readonly txt = viewChild<ElementRef<HTMLInputElement>>('txt');

  protected readonly OTHER = OTHER;

  /** Lo que eligió la persona mientras se guarda; después manda el valor que llega de afuera. */
  private readonly local = signal<ConceptValue | null>(null);
  /** Eligió "Otro" y todavía no escribe nada: se muestra la caja de texto vacía. */
  private readonly forceText = signal(false);

  protected readonly current = computed(() => this.local() ?? this.value());
  protected readonly textMode = computed(() => this.forceText() || this.current().text !== '');
  protected readonly selectValue = computed(() => (this.textMode() ? OTHER : (this.current().id ?? '')));
  protected readonly shown = computed(() =>
    this.options().filter((o) => o.active || o.id === this.current().id),
  );

  constructor() {
    // Si desde afuera vuelven el campo a "vacío" (por ejemplo, tras agregar un registro), se sale del modo texto.
    effect(() => {
      const v = this.value();
      if (v.id === null && v.text === '') untracked(() => this.forceText.set(false));
    });
  }

  protected onSelect(el: HTMLSelectElement) {
    if (el.value === OTHER) {
      this.forceText.set(true);
      setTimeout(() => this.txt()?.nativeElement.focus());
      return;
    }
    this.forceText.set(false);
    this.commit({ id: el.value || null, text: '' });
  }

  protected onText(el: HTMLInputElement) {
    this.commit({ id: null, text: el.value.trim() });
  }

  private commit(value: ConceptValue) {
    const now = this.value();
    if (value.id === now.id && value.text === now.text) return this.sync();
    this.local.set(value);
    this.valueChange.emit({
      value,
      done: (saved) => {
        this.local.set(null);
        if (!saved) {
          this.forceText.set(false);
          this.sync();
        }
      },
    });
  }

  /** Vuelve a poner en pantalla el valor vigente (cuando un cambio no se guardó). */
  private sync() {
    const sel = this.sel()?.nativeElement;
    if (sel) sel.value = this.selectValue();
    const txt = this.txt()?.nativeElement;
    if (txt) txt.value = this.current().text;
  }
}
