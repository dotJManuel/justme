import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
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
import { EmptyState } from '../../ui/states';
import { EditDebt } from '../edit/edit-simple';
import { DebtRow, debtRows, fmtDate, isArchived, paidCargos, personSummaries, sum } from '../finanzas.calc';
import { movementsSheet, today } from '../finanzas.export';
import { FinanzasView, monthName } from '../finanzas-view';
import { Debt } from '../finanzas.models';
import { FinanzasService } from '../finanzas.service';
import { buildStatement } from '../finanzas.statement';
import { StatementDialog } from '../pendiente/statement-dialog';
import { shortDate } from '../finanzas.view-calc';
import { downloadXlsx } from '../xlsx';

type Tab = 'pendientes' | 'saldados' | 'todo';

/**
 * Ficha de una persona: lo que te debe y, por mes, cada cargo con lo que falta y lo que ya pagó (con sus pagos a un
 * toque); los cargos saldados y todos sus movimientos. Desde aquí se registra un pago o se comparte su estado de cuenta.
 */
@Component({
  selector: 'app-persona-page',
  imports: [Button, Chip, ConfirmDialog, EditDebt, EmptyState, Icon, ProgressBar, RouterLink, StatementDialog],
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
  protected readonly tab = signal<Tab>('pendientes');

  protected readonly id = toSignal(this.route.paramMap.pipe(map((p) => p.get('id') ?? '')), { initialValue: '' });
  private readonly now = new Date();
  private readonly all = computed(() => debtRows(this.fin.debts(), this.now, this.fin.people(), this.fin.concepts()));
  protected readonly mine = computed(() => this.all().filter((r) => r.personId === this.id()));
  protected readonly person = computed(() => this.fin.people().find((p) => p.id === this.id()) ?? null);
  protected readonly summary = computed(() => personSummaries(this.fin.debts(), this.fin.people()).people.find((p) => p.personId === this.id()) ?? null);
  protected readonly name = computed(() => this.person()?.name ?? this.summary()?.person ?? '');

  /** Pagos aplicados a un cargo, del más reciente al más antiguo. */
  private paymentsOf(cargo: DebtRow) {
    return this.mine()
      .filter((x) => x.appliesTo === cargo.id)
      .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
      .map((p) => ({ row: p, split: this.siblings(p) }));
  }

  /** Cargos con saldo, por mes: lo que falta (grande), lo pagado y los pagos aplicados. */
  protected readonly pending = computed(() => {
    const cargos = this.mine()
      .filter((r) => r.kind === 'cargo' && !r.archived && (r.balance ?? 0) > 0)
      .filter((r) => this.view.debtInMonth(r) && this.view.matches(r.conceptName))
      .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
    const groups = new Map<string, { key: string; label: string; owed: number; items: ReturnType<PersonaPage['cargoView']>[] }>();
    for (const r of cargos) {
      const key = r.date?.slice(0, 7) ?? 'sin';
      const g = groups.get(key) ?? { key, label: key === 'sin' ? 'Sin fecha' : monthName(key), owed: 0, items: [] };
      const item = this.cargoView(r);
      g.items.push(item);
      g.owed += item.owed;
      groups.set(key, g);
    }
    return [...groups.values()];
  });

  private cargoView(r: DebtRow) {
    const owed = r.balance ?? 0;
    const paid = Math.max(0, r.amount - owed);
    const pays = this.paymentsOf(r);
    return {
      row: r,
      title: r.conceptName || 'Préstamo',
      sub: [r.date ? shortDate(r.date) : 'Sin fecha', r.age !== null && r.age > 0 ? `hace ${r.age} ${r.age === 1 ? 'día' : 'días'}` : r.age === 0 ? 'hoy' : ''].filter(Boolean).join(' · '),
      owed,
      total: r.amount,
      paid,
      pct: r.amount > 0 ? Math.round((paid / r.amount) * 100) : 0,
      pays,
    };
  }

  /** Pagos que no se aplicaron a ningún cargo. */
  protected readonly loose = computed(() =>
    this.mine()
      .filter((r) => r.kind === 'abono' && !r.appliesTo && this.view.debtInMonth(r) && this.view.matches(r.conceptName))
      .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '')),
  );

  protected readonly pendingCount = computed(() => this.mine().filter((r) => r.kind === 'cargo' && !r.archived && (r.balance ?? 0) > 0).length);
  protected readonly paid = computed(() =>
    paidCargos(this.mine()).map((g) => ({
      cargo: g.cargo,
      payments: g.payments.map((p) => ({ ...p, split: this.siblings(p) })),
    })),
  );

  /** Todos los movimientos, del más reciente al más antiguo. */
  protected readonly ledger = computed(() =>
    this.mine()
      .filter((r) => this.view.debtInMonth(r) && this.view.matches(r.conceptName))
      .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
      .map((r) => ({
        row: r,
        title: r.conceptName || (r.kind === 'cargo' ? 'Préstamo' : 'Pago'),
        sub: [r.date ? shortDate(r.date) : 'Sin fecha', isArchived(r, this.fin.debts()) ? 'saldado' : ''].filter(Boolean).join(' · '),
        signed: r.kind === 'abono' ? r.amount : -r.amount,
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

  /** Exporta los movimientos de esta persona (lo llama "Por cobrar" cuando la ficha está abierta). */
  exportOne() {
    downloadXlsx(`${this.name() || 'Persona'} - ${today()}`, [movementsSheet([...this.mine()].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '')), this.all())]);
  }

  protected edit(r: DebtRow) {
    this.editing.set(r);
    this.editOpen.set(true);
  }

  protected register(kind: 'cargo' | 'abono') {
    this.add.show({ tab: 'prestamo', personId: this.id(), kind });
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
  protected isOpen(key: string): boolean {
    return this.opened().has(key);
  }
  protected toggle(key: string) {
    this.opened.update((s) => {
      const n = new Set(s);
      if (!n.delete(key)) n.add(key);
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
