import { ApplicationRef, Directive, ElementRef, inject, input, output } from '@angular/core';
import { shift } from './notas.tree';

interface Drag {
  index: number;
  pointerId: number;
  grip: HTMLElement;
  rows: HTMLElement[];
  /** Centro de cada fila al empezar, en coordenadas de la página. */
  centers: number[];
  startY: number;
  /** Cuánto puede bajar o subir la fila arrastrada sin salirse de la lista. */
  min: number;
  max: number;
  height: number;
  target: number;
  lastClientY: number;
  raf: number;
}

const EDGE = 80;
const SCROLL_STEP = 14;

/**
 * Lista ordenable: cada fila lleva `data-sort-id` y su asa `data-sort-handle` (un botón). Se arrastra el asa con el mouse o el
 * dedo y las demás filas se apartan en vivo; al soltar sale `reordered` con los ids en el nuevo orden. Con el asa enfocada,
 * las flechas ↑ ↓ mueven la fila un lugar. Cerca del borde de la pantalla, la página se desplaza sola.
 *
 * Uso: `<ul [appSortable]="ids" (reordered)="guardar($event)"><li data-sort-id="a"><button data-sort-handle>⠿</button>…</li></ul>`.
 */
@Directive({
  selector: '[appSortable]',
  host: { '(pointerdown)': 'down($event)', '(pointermove)': 'move($event)', '(pointerup)': 'up()', '(pointercancel)': 'cancel()', '(keydown)': 'key($event)', '(selectstart)': 'noSelect($event)' },
})
export class Sortable {
  /** Los ids en el orden en que se muestran. */
  readonly appSortable = input.required<string[]>();
  readonly reordered = output<string[]>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly app = inject(ApplicationRef);
  private drag: Drag | null = null;

  private rows(): HTMLElement[] {
    return Array.from(this.host.querySelectorAll<HTMLElement>(':scope > [data-sort-id]'));
  }

  protected down(e: PointerEvent) {
    const grip = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-sort-handle]');
    if (!grip || this.drag || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const row = grip.closest<HTMLElement>('[data-sort-id]');
    const rows = this.rows();
    const index = row ? rows.indexOf(row) : -1;
    if (!row || index < 0) return;
    e.preventDefault(); // en pantalla táctil, que el dedo arrastre la fila y no la página
    window.getSelection()?.removeAllRanges();
    try {
      grip.setPointerCapture(e.pointerId); // así el arrastre sigue aunque el puntero salga del asa
    } catch {
      /* sin captura, los eventos siguen llegando mientras el puntero esté dentro de la lista */
    }

    const scroll = window.scrollY;
    const rects = rows.map((r) => r.getBoundingClientRect());
    for (const r of rows) {
      r.style.transition = r === row ? 'none' : 'transform 0.15s ease';
    }
    row.style.position = 'relative';
    row.style.zIndex = '3';
    row.style.boxShadow = 'var(--sh2)';
    row.style.background = 'var(--sf)';
    row.classList.add('dragging');
    this.host.classList.add('sorting');

    const d: Drag = {
      index,
      pointerId: e.pointerId,
      grip,
      rows,
      centers: rects.map((r) => r.top + scroll + r.height / 2),
      startY: e.clientY + scroll,
      min: rects[0].top - rects[index].top,
      max: rects[rects.length - 1].bottom - rects[index].bottom,
      // Lo que ocupa su lugar en la lista (con márgenes): la distancia a la fila vecina; si no hay, su altura.
      height: index < rows.length - 1 ? rects[index + 1].top - rects[index].top : index > 0 ? rects[index].top - rects[index - 1].top : rects[index].height,
      target: index,
      lastClientY: e.clientY,
      raf: 0,
    };
    this.drag = d;
    const loop = () => {
      if (this.drag !== d) return;
      // Cerca del borde de la pantalla, la página se desplaza para poder llegar más lejos.
      if (d.lastClientY < EDGE) window.scrollBy(0, -SCROLL_STEP);
      else if (d.lastClientY > window.innerHeight - EDGE) window.scrollBy(0, SCROLL_STEP);
      this.update(d);
      d.raf = requestAnimationFrame(loop);
    };
    d.raf = requestAnimationFrame(loop);
  }

  /** Mientras se arrastra, que el puntero no vaya seleccionando el texto que cruza. */
  protected noSelect(e: Event) {
    if (this.drag) e.preventDefault();
  }

  protected move(e: PointerEvent) {
    const d = this.drag;
    if (!d || e.pointerId !== d.pointerId) return;
    d.lastClientY = e.clientY;
    this.update(d); // en el momento, sin esperar al siguiente cuadro: un arrastre rápido también cuenta
  }

  /** Coloca la fila arrastrada bajo el puntero y aparta las demás. */
  private update(d: Drag) {
    const y = d.lastClientY + window.scrollY;
    // El límite es relativo a donde estaba la fila: se mide con el desplazamiento de la página que había al empezar.
    const dy = Math.min(Math.max(y - d.startY, d.min), d.max);
    const center = d.centers[d.index] + dy;
    let target = d.index;
    // Con tolerancia: en los extremos la fila llega justo hasta el lugar de la primera o la última, sin pasar de su centro.
    for (let j = d.index + 1; j < d.rows.length; j++) if (center > d.centers[j] - 1) target = j;
    for (let j = d.index - 1; j >= 0; j--) if (center < d.centers[j] + 1) target = j;
    d.target = target;
    d.rows[d.index].style.transform = `translateY(${dy}px)`;
    d.rows.forEach((r, j) => {
      if (j === d.index) return;
      const shiftBy = j > d.index && j <= target ? -d.height : j < d.index && j >= target ? d.height : 0;
      r.style.transform = shiftBy ? `translateY(${shiftBy}px)` : '';
    });
  }

  protected up() {
    const d = this.drag;
    if (!d) return;
    cancelAnimationFrame(d.raf);
    this.update(d); // la última posición del puntero
    this.drag = null;
    try {
      d.grip.releasePointerCapture(d.pointerId);
    } catch {
      /* ya soltado */
    }
    if (d.target !== d.index) {
      const ids = d.rows.map((r) => r.dataset['sortId'] ?? '');
      const [moved] = ids.splice(d.index, 1);
      ids.splice(d.target, 0, moved);
      this.reordered.emit(ids);
      // Se pinta el nuevo orden antes de quitar los desplazamientos, para que no haya un salto en medio.
      try {
        this.app.tick();
      } catch {
        /* se pinta en el siguiente ciclo */
      }
    }
    this.clear(d.rows);
  }

  protected cancel() {
    const d = this.drag;
    if (!d) return;
    cancelAnimationFrame(d.raf);
    this.drag = null;
    this.clear(d.rows);
  }

  private clear(rows: HTMLElement[]) {
    for (const r of rows) {
      r.style.transform = r.style.transition = r.style.position = r.style.zIndex = r.style.boxShadow = r.style.background = '';
      r.classList.remove('dragging');
    }
    this.host.classList.remove('sorting');
  }

  /** Con el asa enfocada, ↑ y ↓ mueven la fila un lugar. */
  protected key(e: KeyboardEvent) {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    const grip = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-sort-handle]');
    const id = grip?.closest<HTMLElement>('[data-sort-id]')?.dataset['sortId'];
    if (!grip || !id) return;
    e.preventDefault();
    const ids = this.appSortable();
    const next = shift(ids, id, e.key === 'ArrowUp' ? -1 : 1);
    if (next.join() === ids.join()) return;
    this.reordered.emit(next);
    try {
      this.app.tick();
    } catch {
      /* se pinta en el siguiente ciclo */
    }
    this.host.querySelector<HTMLElement>(`[data-sort-id="${CSS.escape(id)}"] [data-sort-handle]`)?.focus();
  }
}
