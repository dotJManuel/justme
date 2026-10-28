import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { AddSheetService } from '../../add/add-sheet.service';
import { Icon } from '../../icons/icon';
import { Button } from '../../ui/button';
import { Chip } from '../../ui/chip';
import { ConfirmDialog } from '../../ui/confirm-dialog';
import { money } from '../../ui/money';
import { ProgressBar } from '../../ui/progress';
import { Segmented } from '../../ui/segmented';
import { EmptyState } from '../../ui/states';
import { EditDebt } from '../edit/edit-simple';
import { DebtRow, debtRows, fmtDate, isArchived, paidCargos, personSummaries, sum } from '../finanzas.calc';
import { movementsSheet, today } from '../finanzas.export';
import { FinanzasView } from '../finanzas-view';
import { Debt } from '../finanzas.models';
import { FinanzasService } from '../finanzas.service';
import { buildStatement } from '../finanzas.statement';
import { StatementDialog } from '../pendiente/statement-dialog';
import { shortDate } from '../finanzas.view-calc';
import { downloadXlsx } from '../xlsx';

type Kind = 'todo' | 'cargo' | 'abono';
type Sort = 'fecha' | 'monto';

/**
 * Ficha de una persona: lo que te debe, sus movimientos pendientes y los cargos ya liquidados (los que antes iban
 * en Historial › Pagados), con su estado de cuenta para compartir.
 */
@Component({
  selector: 'app-persona-page',
  imports: [Button, Chip, ConfirmDialog, EditDebt, EmptyState, Icon, ProgressBar, RouterLink, Segmented, StatementDialog],
  templateUrl: './persona-page.html',
  styleUrls: ['../fin-pages.css', './persona-page.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PersonaPage {
  protected readonly fin = inject(FinanzasService);
  protected readonly view = inject(FinanzasView);
  private readonly add = inject(AddSheetService);
  private readonly route = inject(ActivatedRoute);

  protected readonly money = money;
  protected readonly fmtDate = fmtDate;
  protected readonly tabs = [
    { value: 'pendientes', label: 'Pendientes' },
    { value: 'liquidados', label: 'Liquidados' },
  ];
  protected readonly tab = signal('pendientes');
  protected readonly kind = signal<Kind>('todo');
  protected readonly sort = signal<Sort>('fecha');

  protected readonly id = toSignal(this.route.paramMap.pipe(map((p) => p.get('id') ?? '')), { initialValue: '' });
  private readonly all = computed(() => debtRows(this.fin.debts(), new Date(), this.fin.people(), this.fin.concepts()));
  protected readonly mine = computed(() => this.all().filter((r) => r.personId === this.id()));
  protected readonly person = computed(() => this.fin.people().find((p) => p.id === this.id()) ?? null);
  protected readonly summary = computed(() => personSummaries(this.fin.debts(), this.fin.people()).people.find((p) => p.personId === this.id()) ?? null);
  protected readonly name = computed(() => this.person()?.name ?? this.summary()?.person ?? '');

  /** Lo que sigue a la vista: sin los cargos ya pagados ni sus abonos. */
  protected readonly open = computed(() => {
    const k = this.kind();
    const rows = this.mine()
      .filter((r) => !isArchived(r, this.fin.debts()) && (k === 'todo' || r.kind === k) && this.view.debtInMonth(r) && this.view.matches(r.conceptName))
      .map((r) => ({
        row: r,
        title: r.conceptName || (r.kind === 'cargo' ? 'Préstamo' : 'Abono'),
        sub: [r.date ? shortDate(r.date) : 'Sin fecha', r.age !== null && r.age > 0 ? `hace ${r.age} ${r.age === 1 ? 'día' : 'días'}` : '', r.kind === 'cargo' && (r.balance ?? 0) > 0 ? `pendiente ${money(r.balance ?? 0)}` : r.kind === 'cargo' ? 'pagado' : '']
          .filter(Boolean)
          .join(' · '),
        signed: r.kind === 'abono' ? r.amount : -r.amount,
      }));
    return rows.sort((a, b) => (this.sort() === 'fecha' ? (b.row.date ?? '').localeCompare(a.row.date ?? '') : b.row.amount - a.row.amount));
  });

  protected readonly paid = computed(() =>
    paidCargos(this.mine()).map((g) => ({
      cargo: g.cargo,
      payments: g.payments.map((p) => ({ ...p, split: this.siblings(p) })),
    })),
  );

  private readonly opened = signal<ReadonlySet<string>>(new Set());

  // ── Estado de cuenta, edición y "regresar a pendiente"
  protected readonly statementOpen = signal(false);
  protected readonly statement = computed(() => (this.statementOpen() ? buildStatement(this.all(), this.id(), new Date()) : null));
  protected readonly editing = signal<Debt | null>(null);
  protected readonly editOpen = signal(false);
  protected readonly restoring = signal<DebtRow | null>(null);
  protected readonly restoreOpen = signal(false);
  protected readonly busy = signal(false);

  constructor() {
    this.view.setExporter(() => downloadXlsx(`${this.name() || 'Persona'} - ${today()}`, [movementsSheet([...this.mine()].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '')), this.all())]), inject(DestroyRef));
  }

  protected edit(r: DebtRow) {
    this.editing.set(r);
    this.editOpen.set(true);
  }

  protected register(kind: 'cargo' | 'abono') {
    this.add.show({ tab: 'prestamo', personId: this.id(), kind });
  }

  protected cycleSort() {
    this.sort.set(this.sort() === 'fecha' ? 'monto' : 'fecha');
  }

  /** Todos los abonos del mismo pago repartido; null si el pago fue a un solo cargo. */
  private siblings(p: DebtRow): DebtRow[] | null {
    if (!p.paymentId) return null;
    const all = this.all().filter((x) => x.paymentId === p.paymentId);
    return all.length > 1 ? all : null;
  }
  protected splitTotal(rows: DebtRow[]): number {
    return sum(rows.map((r) => r.amount));
  }
  protected target(p: DebtRow): string {
    const c = p.appliesTo ? this.all().find((x) => x.id === p.appliesTo) : null;
    return c ? c.conceptName || 'Sin concepto' : 'Sin asignar';
  }
  protected isOpen(p: DebtRow): boolean {
    return this.opened().has(p.id);
  }
  protected toggleSplit(p: DebtRow) {
    this.opened.update((s) => {
      const n = new Set(s);
      if (!n.delete(p.id)) n.add(p.id);
      return n;
    });
  }

  protected askRestore(cargo: DebtRow) {
    this.restoring.set(cargo);
    this.restoreOpen.set(true);
  }

  protected async restore() {
    const c = this.restoring();
    if (!c) return;
    this.busy.set(true);
    await this.fin.setArchived(c.id, false);
    this.busy.set(false);
    this.restoreOpen.set(false);
  }
}
