import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AddSheetService } from '../../add/add-sheet.service';
import { Icon } from '../../icons/icon';
import { Button } from '../../ui/button';
import { Chip } from '../../ui/chip';
import { money } from '../../ui/money';
import { ProgressBar } from '../../ui/progress';
import { EmptyState } from '../../ui/states';
import { ageDays, debtRows, personSummaries, sortDebtRows } from '../finanzas.calc';
import { movementsSheet, peopleSheet, today } from '../finanzas.export';
import { FinanzasView } from '../finanzas-view';
import { FinanzasService } from '../finanzas.service';
import { initials } from '../finanzas.view-calc';
import { downloadXlsx } from '../xlsx';
import { PersonaPage } from './persona-page';

type Order = 'saldo' | 'nombre';
type Filter = 'saldo' | 'saldados';

/** Desde cuántos días sin pagos se marca a una persona en aviso. */
const STALE_DAYS = 30;

/**
 * Finanzas › Por cobrar: cuánto te deben en total y por persona, con hace cuánto no te pagan. En móvil, tocar a
 * alguien abre su ficha; en escritorio la lista queda a la izquierda y la ficha a la derecha.
 */
@Component({
  selector: 'app-por-cobrar-page',
  imports: [Button, Chip, EmptyState, Icon, ProgressBar, RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './por-cobrar-page.html',
  styleUrls: ['../fin-pages.css', './por-cobrar-page.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PorCobrarPage {
  protected readonly fin = inject(FinanzasService);
  protected readonly view = inject(FinanzasView);
  protected readonly add = inject(AddSheetService);

  protected readonly money = money;
  protected readonly initials = initials;
  protected readonly order = signal<Order>('saldo');
  protected readonly filter = signal<Filter>('saldo');
  /** La ficha abierta (si hay una persona elegida): decide qué exporta el botón "Exportar". */
  protected readonly detail = signal<PersonaPage | null>(null);

  private readonly now = new Date();
  private readonly summary = computed(() => personSummaries(this.fin.debts(), this.fin.people()));
  protected readonly total = computed(() => this.summary().total);
  private readonly rows = computed(() => debtRows(this.fin.debts(), this.now, this.fin.people(), this.fin.concepts()));

  protected readonly openCount = computed(() => this.summary().people.filter((p) => p.pending > 0).length);
  protected readonly settledCount = computed(() => this.summary().people.filter((p) => p.pending <= 0).length);

  protected readonly people = computed(() => {
    const concepts = new Map<string, string[]>();
    for (const r of this.rows()) concepts.set(r.personId, [...(concepts.get(r.personId) ?? []), r.conceptName]);
    const showOpen = this.filter() === 'saldo';
    const list = this.summary()
      .people.filter((p) => (showOpen ? p.pending > 0 : p.pending <= 0) && this.view.matches(p.person, ...(concepts.get(p.personId) ?? [])))
      .map((p) => {
        const mine = this.rows().filter((r) => r.personId === p.personId);
        const oldest = Math.max(0, ...mine.filter((r) => r.kind === 'cargo' && (r.balance ?? 0) > 0 && !r.archived).map((r) => r.age ?? 0));
        const lastPay = mine.filter((r) => r.kind === 'abono' && r.date).map((r) => r.date as string).sort().pop();
        const since = lastPay ? ageDays(lastPay, this.now) : oldest;
        const stale = p.pending > 0 && oldest >= STALE_DAYS && since >= STALE_DAYS;
        const days = (n: number) => `${n} ${n === 1 ? 'día' : 'días'}`;
        const note =
          p.pending <= 0
            ? 'Saldado'
            : !lastPay
              ? oldest > 0 ? `Sin pagos hace ${days(oldest)}` : 'Aún sin pagos'
              : since === 0 ? 'Último pago hoy' : `${stale ? 'Sin pagos hace' : 'Último pago hace'} ${days(since)}`;
        return { ...p, note, stale, pct: Math.round(p.ratio * 100) };
      });
    return showOpen && this.order() === 'saldo' ? list.sort((a, b) => b.pending - a.pending) : list;
  });

  constructor() {
    this.view.setExporter(() => (this.detail() ? this.detail()!.exportOne() : this.exportAll()), inject(DestroyRef));
  }

  protected toggleOrder() {
    this.order.set(this.order() === 'saldo' ? 'nombre' : 'saldo');
  }

  protected onActivate(component: unknown) {
    this.detail.set(component instanceof PersonaPage ? component : null);
  }

  /** Un libro con el resumen por persona y todos los movimientos (lo que exportaba "Dinero que me deben"). */
  private exportAll() {
    downloadXlsx(`Por cobrar - ${today()}`, [peopleSheet(this.summary()), movementsSheet(sortDebtRows(this.rows(), []), this.rows())]);
  }
}
