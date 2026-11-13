import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs';
import { dateKey } from '../../habits/streaks';
import { AddSheetService } from '../../add/add-sheet.service';
import { Icon } from '../../icons/icon';
import { Button } from '../../ui/button';
import { Chip } from '../../ui/chip';
import { Segmented, SegmentOption } from '../../ui/segmented';
import { ConfirmDialog } from '../../ui/confirm-dialog';
import { ToastService } from '../../ui/toast';
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
import { cutProgress, cutText, daysUntil, endedPurchases, isMsi, parseInstallment, shortDate } from '../finanzas.view-calc';

const FIXED = 'fijos';
/** Cuántas compras de contado se ven antes de "Ver todas". */
const SHOWN = 10;
const CUT_ALERT_DAYS = 7;

/** Finanzas › Tarjetas: una tarjeta (o los gastos fijos) con su corte, sus meses sin intereses y sus compras. */
@Component({
  selector: 'app-tarjetas-page',
  imports: [Button, Chip, ConfirmDialog, Segmented, EditCut, EditExpense, EmptyState, Icon, ProgressBar],
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
  private readonly toasts = inject(ToastService);

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
    // La fecha va en el encabezado del grupo; la recurrente muestra desde cuándo se repite.
    const note = e.installment && !parseInstallment(e.installment) ? e.installment : '';
    const sub = e.pinned ? [d ? `Desde ${d}` : 'Cada corte', note].filter(Boolean).join(' · ') : note;
    return { e, name: this.label(e), amount: e.amount, sub, pinned: !!e.pinned, day: e.purchasedAt ? dateKey(new Date(e.purchasedAt)) : '' };
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
      // Las recurrentes primero; luego, las más recientes.
      .sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || (b.purchasedAt ?? '').localeCompare(a.purchasedAt ?? ''))
      .map((e) => this.line(e)),
  );
  protected readonly showAll = signal(false);
  protected readonly buys = computed(() => (this.showAll() ? this.plain() : this.plain().slice(0, SHOWN)));
  protected readonly buyCount = computed(() => this.plain().length);

  /** En móvil la pantalla se divide en tres vistas; en escritorio se ve todo junto. */
  protected readonly sub = signal<'compras' | 'meses' | 'corte'>('compras');
  protected readonly subOptions: SegmentOption[] = [
    { value: 'compras', label: 'Compras' },
    { value: 'meses', label: 'Meses' },
    { value: 'corte', label: 'Corte' },
  ];
  protected readonly offCompras = computed(() => !this.isFixed() && this.sub() !== 'compras');
  protected readonly offMeses = computed(() => this.sub() !== 'meses');
  protected readonly offCorte = computed(() => this.sub() !== 'corte');

  /** Las compras agrupadas: primero las recurrentes y luego cada día, con su subtotal. Los gastos fijos van sin grupos. */
  protected readonly groups = computed(() => {
    const list = this.buys();
    if (this.isFixed()) return list.length ? [{ key: 'fijos', label: '', total: 0, items: list }] : [];
    const out: { key: string; label: string; total: number; items: typeof list }[] = [];
    const pinned = list.filter((b) => b.pinned);
    if (pinned.length) out.push({ key: 'pin', label: 'Recurrentes', total: pinned.reduce((s, b) => s + b.amount, 0), items: pinned });
    const days = new Map<string, typeof list>();
    for (const b of list.filter((x) => !x.pinned)) days.set(b.day, [...(days.get(b.day) ?? []), b]);
    for (const [day, items] of days) out.push({ key: 'd' + day, label: day ? shortDate(day) : 'Sin fecha', total: items.reduce((s, b) => s + b.amount, 0), items });
    return out;
  });

  // Selección para borrar varias compras a la vez
  protected readonly selecting = signal(false);
  protected readonly picked = signal<ReadonlySet<string>>(new Set());
  protected readonly allPicked = computed(() => this.buys().length > 0 && this.buys().every((b) => this.picked().has(b.e.id)));
  protected readonly asking = signal(false);
  protected readonly busy = signal(false);
  protected readonly pickedDetails = computed(() => {
    const pinned = this.buys().filter((b) => this.picked().has(b.e.id) && b.pinned).length;
    return pinned ? [pinned === 1 ? '1 compra recurrente' : `${pinned} compras recurrentes`] : [];
  });

  // Limpieza al terminar el corte: las compras de contado de cortes anteriores, sin las fijadas
  protected readonly ended = computed(() => (this.card() && this.period() ? endedPurchases(this.rows(), this.period()!.start) : []));
  protected readonly cleaning = signal(false);

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

  protected toggleSelect() {
    this.selecting.update((v) => !v);
    this.picked.set(new Set());
  }

  protected pickAll() {
    this.picked.set(this.allPicked() ? new Set() : new Set(this.buys().map((b) => b.e.id)));
  }

  protected rowClick(e: Expense) {
    if (!this.selecting()) return this.edit(e);
    this.picked.update((s) => {
      const n = new Set(s);
      if (!n.delete(e.id)) n.add(e.id);
      return n;
    });
  }

  protected async removePicked() {
    const ids = [...this.picked()];
    this.busy.set(true);
    const ok = await this.fin.removeExpenses(ids);
    this.busy.set(false);
    this.asking.set(false);
    if (!ok) return;
    this.toasts.show({ message: ids.length === 1 ? 'Compra eliminada' : `${ids.length} compras eliminadas` });
    this.selecting.set(false);
    this.picked.set(new Set());
  }

  protected async cleanEnded() {
    const ids = this.ended().map((e) => e.id);
    this.busy.set(true);
    const ok = await this.fin.removeExpenses(ids);
    this.busy.set(false);
    this.cleaning.set(false);
    if (ok) this.toasts.show({ message: ids.length === 1 ? 'Corte limpio: 1 compra eliminada' : `Corte limpio: ${ids.length} compras eliminadas` });
  }

  protected edit(e: Expense) {
    this.editing.set(e);
    this.editOpen.set(true);
  }
}
