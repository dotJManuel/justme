import { Injectable, inject, signal } from '@angular/core';
import { PostgrestError } from '@supabase/supabase-js';
import { SupabaseService } from '../supabase.service';
import { Card, Cut, Debt, Expense, FamilyMove } from './finanzas.models';

interface ExpenseRow {
  id: string;
  section: Expense['section'];
  concept: string;
  installment: string;
  total: number | null;
  amount: number;
  purchased_at: string | null;
}
interface CutRow {
  id: string;
  card: Card;
  period: string;
  period_end: string | null;
  amount: number;
  paid: number;
}
interface DebtRow {
  id: string;
  person: string;
  kind: Debt['kind'];
  concept: string;
  amount: number;
  date: string | null;
  applies_to: string | null;
}
interface FamilyRow {
  id: string;
  direction: FamilyMove['direction'];
  name: string;
  date: string | null;
  amount: number;
}

const EXPENSE_COLS = 'id, section, concept, installment, total, amount, purchased_at';
const CUT_COLS = 'id, card, period, period_end, amount, paid';
const DEBT_COLS = 'id, person, kind, concept, amount, date, applies_to';
const FAMILY_COLS = 'id, direction, name, date, amount';

const toExpense = (r: ExpenseRow): Expense => ({
  id: r.id,
  section: r.section,
  concept: r.concept,
  installment: r.installment,
  total: r.total,
  amount: r.amount,
  purchasedAt: r.purchased_at,
});
const toCut = (r: CutRow): Cut => ({
  id: r.id,
  card: r.card,
  period: r.period,
  periodEnd: r.period_end,
  amount: r.amount,
  paid: r.paid,
});

const expenseRow = (e: Partial<Omit<Expense, 'id'>>) => ({
  ...(e.section !== undefined && { section: e.section }),
  ...(e.concept !== undefined && { concept: e.concept }),
  ...(e.installment !== undefined && { installment: e.installment }),
  ...(e.total !== undefined && { total: e.total }),
  ...(e.amount !== undefined && { amount: e.amount }),
  ...(e.purchasedAt !== undefined && { purchased_at: e.purchasedAt }),
});
const toDebt = (r: DebtRow): Debt => ({
  id: r.id,
  person: r.person,
  kind: r.kind,
  concept: r.concept,
  amount: r.amount,
  date: r.date,
  appliesTo: r.applies_to,
});
const toFamily = (r: FamilyRow): FamilyMove => ({ ...r });

const debtPatchRow = (p: Partial<Omit<Debt, 'id'>>) => ({
  ...(p.person !== undefined && { person: p.person }),
  ...(p.concept !== undefined && { concept: p.concept }),
  ...(p.amount !== undefined && { amount: p.amount }),
  ...(p.date !== undefined && { date: p.date }),
  ...(p.appliesTo !== undefined && { applies_to: p.appliesTo }),
});

/** Gastos, cortes, deudas y dinero con familia del usuario, guardados en Supabase. */
@Injectable({ providedIn: 'root' })
export class FinanzasService {
  private readonly client = inject(SupabaseService).client;

  readonly expenses = signal<Expense[]>([]);
  readonly cuts = signal<Cut[]>([]);
  readonly debts = signal<Debt[]>([]);
  readonly family = signal<FamilyMove[]>([]);
  readonly income = signal(0);

  readonly loaded = signal(false);
  /** Último error de carga o de guardado, en español; vacío si todo va bien. */
  readonly error = signal('');

  private loading?: Promise<void>;

  /** Carga una sola vez; si falla, se puede reintentar. */
  load(): Promise<void> {
    this.loading ??= this.fetch().catch((e) => {
      this.loading = undefined;
      this.error.set('No se pudieron cargar tus finanzas. Recarga la página.');
      throw e;
    });
    return this.loading;
  }

  /** Olvida lo cargado (al cambiar de usuario). */
  reset() {
    this.loading = undefined;
    this.loaded.set(false);
    this.error.set('');
    this.expenses.set([]);
    this.cuts.set([]);
    this.debts.set([]);
    this.family.set([]);
    this.income.set(0);
  }

  // Todas las escrituras devuelven true si salieron bien; si no, dejan el mensaje en `error`.

  saveIncome(amount: number): Promise<boolean> {
    return this.write(async () => {
      const { error } = await this.client
        .from('fin_settings')
        .upsert({ monthly_income: amount, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
      if (error) throw error;
      this.income.set(amount);
    });
  }

  addExpense(e: Omit<Expense, 'id'>): Promise<boolean> {
    return this.write(async () => {
      const row = await this.single<ExpenseRow>(this.client.from('fin_expenses').insert(expenseRow(e)).select(EXPENSE_COLS).single());
      this.expenses.update((l) => [...l, toExpense(row)]);
    });
  }

  updateExpense(id: string, patch: Partial<Omit<Expense, 'id' | 'section'>>): Promise<boolean> {
    return this.write(async () => {
      const { error } = await this.client.from('fin_expenses').update(expenseRow(patch)).eq('id', id);
      if (error) throw error;
      this.expenses.update((l) => l.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    });
  }

  removeExpense(id: string): Promise<boolean> {
    return this.write(async () => {
      const { error } = await this.client.from('fin_expenses').delete().eq('id', id);
      if (error) throw error;
      this.expenses.update((l) => l.filter((x) => x.id !== id));
    });
  }

  addCut(c: Omit<Cut, 'id'>): Promise<boolean> {
    return this.write(async () => {
      const row = await this.single<CutRow>(this.client
          .from('fin_cuts')
          .insert({ card: c.card, period: c.period, period_end: c.periodEnd, amount: c.amount, paid: c.paid })
          .select(CUT_COLS).single());
      this.cuts.update((l) => [...l, toCut(row)]);
    });
  }

  updateCut(id: string, patch: Pick<Cut, 'amount'> | Pick<Cut, 'paid'>): Promise<boolean> {
    return this.write(async () => {
      const { error } = await this.client.from('fin_cuts').update(patch).eq('id', id);
      if (error) throw error;
      this.cuts.update((l) => l.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    });
  }

  addDebt(d: Omit<Debt, 'id'>): Promise<boolean> {
    return this.write(async () => {
      const row = await this.single<DebtRow>(
        this.client
          .from('fin_debts')
          .insert({ person: d.person, kind: d.kind, concept: d.concept, amount: d.amount, date: d.date, applies_to: d.appliesTo })
          .select(DEBT_COLS)
          .single(),
      );
      this.debts.update((l) => [...l, toDebt(row)]);
    });
  }

  /** No se puede cambiar el tipo (cargo/abono) de un movimiento ya creado. */
  updateDebt(id: string, patch: Partial<Omit<Debt, 'id' | 'kind'>>): Promise<boolean> {
    return this.write(async () => {
      const { error } = await this.client.from('fin_debts').update(debtPatchRow(patch)).eq('id', id);
      if (error) throw error;
      this.debts.update((l) => l.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    });
  }

  /** Borrar un cargo borra también sus abonos (lo hace la base de datos; aquí se refleja igual). */
  removeDebt(id: string): Promise<boolean> {
    return this.write(async () => {
      const { error } = await this.client.from('fin_debts').delete().eq('id', id);
      if (error) throw error;
      this.debts.update((l) => l.filter((x) => x.id !== id && x.appliesTo !== id));
    });
  }

  addFamily(m: Omit<FamilyMove, 'id'>): Promise<boolean> {
    return this.write(async () => {
      const row = await this.single<FamilyRow>(this.client.from('fin_family').insert(m).select(FAMILY_COLS).single());
      this.family.update((l) => [...l, toFamily(row)]);
    });
  }

  updateFamily(id: string, patch: Partial<Omit<FamilyMove, 'id' | 'direction'>>): Promise<boolean> {
    return this.write(async () => {
      const { error } = await this.client.from('fin_family').update(patch).eq('id', id);
      if (error) throw error;
      this.family.update((l) => l.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    });
  }

  removeFamily(id: string): Promise<boolean> {
    return this.write(async () => {
      const { error } = await this.client.from('fin_family').delete().eq('id', id);
      if (error) throw error;
      this.family.update((l) => l.filter((x) => x.id !== id));
    });
  }

  private async fetch(): Promise<void> {
    const c = this.client;
    const [settings, expenses, cuts, debts, family] = await Promise.all([
      c.from('fin_settings').select('monthly_income').maybeSingle(),
      c.from('fin_expenses').select(EXPENSE_COLS).order('created_at'),
      c.from('fin_cuts').select(CUT_COLS).order('created_at'),
      c.from('fin_debts').select(DEBT_COLS).order('created_at'),
      c.from('fin_family').select(FAMILY_COLS).order('created_at'),
    ]);
    for (const r of [settings, expenses, cuts, debts, family]) if (r.error) throw r.error;
    this.income.set(settings.data?.monthly_income ?? 0);
    this.expenses.set((expenses.data as ExpenseRow[]).map(toExpense));
    this.cuts.set((cuts.data as CutRow[]).map(toCut));
    this.debts.set((debts.data as DebtRow[]).map(toDebt));
    this.family.set((family.data as FamilyRow[]).map(toFamily));
    this.loaded.set(true);
  }

  private async single<T>(query: PromiseLike<{ data: unknown; error: PostgrestError | null }>): Promise<T> {
    const { data, error } = await query;
    if (error) throw error;
    return data as T;
  }

  private async write(action: () => Promise<void>): Promise<boolean> {
    this.error.set('');
    try {
      await action();
      return true;
    } catch {
      this.error.set('No se pudo guardar. Revisa tu conexión e intenta de nuevo.');
      return false;
    }
  }
}
