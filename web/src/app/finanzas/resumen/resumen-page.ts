import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AddSheetService } from '../../add/add-sheet.service';
import { Icon } from '../../icons/icon';
import { Button } from '../../ui/button';
import { Chip } from '../../ui/chip';
import { money } from '../../ui/money';
import { ProgressBar } from '../../ui/progress';
import { EmptyState } from '../../ui/states';
import { currentCutPeriod, debtRows, expenseTotals, monthSummary, personSummaries, conceptLabel } from '../finanzas.calc';
import { exportGastos } from '../export-gastos';
import { FinanzasView } from '../finanzas-view';
import { FinanzasService } from '../finanzas.service';
import { cutText, daysUntil, initials, isMsi, parseInstallment, percent, shortDate, stackOpacity } from '../finanzas.view-calc';
import { EditIncome } from '../edit/edit-simple';

type MovFilter = 'todo' | 'cargo' | 'abono';
/** Desde cuántos días antes del corte se marca como alerta. */
const CUT_ALERT_DAYS = 7;

/**
 * Finanzas › Resumen: cuánto te sobra, a dónde va y qué hay por pagar. En escritorio suma los 4 indicadores, los
 * movimientos recientes y las tarjetas de Por cobrar y Meses sin intereses.
 */
@Component({
  selector: 'app-resumen-page',
  imports: [Button, Chip, DecimalPipe, EditIncome, EmptyState, Icon, ProgressBar, RouterLink],
  templateUrl: './resumen-page.html',
  styleUrls: ['../fin-pages.css', './resumen-page.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResumenPage {
  protected readonly fin = inject(FinanzasService);
  protected readonly view = inject(FinanzasView);
  protected readonly add = inject(AddSheetService);

  protected readonly money = money;
  protected readonly initials = initials;
  protected readonly shortCut = shortDate;
  protected readonly editingIncome = signal(false);
  protected readonly movFilter = signal<MovFilter>('todo');

  private readonly now = new Date();
  protected readonly summary = computed(() => monthSummary(this.fin.expenses(), this.fin.income(), this.fin.cards()));
  private readonly cardRows = computed(() => {
    const ids = new Set(this.fin.cards().filter((c) => c.active).map((c) => c.id));
    return this.fin.expenses().filter((e) => e.cardId !== null && ids.has(e.cardId));
  });
  protected readonly quincena = computed(() => expenseTotals(this.cardRows()).quincena);
  protected readonly montoTotal = computed(() => expenseTotals(this.cardRows()).total);

  protected readonly balance = computed(() => {
    const s = this.summary();
    return { label: s.balance >= 0 ? 'Te sobra este mes' : 'Te falta este mes', value: Math.abs(s.balance), pct: percent(s.gran, s.income), income: s.income, gran: s.gran };
  });

  /** ¿A dónde va?: una parte por tarjeta con gasto y los gastos fijos. */
  protected readonly parts = computed(() => {
    const s = this.summary();
    const list = [
      ...s.cards.filter((c) => c.amount > 0).map((c) => ({ id: c.card.id, name: c.card.name, amount: c.amount, link: c.card.id })),
      ...(s.fijos > 0 ? [{ id: 'fijos', name: 'Gastos fijos', amount: s.fijos, link: 'fijos' }] : []),
    ].sort((a, b) => b.amount - a.amount);
    return list.map((p, i) => ({ ...p, pct: percent(p.amount, s.gran), w: s.gran > 0 ? (p.amount / s.gran) * 100 : 0, op: stackOpacity(i) }));
  });
  protected readonly distLabel = computed(() => this.parts().map((p) => `${p.name} ${p.pct}%`).join(', '));

  /** Por pagar: cada tarjeta activa (con su corte) y los gastos fijos. */
  protected readonly payables = computed(() => {
    const s = this.summary();
    const cards = s.cards.map(({ card, amount }) => {
      const end = currentCutPeriod(card.cutDay, this.now).end;
      const days = daysUntil(end, this.now);
      return { id: card.id, name: card.name, last4: card.last4 ?? '', amount, days, text: cutText(days), alert: days <= CUT_ALERT_DAYS, end };
    });
    return cards.sort((a, b) => a.days - b.days);
  });

  protected readonly owed = computed(() => {
    const { people, total } = personSummaries(this.fin.debts(), this.fin.people());
    const open = people.filter((p) => p.pending > 0).sort((a, b) => b.pending - a.pending);
    return { total, open };
  });

  protected readonly msi = computed(() =>
    this.cardRows()
      .filter(isMsi)
      .map((e) => ({ id: e.id, name: conceptLabel(this.fin.concepts(), e.conceptId, e.conceptText), monthly: e.amount, ...parseInstallment(e.installment)! }))
      .slice(0, 5),
  );

  // ── Movimientos (escritorio) y resultados de búsqueda
  private readonly rows = computed(() => debtRows(this.fin.debts(), this.now, this.fin.people(), this.fin.concepts()));
  protected readonly movements = computed(() => {
    const f = this.movFilter();
    return this.rows()
      .filter((r) => (f === 'todo' || r.kind === f) && this.view.debtInMonth(r) && this.view.matches(r.conceptName, r.personName))
      .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
      .slice(0, 12)
      .map((r) => ({ ...r, signed: r.kind === 'abono' ? r.amount : -r.amount, when: r.date ? shortDate(r.date) : 'Sin fecha' }));
  });
  protected readonly results = computed(() => {
    if (!this.view.query().trim()) return null;
    const expenses = this.fin.expenses()
      .map((e) => ({ e, name: conceptLabel(this.fin.concepts(), e.conceptId, e.conceptText) }))
      .filter((x) => this.view.matches(x.name) && this.view.expenseInMonth(x.e))
      .map((x) => ({ key: 'e' + x.e.id, icon: 'card' as const, title: x.name, sub: x.e.section === 'fijos' ? 'Gasto fijo' : (this.fin.cards().find((c) => c.id === x.e.cardId)?.name ?? ''), amount: -x.e.amount, link: ['/finanzas/tarjetas'], q: { card: x.e.cardId ?? 'fijos' } }));
    const debts = this.rows()
      .filter((r) => this.view.matches(r.conceptName, r.personName) && this.view.debtInMonth(r))
      .map((r) => ({ key: 'd' + r.id, icon: 'users' as const, title: r.conceptName || (r.kind === 'cargo' ? 'Préstamo' : 'Abono'), sub: r.personName, amount: r.kind === 'abono' ? r.amount : -r.amount, link: ['/finanzas/por-cobrar', r.personId], q: {} }));
    const family = this.fin.family()
      .filter((m) => this.view.matches(conceptLabel(this.fin.concepts(), m.conceptId, m.conceptText), this.fin.people().find((p) => p.id === m.personId)?.name) && this.view.familyInMonth(m))
      .map((m) => ({ key: 'f' + m.id, icon: 'heart' as const, title: conceptLabel(this.fin.concepts(), m.conceptId, m.conceptText) || (m.direction === 'recibido' ? 'Recibido' : 'Dado'), sub: this.fin.people().find((p) => p.id === m.personId)?.name ?? 'Familia', amount: m.direction === 'recibido' ? m.amount : -m.amount, link: ['/finanzas/familia'], q: {} }));
    return [...expenses, ...debts, ...family];
  });

  constructor() {
    this.view.setExporter(() => exportGastos(this.fin), inject(DestroyRef));
  }

}
