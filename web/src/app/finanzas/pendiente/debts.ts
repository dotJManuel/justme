import { Component, computed, inject, signal, viewChild, ElementRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { dateKey } from '../../habits/streaks';
import {
  DebtRow,
  SortKey,
  SortSpec,
  debtRows,
  fmtDate,
  conceptLabel,
  fmtMoney,
  isArchived,
  localInputToIso,
  nowLocalInput,
  parseMoney,
  round2,
  sum,
  filterDebtRows,
  personSummaries,
  sortDebtRows,
} from '../finanzas.calc';
import { ConceptChange, ConceptField, ConceptValue, resolveConcept } from '../concept-field/concept-field';
import { Concept, Debt, Person } from '../finanzas.models';
import { movementsSheet, peopleSheet, today } from '../finanzas.export';
import { FinanzasService } from '../finanzas.service';
import { ExportButton } from '../export-button/export-button';
import { buildStatement } from '../finanzas.statement';
import { downloadXlsx } from '../xlsx';
import { StatementDialog } from './statement-dialog';
import { deleteMessage, deleteRowMessage, plural } from '../finanzas.warn';
import { Icon } from '../../icons/icon';

interface PayItem {
  key: string;
  r: DebtRow;
  /** Abonos del pago repartido; null si es un movimiento suelto. */
  parts: DebtRow[] | null;
  total: number;
}

/** Dinero que me deben: resumen por persona y la lista de cargos (lo prestado) y abonos (lo pagado). */
@Component({
  selector: 'app-debts',
  imports: [Icon, FormsModule, ConceptField, ExportButton, StatementDialog],
  templateUrl: './debts.html',
  styleUrls: ['../finanzas.shared.css', './debts.css'],
})
export class Debts {
  private readonly fin = inject(FinanzasService);
  private readonly formEl = viewChild<ElementRef<HTMLElement>>('form');

  protected readonly money = fmtMoney;
  protected readonly fmtDate = fmtDate;
  protected readonly summaryCols = 'minmax(0,1.2fr) minmax(0,1fr) minmax(0,1fr) minmax(0,1fr) minmax(0,1.3fr) 3rem';
  protected readonly movCols =
    'minmax(0,.9fr) 4.5rem minmax(0,2fr) minmax(0,1fr) minmax(0,1fr) 4rem minmax(0,1.3fr) 5.5rem';

  protected readonly rows = computed(() =>
    debtRows(this.fin.debts(), new Date(), this.fin.people(), this.fin.concepts()),
  );
  /** Lo que sigue a la vista: sin los cargos ya pagados (están en el Historial) ni sus abonos. */
  protected readonly openRows = computed(() => this.rows().filter((r) => !isArchived(r, this.fin.debts())));
  protected readonly summary = computed(() => personSummaries(this.fin.debts(), this.fin.people()));

  /** Persona de la que se muestra el estado de cuenta para compartir (id; vacío = ninguna). */
  protected readonly statementFor = signal('');
  protected readonly statement = computed(() =>
    this.statementFor() ? buildStatement(this.rows(), this.statementFor(), new Date()) : null,
  );

  /** Persona por la que se filtran los movimientos (id; vacío = todas). */
  private readonly filter = signal('');
  protected readonly activeFilter = computed(() =>
    this.summary().people.some((p) => p.personId === this.filter()) ? this.filter() : '',
  );

  // ── Filtros y orden de los movimientos
  /** El panel arranca abierto en pantalla grande y cerrado en celular, para no quitarle espacio a la lista. */
  protected readonly panelOpen = signal(typeof matchMedia === 'function' && matchMedia('(min-width: 761px)').matches);
  protected readonly kindFilter = signal<'' | 'cargo' | 'abono'>('');
  protected readonly search = signal('');

  protected readonly sortKeys: { key: SortKey; label: string }[] = [
    { key: 'date', label: 'Fecha' },
    { key: 'person', label: 'Persona' },
    { key: 'kind', label: 'Tipo' },
    { key: 'concept', label: 'Concepto' },
    { key: 'amount', label: 'Monto' },
    { key: 'balance', label: 'Saldo' },
  ];
  // Orden en dos niveles: "ordenar por" y, para desempatar, "luego por".
  protected readonly sortA = signal<SortKey>('date');
  protected readonly dirA = signal<1 | -1>(-1);
  protected readonly sortB = signal<SortKey | ''>('');
  protected readonly dirB = signal<1 | -1>(1);

  protected readonly sorts = computed<SortSpec[]>(() => {
    const b = this.sortB();
    return [{ key: this.sortA(), dir: this.dirA() }, ...(b && b !== this.sortA() ? [{ key: b, dir: this.dirB() }] : [])];
  });
  protected readonly visible = computed(() =>
    sortDebtRows(
      filterDebtRows(this.openRows(), { personId: this.activeFilter(), kind: this.kindFilter(), query: this.search() }),
      this.sorts(),
    ),
  );
  /** Los abonos de un mismo pago repartido se ven como un solo pago; el desglose se abre con un clic. */
  private group(list: DebtRow[]): PayItem[] {
    const all = this.rows();
    const seen = new Set<string>();
    const out: PayItem[] = [];
    for (const r of list) {
      const pid = r.kind === 'abono' ? r.paymentId : null;
      const parts = pid ? all.filter((x) => x.paymentId === pid) : [];
      if (pid && parts.length > 1) {
        if (seen.has(pid)) continue;
        seen.add(pid);
        out.push({ key: pid, r, parts, total: sum(parts.map((p) => p.amount)) });
      } else {
        out.push({ key: r.id, r, parts: null, total: r.amount });
      }
    }
    return out;
  }
  protected readonly items = computed(() => this.group(this.visible()));
  protected readonly itemCount = computed(() => this.group(this.openRows()).length);
  protected readonly expanded = signal<ReadonlySet<string>>(new Set());

  protected toggleParts(key: string) {
    this.expanded.update((s) => {
      const n = new Set(s);
      if (!n.delete(key)) n.add(key);
      return n;
    });
  }

  /** La parte de un pago cuyo cargo ya está en Pagados. */
  protected inPaid(p: DebtRow): boolean {
    return isArchived(p, this.fin.debts());
  }

  /** Borra el pago completo: todos sus abonos. */
  protected async removePayment(item: PayItem) {
    const parts = item.parts ?? [item.r];
    if (!confirm(deleteMessage(`este pago de ${item.r.personName}`, [plural(parts.length, 'abono', 'abonos')]))) return;
    for (const p of parts) if (!(await this.fin.removeDebt(p.id))) return;
    this.clear();
  }

  /** El orden por defecto: lo más reciente primero. */
  protected readonly sortChanged = computed(() => this.sortA() !== 'date' || this.dirA() !== -1 || !!this.sortB());
  protected readonly hasFilters = computed(() => !!(this.activeFilter() || this.kindFilter() || this.search().trim()));

  /** Lo que está activo, en pocas palabras (se ve aunque el panel esté cerrado). */
  protected readonly tags = computed(() => {
    const out: string[] = [];
    const person = this.summary().people.find((p) => p.personId === this.activeFilter());
    if (person) out.push(person.person);
    if (this.kindFilter()) out.push(this.kindFilter() === 'cargo' ? 'Cargos' : 'Abonos');
    if (this.search().trim()) out.push(`“${this.search().trim()}”`);
    if (this.sortChanged()) {
      const label = (k: SortKey) => this.sortKeys.find((s) => s.key === k)?.label ?? '';
      const arrow = (d: 1 | -1) => (d === 1 ? '↑' : '↓');
      const b = this.sortB();
      out.push(
        `Orden: ${label(this.sortA())} ${arrow(this.dirA())}${b && b !== this.sortA() ? ` y ${label(b)} ${arrow(this.dirB())}` : ''}`,
      );
    }
    return out;
  });
  private readonly cargoNames = computed(() => new Map(this.rows().map((r) => [r.id, r.conceptName || 'Sin concepto'])));

  // Formulario de alta / edición
  protected readonly editId = signal<string | null>(null);
  /** Id de la persona elegida (vacío = ninguna). */
  protected readonly person = signal('');
  protected readonly kind = signal<Debt['kind']>('cargo');
  /** Concepto del movimiento: del catálogo, texto libre o ninguno. */
  protected readonly concept = signal<ConceptValue>({ id: null, text: '' });
  protected readonly amount = signal('');
  protected readonly date = signal(dateKey(new Date()));
  protected readonly appliesTo = signal('');
  /** Tarjeta con la que se pagó lo prestado (id; vacío = efectivo u otra forma): genera su gasto en la tarjeta. */
  protected readonly card = signal('');
  protected readonly cardOptions = computed(() => this.fin.cards().filter((c) => c.active));
  protected readonly cardValue = computed(() => (this.cardOptions().some((c) => c.id === this.card()) ? this.card() : ''));

  /** Personas que se pueden elegir: las activas y, al editar, la que ya tiene el movimiento. */
  protected readonly personOptions = computed<Person[]>(() =>
    this.fin.people().filter((p) => p.scope === 'deudor' && (p.active || p.id === this.person())),
  );
  /** Conceptos del catálogo de movimientos (el campo oculta los desactivados). */
  protected readonly conceptOptions = computed<Concept[]>(() => this.fin.concepts().filter((c) => c.scope === 'movimiento'));
  protected readonly hasActivePeople = computed(() => this.fin.people().some((p) => p.scope === 'deudor' && p.active));

  /** Cargos de esa persona a los que se puede aplicar un abono (con saldo, o el ya elegido). */
  protected readonly appliesOptions = computed(() => {
    const p = this.person();
    if (this.kind() !== 'abono' || !p) return [];
    return this.rows().filter(
      (r) => r.kind === 'cargo' && r.personId === p && ((r.balance ?? 0) > 0 || r.id === this.appliesTo()),
    );
  });
  protected readonly appliesValue = computed(() =>
    this.appliesOptions().some((o) => o.id === this.appliesTo()) ? this.appliesTo() : '',
  );
  /** Pago nuevo: cuánto se aplica a cada cargo pendiente de la persona (texto por id de cargo). */
  protected readonly alloc = signal<Record<string, string>>({});
  protected readonly splitting = computed(() => this.kind() === 'abono' && !this.editId());
  /** Cargos pendientes de la persona elegida, entre los que se reparte un pago nuevo. */
  protected readonly pending = computed(() => {
    const p = this.person();
    if (!this.splitting() || !p) return [];
    return this.rows().filter((r) => r.kind === 'cargo' && r.personId === p && (r.balance ?? 0) > 0);
  });
  private readonly allocated = computed(() =>
    this.pending().map((c) => ({ id: c.id, balance: c.balance ?? 0, amount: parseMoney(this.alloc()[c.id] ?? '') ?? 0 })),
  );
  protected readonly allocSum = computed(() => round2(this.allocated().reduce((a, x) => a + x.amount, 0)));
  /** Lo que queda sin aplicar a ningún cargo (puede ser negativo si se reparte de más). */
  protected readonly remaining = computed(() => round2((parseMoney(this.amount()) ?? 0) - this.allocSum()));
  protected readonly allocError = computed(() => {
    if (!this.splitting()) return '';
    if (this.allocated().some((x) => x.amount > x.balance)) return 'Un cargo no puede recibir más de lo que debe.';
    if (this.remaining() < 0) return 'Repartiste más de lo que pagó.';
    return '';
  });

  /** Un cargo con abonos aplicados no puede cambiar de persona. */
  protected readonly personLocked = computed(() => {
    const id = this.editId();
    return !!id && this.rows().some((r) => r.appliesTo === id);
  });
  protected readonly canSave = computed(() => this.person() !== '' && (parseMoney(this.amount()) ?? 0) > 0 && !this.allocError());

  protected setAlloc(id: string, value: string) {
    this.alloc.update((a) => ({ ...a, [id]: value }));
  }

  /** Aplica a ese cargo todo su saldo, o lo que quede del pago si es menos. */
  protected fillAlloc(id: string, balance: number) {
    const own = parseMoney(this.alloc()[id] ?? '') ?? 0;
    const left = round2(this.remaining() + own);
    this.setAlloc(id, String(Math.max(0, Math.min(balance, left))));
  }

  protected onConcept(e: ConceptChange) {
    this.concept.set(e.value);
    e.done(true);
  }

  protected exportSummary() {
    downloadXlsx(`Resumen por persona - ${today()}`, [peopleSheet(this.summary())]);
  }

  /** Lo que se ve: con el filtro de persona y el orden elegidos. */
  protected exportMovements() {
    downloadXlsx(`Movimientos - ${today()}`, [movementsSheet(this.visible(), this.rows())]);
  }

  protected pct(ratio: number): string {
    return `${Math.round(ratio * 100)}%`;
  }

  /** Texto y números empiezan de menor a mayor (A→Z); fechas, montos y saldos, de mayor a menor. */
  private defaultDir(key: SortKey): 1 | -1 {
    return key === 'person' || key === 'kind' || key === 'concept' ? 1 : -1;
  }

  protected setSortA(key: SortKey) {
    this.sortA.set(key);
    this.dirA.set(this.defaultDir(key));
    if (this.sortB() === key) this.sortB.set('');
  }

  protected setSortB(key: SortKey | '') {
    this.sortB.set(key);
    if (key) this.dirB.set(this.defaultDir(key));
  }

  protected flipA() {
    this.dirA.update((d) => (d === 1 ? -1 : 1));
  }

  protected flipB() {
    this.dirB.update((d) => (d === 1 ? -1 : 1));
  }

  /** Cómo se lee el sentido del orden según lo que se ordena. */
  protected dirLabel(key: SortKey | '', dir: 1 | -1): string {
    if (key === 'date') return dir === -1 ? 'Más reciente primero' : 'Más antiguo primero';
    if (key === 'amount' || key === 'balance') return dir === -1 ? 'Mayor primero' : 'Menor primero';
    return dir === 1 ? 'A → Z' : 'Z → A';
  }

  protected setPerson(personId: string) {
    this.filter.set(personId);
  }

  protected resetAll() {
    this.filter.set('');
    this.kindFilter.set('');
    this.search.set('');
    this.sortA.set('date');
    this.dirA.set(-1);
    this.sortB.set('');
    this.dirB.set(1);
  }

  protected toggleFilter(personId: string) {
    this.filter.set(this.activeFilter() === personId ? '' : personId);
  }

  protected appliesLabel(r: DebtRow): string {
    return `${r.conceptName || 'Sin concepto'} · ${fmtMoney(r.balance ?? 0)} pendiente`;
  }

  protected target(r: DebtRow): string {
    return (r.appliesTo && this.cargoNames().get(r.appliesTo)) || 'Sin asignar';
  }

  protected startEdit(r: DebtRow) {
    this.editId.set(r.id);
    this.person.set(r.personId);
    this.kind.set(r.kind);
    this.concept.set({ id: r.conceptId, text: r.conceptText });
    this.amount.set(String(r.amount));
    this.date.set(r.date ?? '');
    this.appliesTo.set(r.appliesTo ?? '');
    this.formEl()?.nativeElement.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  protected clear() {
    this.editId.set(null);
    this.person.set('');
    this.concept.set({ id: null, text: '' });
    this.amount.set('');
    this.date.set(dateKey(new Date()));
    this.appliesTo.set('');
    this.card.set('');
    this.alloc.set({});
  }

  protected async submit() {
    const amount = parseMoney(this.amount());
    if (!this.canSave() || !amount) return;
    const typed = this.concept();
    const concept = typed.id !== null ? typed : resolveConcept(this.conceptOptions(), typed.text);
    const data = {
      personId: this.person(),
      conceptId: concept.id,
      conceptText: concept.text,
      amount,
      date: this.date() || null,
      appliesTo: this.kind() === 'abono' ? this.appliesValue() || null : null,
    };
    const id = this.editId();
    if (!id && this.kind() === 'abono') {
      // Un pago puede repartirse entre varios cargos: un abono por cada uno y, si sobra, uno sin asignar.
      const parts = this.allocated().filter((x) => x.amount > 0).map((x) => ({ appliesTo: x.id as string | null, amount: x.amount }));
      if (this.remaining() > 0) parts.push({ appliesTo: null, amount: this.remaining() });
      const done = await this.fin.addPayment(data.personId, parts, { conceptId: data.conceptId, conceptText: data.conceptText, date: data.date });
      if (done) this.clear();
      return;
    }
    const cardId = !id && this.kind() === 'cargo' ? this.cardValue() : '';
    const ok = id ? await this.fin.updateDebt(id, data) : await this.fin.addDebt({ ...data, kind: this.kind() });
    if (ok && cardId) {
      // Lo prestado se pagó con tarjeta: queda como compra en esa tarjeta, para el corte.
      const name = conceptLabel(this.fin.concepts(), data.conceptId, data.conceptText) || 'Préstamo';
      const who = this.fin.people().find((p) => p.id === data.personId)?.name ?? '';
      await this.fin.addExpense({
        section: 'tarjeta',
        cardId,
        conceptId: null,
        conceptText: who ? `${name} · ${who}` : name,
        installment: '',
        total: amount,
        amount,
        purchasedAt: localInputToIso(`${this.date() || nowLocalInput().slice(0, 10)}T${nowLocalInput().slice(11)}`),
      });
    }
    if (ok) this.clear();
  }

  protected async remove(r: DebtRow) {
    const abonos = r.kind === 'cargo' ? this.rows().filter((x) => x.appliesTo === r.id).length : 0;
    const msg = abonos
      ? deleteMessage(`este cargo de ${r.personName}`, [plural(abonos, 'abono aplicado', 'abonos aplicados')])
      : deleteRowMessage(`este ${r.kind} de ${r.personName}`);
    if (!confirm(msg)) return;
    if (await this.fin.removeDebt(r.id)) {
      const id = this.editId();
      if (id && !this.fin.debts().some((d) => d.id === id)) this.clear();
    }
  }
}
