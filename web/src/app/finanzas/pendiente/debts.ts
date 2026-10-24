import { Component, computed, inject, signal, viewChild, ElementRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { dateKey } from '../../habits/streaks';
import {
  DebtRow,
  SortKey,
  SortSpec,
  debtRows,
  fmtDate,
  fmtMoney,
  parseMoney,
  personKey,
  personSummaries,
  sortDebtRows,
} from '../finanzas.calc';
import { Debt } from '../finanzas.models';
import { FinanzasService } from '../finanzas.service';

/** Dinero que me deben: resumen por persona y la lista de cargos (lo prestado) y abonos (lo pagado). */
@Component({
  selector: 'app-debts',
  imports: [FormsModule],
  templateUrl: './debts.html',
  styleUrls: ['../finanzas.shared.css', './debts.css'],
})
export class Debts {
  private readonly fin = inject(FinanzasService);
  private readonly formEl = viewChild<ElementRef<HTMLElement>>('form');

  protected readonly money = fmtMoney;
  protected readonly fmtDate = fmtDate;
  protected readonly summaryCols = 'minmax(0,1.2fr) minmax(0,1fr) minmax(0,1fr) minmax(0,1fr) minmax(0,1.3fr)';
  protected readonly movCols =
    'minmax(0,.9fr) 4.5rem minmax(0,2fr) minmax(0,1fr) minmax(0,1fr) 4rem minmax(0,1.3fr) 5.5rem';

  protected readonly rows = computed(() => debtRows(this.fin.debts(), new Date()));
  protected readonly summary = computed(() => personSummaries(this.fin.debts()));
  protected readonly people = computed(() => this.summary().people.map((p) => p.person));

  /** Persona por la que se filtran los movimientos (vacío = todas). */
  private readonly filter = signal('');
  protected readonly activeFilter = computed(() =>
    this.summary().people.some((p) => personKey(p.person) === this.filter()) ? this.filter() : '',
  );
  protected readonly sorts = signal<SortSpec[]>([]);
  protected readonly sortKeys: { key: SortKey; label: string }[] = [
    { key: 'person', label: 'Persona' },
    { key: 'kind', label: 'Tipo' },
    { key: 'concept', label: 'Concepto' },
    { key: 'amount', label: 'Monto' },
    { key: 'date', label: 'Fecha' },
    { key: 'balance', label: 'Saldo' },
  ];
  protected readonly visible = computed(() => {
    const f = this.activeFilter();
    return sortDebtRows(
      this.rows().filter((r) => !f || personKey(r.person) === f),
      this.sorts(),
    );
  });
  private readonly cargoNames = computed(() => new Map(this.rows().map((r) => [r.id, r.concept || 'Sin concepto'])));

  // Formulario de alta / edición
  protected readonly editId = signal<string | null>(null);
  protected readonly person = signal('');
  protected readonly kind = signal<Debt['kind']>('cargo');
  protected readonly concept = signal('');
  protected readonly amount = signal('');
  protected readonly date = signal(dateKey(new Date()));
  protected readonly appliesTo = signal('');

  /** Cargos de esa persona a los que se puede aplicar un abono (con saldo, o el ya elegido). */
  protected readonly appliesOptions = computed(() => {
    const p = personKey(this.person());
    if (this.kind() !== 'abono' || !p) return [];
    return this.rows().filter(
      (r) => r.kind === 'cargo' && personKey(r.person) === p && ((r.balance ?? 0) > 0 || r.id === this.appliesTo()),
    );
  });
  protected readonly appliesValue = computed(() =>
    this.appliesOptions().some((o) => o.id === this.appliesTo()) ? this.appliesTo() : '',
  );
  /** Una persona con abonos aplicados a sus cargos no se puede cambiar de nombre en el cargo. */
  protected readonly personLocked = computed(() => {
    const id = this.editId();
    return !!id && this.rows().some((r) => r.appliesTo === id);
  });
  protected readonly canSave = computed(() => this.person().trim() !== '' && (parseMoney(this.amount()) ?? 0) > 0);

  protected pct(ratio: number): string {
    return `${Math.round(ratio * 100)}%`;
  }

  /** Cada toque en un criterio: lo agrega (ascendente), lo pasa a descendente y luego lo quita. */
  protected toggleSort(key: SortKey) {
    this.sorts.update((list) => {
      const cur = list.find((s) => s.key === key);
      if (!cur) return [...list, { key, dir: 1 }];
      if (cur.dir === 1) return list.map((s) => (s.key === key ? { key, dir: -1 } : s));
      return list.filter((s) => s.key !== key);
    });
  }

  protected sortState(key: SortKey): { n: number; arrow: string } | null {
    const i = this.sorts().findIndex((s) => s.key === key);
    return i < 0 ? null : { n: i + 1, arrow: this.sorts()[i].dir === 1 ? '▲' : '▼' };
  }

  protected toggleFilter(person: string) {
    const k = personKey(person);
    this.filter.set(this.activeFilter() === k ? '' : k);
  }

  protected isFiltered(person: string): boolean {
    return this.activeFilter() === personKey(person);
  }

  protected appliesLabel(r: DebtRow): string {
    return `${r.concept || 'Sin concepto'} · ${fmtMoney(r.balance ?? 0)} pendiente`;
  }

  protected target(r: DebtRow): string {
    return (r.appliesTo && this.cargoNames().get(r.appliesTo)) || 'Sin asignar';
  }

  protected startEdit(r: DebtRow) {
    this.editId.set(r.id);
    this.person.set(r.person);
    this.kind.set(r.kind);
    this.concept.set(r.concept);
    this.amount.set(String(r.amount));
    this.date.set(r.date ?? '');
    this.appliesTo.set(r.appliesTo ?? '');
    this.formEl()?.nativeElement.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  protected clear() {
    this.editId.set(null);
    this.person.set('');
    this.concept.set('');
    this.amount.set('');
    this.date.set(dateKey(new Date()));
    this.appliesTo.set('');
  }

  protected async submit() {
    const amount = parseMoney(this.amount());
    if (!this.canSave() || !amount) return;
    const data = {
      person: this.person().trim(),
      concept: this.concept().trim(),
      amount,
      date: this.date() || null,
      appliesTo: this.kind() === 'abono' ? this.appliesValue() || null : null,
    };
    const id = this.editId();
    const ok = id ? await this.fin.updateDebt(id, data) : await this.fin.addDebt({ ...data, kind: this.kind() });
    if (ok) this.clear();
  }

  protected async remove(r: DebtRow) {
    const abonos = r.kind === 'cargo' ? this.rows().filter((x) => x.appliesTo === r.id).length : 0;
    const msg = abonos
      ? `Este cargo tiene ${abonos} abono${abonos === 1 ? '' : 's'} aplicado${abonos === 1 ? '' : 's'}; también se ${abonos === 1 ? 'eliminará' : 'eliminarán'}. ¿Continuar?`
      : `¿Eliminar este ${r.kind} de ${r.person}?`;
    if (!confirm(msg)) return;
    if (await this.fin.removeDebt(r.id)) {
      const id = this.editId();
      if (id && !this.fin.debts().some((d) => d.id === id)) this.clear();
    }
  }
}
