import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs';
import { dateKey } from '../../habits/streaks';
import { AddSheetService } from '../../add/add-sheet.service';
import { Icon } from '../../icons/icon';
import { Button } from '../../ui/button';
import { Chip } from '../../ui/chip';
import { money } from '../../ui/money';
import { ProgressBar } from '../../ui/progress';
import { EmptyState } from '../../ui/states';
import { EditCut } from '../edit/edit-simple';
import { EditExpense } from '../edit/edit-expense';
import { exportGastos } from '../export-gastos';
import { FinanzasView } from '../finanzas-view';
import { conceptLabel, currentCutPeriod, cutPending, expenseTotals } from '../finanzas.calc';
import { Expense } from '../finanzas.models';
import { FinanzasService } from '../finanzas.service';
import { cutProgress, cutText, daysUntil, isMsi, parseInstallment, shortDate } from '../finanzas.view-calc';

const FIXED = 'fijos';
/** Cuántas compras de contado se ven antes de "Ver todas". */
const SHOWN = 10;
const CUT_ALERT_DAYS = 7;

/** Finanzas › Tarjetas: una tarjeta (o los gastos fijos) con su corte, sus meses sin intereses y sus compras. */
@Component({
  selector: 'app-tarjetas-page',
  imports: [Button, Chip, EditCut, EditExpense, EmptyState, Icon, ProgressBar],
  templateUrl: './tarjetas-page.html',
  styleUrls: ['../fin-pages.css', './tarjetas-page.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TarjetasPage {
  protected readonly fin = inject(FinanzasService);
  protected readonly view = inject(FinanzasView);
  protected readonly add = inject(AddSheetService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly money = money;
  protected readonly shortDate = shortDate;
  private readonly now = new Date();

  private readonly param = toSignal(this.route.queryParamMap.pipe(map((p) => p.get('card'))), { initialValue: null });
  protected readonly cards = computed(() => this.fin.cards().filter((c) => c.active));
  /** Lo elegido; si no existe (se desactivó), la primera tarjeta o los gastos fijos. */
  protected readonly selected = computed(() => {
    const p = this.param();
    if (p === FIXED || this.cards().some((c) => c.id === p)) return p!;
    return this.cards()[0]?.id ?? FIXED;
  });
  protected readonly isFixed = computed(() => this.selected() === FIXED);
  protected readonly card = computed(() => this.cards().find((c) => c.id === this.selected()) ?? null);

  private readonly rows = computed(() =>
    this.fin.expenses().filter((e) => (this.isFixed() ? e.section === 'fijos' : e.cardId === this.selected())),
  );
  protected readonly totals = computed(() => expenseTotals(this.rows()));

  private readonly period = computed(() => (this.card() ? currentCutPeriod(this.card()!.cutDay, this.now) : null));
  protected readonly cut = computed(() => {
    const p = this.period();
    if (!p) return null;
    const days = daysUntil(p.end, this.now);
    const saved = this.fin.cuts().find((c) => c.cardId === this.selected() && c.periodEnd === p.end);
    const amount = saved?.amount ?? 0;
    const paid = saved?.paid ?? 0;
    return { label: p.label, start: shortDate(p.start), end: shortDate(p.end), days, text: cutText(days), alert: days <= CUT_ALERT_DAYS, pct: cutProgress(p, this.now), amount, paid, pending: cutPending({ amount, paid }) };
  });

  private label(e: Expense): string {
    return conceptLabel(this.fin.concepts(), e.conceptId, e.conceptText);
  }
  private line(e: Expense) {
    const d = e.purchasedAt ? shortDate(dateKey(new Date(e.purchasedAt))) : '';
    return { e, name: this.label(e), amount: e.amount, sub: [d, e.installment && !parseInstallment(e.installment) ? e.installment : ''].filter(Boolean).join(' · ') };
  }

  protected readonly msi = computed(() =>
    this.rows()
      .filter((e) => isMsi(e) && this.view.matches(this.label(e)))
      .map((e) => ({ ...this.line(e), ...parseInstallment(e.installment)!, total: e.total ?? e.amount })),
  );
  /** Compras de contado (o gastos fijos), las más recientes primero, con el mes y la búsqueda aplicados. */
  private readonly plain = computed(() =>
    this.rows()
      .filter((e) => !isMsi(e) && this.view.expenseInMonth(e) && this.view.matches(this.label(e)))
      .sort((a, b) => (b.purchasedAt ?? '').localeCompare(a.purchasedAt ?? ''))
      .map((e) => this.line(e)),
  );
  protected readonly showAll = signal(false);
  protected readonly buys = computed(() => (this.showAll() ? this.plain() : this.plain().slice(0, SHOWN)));
  protected readonly buyCount = computed(() => this.plain().length);

  protected readonly editing = signal<Expense | null>(null);
  protected readonly editOpen = signal(false);
  protected readonly cutOpen = signal(false);

  constructor() {
    this.view.setExporter(() => exportGastos(this.fin), inject(DestroyRef));
  }

  protected pick(id: string) {
    this.showAll.set(false);
    void this.router.navigate([], { queryParams: { card: id }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  protected edit(e: Expense) {
    this.editing.set(e);
    this.editOpen.set(true);
  }
}
