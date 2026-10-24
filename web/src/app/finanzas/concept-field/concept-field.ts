import { Component, DestroyRef, ElementRef, computed, inject, input, output, signal, viewChild } from '@angular/core';
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

/** Minúsculas y sin acentos, para comparar lo escrito con los conceptos ("cafe" encuentra "Café"). */
const plain = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

/** Máximo de sugerencias que se muestran a la vez. */
const MAX_SUGGESTIONS = 30;

let nextId = 0;

/**
 * Campo de concepto: se escribe libremente y, mientras se escribe (o al tocar el campo), se despliegan los conceptos
 * del catálogo que coinciden; al elegir uno se pone su texto. La lista es propia y no el `datalist` del navegador,
 * que en celular casi no muestra sugerencias.
 */
@Component({
  selector: 'app-concept-field',
  templateUrl: './concept-field.html',
  styleUrls: ['../finanzas.shared.css', './concept-field.css'],
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

  private readonly field = viewChild<ElementRef<HTMLInputElement>>('el');

  protected readonly listId = `concepto-${nextId++}`;

  /** Lo último que se pidió guardar, mientras se guarda; después manda el valor que llega de afuera. */
  private readonly local = signal<ConceptValue | null>(null);
  protected readonly current = computed(() => this.local() ?? this.value());
  protected readonly shown = computed(() => this.display(this.current()));

  // Lista de sugerencias
  protected readonly open = signal(false);
  protected readonly active = signal(-1);
  private readonly typed = signal('');
  protected readonly pos = signal({ left: 0, width: 0, top: null as number | null, bottom: null as number | null, max: 192 });

  /** Conceptos activos que contienen lo escrito (los que empiezan igual, primero). Sin texto, todos. */
  protected readonly items = computed(() => {
    const q = plain(this.typed());
    const all = this.options().filter((o) => o.active);
    if (!q) return all.slice(0, MAX_SUGGESTIONS);
    const starts: Concept[] = [];
    const contains: Concept[] = [];
    for (const o of all) {
      const n = plain(o.name);
      if (n.startsWith(q)) starts.push(o);
      else if (n.includes(q)) contains.push(o);
    }
    return [...starts, ...contains].slice(0, MAX_SUGGESTIONS);
  });

  /** Para ignorar el "change" que el navegador dispara al quitar el foco justo después de elegir una sugerencia. */
  private skipChange = false;

  private readonly reposition = () => this.place();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.detach());
  }

  private display(v: ConceptValue): string {
    return v.text || this.options().find((o) => o.id === v.id)?.name || '';
  }

  /** Al tocar el campo se ofrecen todos los conceptos (aunque ya tenga uno); al escribir, solo los que coinciden. */
  protected onFocus() {
    this.typed.set('');
    this.show();
  }

  protected onInput(el: HTMLInputElement) {
    this.typed.set(el.value);
    this.active.set(-1);
    this.show();
    if (this.live()) this.valueChange.emit({ value: { id: null, text: el.value }, done: () => undefined });
  }

  protected onBlur() {
    this.hide();
  }

  protected onKey(e: KeyboardEvent, el: HTMLInputElement) {
    const n = this.items().length;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!this.open()) return this.show();
      if (n) this.active.set((this.active() + (e.key === 'ArrowDown' ? 1 : -1) + n) % n);
    } else if (e.key === 'Enter' && this.open() && this.active() >= 0) {
      e.preventDefault(); // no enviar el formulario: solo elegir la sugerencia
      this.pick(this.items()[this.active()], el);
    } else if (e.key === 'Escape' && this.open()) {
      e.preventDefault();
      this.hide();
    }
  }

  protected onChange(el: HTMLInputElement) {
    if (!this.skipChange) this.commit(el);
  }

  /** Elegir una sugerencia: se pone su texto y se guarda. */
  protected pick(o: Concept, el: HTMLInputElement) {
    this.skipChange = true;
    el.value = o.name;
    this.typed.set(o.name);
    this.hide();
    this.commit(el);
    el.blur(); // en celular, cierra el teclado
    setTimeout(() => (this.skipChange = false));
  }

  private commit(el: HTMLInputElement) {
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

  // ── posición de la lista: fija sobre la pantalla, para que no la recorten las tablas con scroll

  private show() {
    if (!this.options().some((o) => o.active)) return;
    this.place();
    this.open.set(true);
    window.addEventListener('scroll', this.reposition, true);
    window.addEventListener('resize', this.reposition);
    window.visualViewport?.addEventListener('resize', this.reposition);
  }

  private hide() {
    this.open.set(false);
    this.active.set(-1);
    this.detach();
  }

  private detach() {
    window.removeEventListener('scroll', this.reposition, true);
    window.removeEventListener('resize', this.reposition);
    window.visualViewport?.removeEventListener('resize', this.reposition);
  }

  /** Debajo del campo; si abajo no cabe (por ejemplo, con el teclado del celular), arriba. */
  private place() {
    const el = this.field()?.nativeElement;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const vv = window.visualViewport;
    const top = vv?.offsetTop ?? 0;
    const limit = vv ? top + vv.height : window.innerHeight;
    const below = limit - r.bottom - 8;
    const above = r.top - top - 8;
    const up = below < 150 && above > below;
    this.pos.set({
      left: r.left,
      width: r.width,
      top: up ? null : r.bottom + 4,
      bottom: up ? window.innerHeight - r.top + 4 : null,
      max: Math.max(96, Math.min(192, up ? above : below)),
    });
  }
}
