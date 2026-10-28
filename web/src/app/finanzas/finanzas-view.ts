import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { dateKey } from '../habits/streaks';
import { plain } from './finanzas.calc';
import { Cut, Debt, Expense, FamilyMove } from './finanzas.models';
import { FinanzasService } from './finanzas.service';

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** "2026-10" → "Octubre 2026". */
export function monthName(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  const name = MONTHS[m - 1];
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${y}`;
}

/**
 * Lo que la persona eligió ver en Finanzas: un mes y/o un texto de búsqueda. El mes solo recorta lo que tiene fecha
 * (compras de contado, movimientos de dinero, dinero con familia y cortes). Lo demás —gastos fijos, compras a meses,
 * saldos y totales— es lo vigente y no depende del mes.
 */
@Injectable({ providedIn: 'root' })
export class FinanzasView {
  private readonly fin = inject(FinanzasService);

  /** "aaaa-mm", o null para ver todos los meses. */
  readonly month = signal<string | null>(null);
  readonly query = signal('');
  readonly searching = signal(false);
  /** Lo que exporta el botón "Exportar" de la pantalla visible. */
  readonly exporter = signal<(() => void) | null>(null);

  /** Meses con algo fechado, del más reciente al más antiguo. */
  readonly months = computed(() => {
    const set = new Set<string>();
    const add = (key: string | null | undefined) => key && set.add(key.slice(0, 7));
    for (const e of this.fin.expenses()) if (e.purchasedAt) add(dateKey(new Date(e.purchasedAt)));
    for (const d of this.fin.debts()) add(d.date);
    for (const m of this.fin.family()) add(m.date);
    for (const c of this.fin.cuts()) add(c.periodEnd);
    return [...set].sort().reverse();
  });
  readonly label = computed(() => (this.month() ? monthName(this.month()!) : 'Todos los meses'));

  /** Pasa al mes siguiente (+1, más reciente) o anterior (-1) de los que tienen datos; "todos" está al principio. */
  shift(dir: 1 | -1) {
    const list: (string | null)[] = [null, ...[...this.months()].reverse()];
    const i = Math.max(0, list.indexOf(this.month()));
    this.month.set(list[Math.min(list.length - 1, Math.max(0, i + dir))]);
  }
  readonly canPrev = computed(() => this.months().length > 0 && this.month() !== null);
  readonly canNext = computed(() => this.months().length > 0 && this.month() !== this.months()[0]);

  inMonth(key: string | null | undefined): boolean {
    const m = this.month();
    return !m || (!!key && key.slice(0, 7) === m);
  }

  /** ¿Coincide el texto buscado con alguno de estos textos? Sin búsqueda, todo coincide. */
  matches(...texts: (string | undefined | null)[]): boolean {
    const q = plain(this.query());
    return !q || texts.some((t) => plain(t ?? '').includes(q));
  }

  /** Una compra de contado se filtra por su fecha; los gastos fijos y los meses sin intereses siempre cuentan. */
  expenseInMonth(e: Expense): boolean {
    return e.section === 'fijos' || !!e.installment || !e.purchasedAt || this.inMonth(dateKey(new Date(e.purchasedAt)));
  }
  debtInMonth(d: Debt): boolean {
    return this.inMonth(d.date);
  }
  familyInMonth(m: FamilyMove): boolean {
    return this.inMonth(m.date);
  }
  cutInMonth(c: Cut): boolean {
    return !c.periodEnd || this.inMonth(c.periodEnd);
  }

  /** La pantalla visible registra lo que exporta; al destruirse lo retira (si nadie lo cambió ya). */
  setExporter(run: () => void, destroyRef: DestroyRef) {
    this.exporter.set(run);
    destroyRef.onDestroy(() => {
      if (this.exporter() === run) this.exporter.set(null);
    });
  }

  clearSearch() {
    this.query.set('');
    this.searching.set(false);
  }
}
