import { Injectable, inject, signal } from '@angular/core';
import { PostgrestError } from '@supabase/supabase-js';
import { SupabaseService } from '../supabase.service';
import { Concept, CreditCard, Cut, Debt, Expense, FamilyMove } from './finanzas.models';

interface ConceptRow {
  id: string;
  scope: Concept['scope'];
  name: string;
  active: boolean;
}
interface CardRow {
  id: string;
  name: string;
  cut_day: number;
  active: boolean;
}
interface ExpenseRow {
  id: string;
  card_id: string | null;
  section: Expense['section'];
  concept_id: string;
  installment: string;
  total: number | null;
  amount: number;
  purchased_at: string | null;
}
interface CutRow {
  id: string;
  card_id: string;
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
  person: string;
  date: string | null;
  amount: number;
}

const CONCEPT_COLS = 'id, scope, name, active';
const CARD_COLS = 'id, name, cut_day, active';
const EXPENSE_COLS = 'id, card_id, section, concept_id, installment, total, amount, purchased_at';
const CUT_COLS = 'id, card_id, period, period_end, amount, paid';
const DEBT_COLS = 'id, person, kind, concept, amount, date, applies_to';
const FAMILY_COLS = 'id, direction, name, person, date, amount';

const toConcept = (r: ConceptRow): Concept => ({ ...r });
const toCard = (r: CardRow): CreditCard => ({ id: r.id, name: r.name, cutDay: r.cut_day, active: r.active });
const toExpense = (r: ExpenseRow): Expense => ({
  id: r.id,
  cardId: r.card_id,
  section: r.section,
  conceptId: r.concept_id,
  installment: r.installment,
  total: r.total,
  amount: r.amount,
  purchasedAt: r.purchased_at,
});
const toCut = (r: CutRow): Cut => ({
  id: r.id,
  cardId: r.card_id,
  period: r.period,
  periodEnd: r.period_end,
  amount: r.amount,
  paid: r.paid,
});

const expenseRow = (e: Partial<Omit<Expense, 'id'>>) => ({
  ...(e.section !== undefined && { section: e.section }),
  ...(e.cardId !== undefined && { card_id: e.cardId }),
  ...(e.conceptId !== undefined && { concept_id: e.conceptId }),
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

  readonly concepts = signal<Concept[]>([]);
  readonly cards = signal<CreditCard[]>([]);
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
    this.concepts.set([]);
    this.cards.set([]);
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

  addConcept(scope: Concept['scope'], name: string): Promise<boolean> {
    return this.write(async () => {
      const row = await this.single<ConceptRow>(
        this.client.from('fin_concepts').insert({ scope, name }).select(CONCEPT_COLS).single(),
      );
      this.concepts.update((l) => [...l, toConcept(row)]);
    });
  }

  updateConcept(id: string, patch: Partial<Pick<Concept, 'name' | 'active'>>): Promise<boolean> {
    return this.write(async () => {
      const { error } = await this.client.from('fin_concepts').update(patch).eq('id', id);
      if (error) throw error;
      this.concepts.update((l) => l.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    });
  }

  /** Borrar un concepto borra también los gastos que lo usan (lo hace la base de datos; aquí se refleja igual). */
  removeConcept(id: string): Promise<boolean> {
    return this.write(async () => {
      const { error } = await this.client.from('fin_concepts').delete().eq('id', id);
      if (error) throw error;
      this.concepts.update((l) => l.filter((x) => x.id !== id));
      this.expenses.update((l) => l.filter((x) => x.conceptId !== id));
    });
  }

  addCard(name: string, cutDay: number): Promise<boolean> {
    return this.write(async () => {
      const row = await this.single<CardRow>(
        this.client.from('fin_cards').insert({ name, cut_day: cutDay }).select(CARD_COLS).single(),
      );
      this.cards.update((l) => [...l, toCard(row)]);
    });
  }

  updateCard(id: string, patch: Partial<Omit<CreditCard, 'id'>>): Promise<boolean> {
    return this.write(async () => {
      const row = {
        ...(patch.name !== undefined && { name: patch.name }),
        ...(patch.cutDay !== undefined && { cut_day: patch.cutDay }),
        ...(patch.active !== undefined && { active: patch.active }),
      };
      const { error } = await this.client.from('fin_cards').update(row).eq('id', id);
      if (error) throw error;
      this.cards.update((l) => l.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    });
  }

  /** Borrar una tarjeta borra también sus gastos y cortes (lo hace la base de datos; aquí se refleja igual). */
  removeCard(id: string): Promise<boolean> {
    return this.write(async () => {
      const { error } = await this.client.from('fin_cards').delete().eq('id', id);
      if (error) throw error;
      this.cards.update((l) => l.filter((x) => x.id !== id));
      this.expenses.update((l) => l.filter((x) => x.cardId !== id));
      this.cuts.update((l) => l.filter((x) => x.cardId !== id));
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
          .insert({ card_id: c.cardId, period: c.period, period_end: c.periodEnd, amount: c.amount, paid: c.paid })
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
    const [settings, concepts, cards, expenses, cuts, debts, family] = await Promise.all([
      c.from('fin_settings').select('monthly_income').maybeSingle(),
      c.from('fin_concepts').select(CONCEPT_COLS).order('created_at'),
      c.from('fin_cards').select(CARD_COLS).order('created_at'),
      c.from('fin_expenses').select(EXPENSE_COLS).order('created_at'),
      c.from('fin_cuts').select(CUT_COLS).order('created_at'),
      c.from('fin_debts').select(DEBT_COLS).order('created_at'),
      c.from('fin_family').select(FAMILY_COLS).order('created_at'),
    ]);
    for (const r of [settings, concepts, cards, expenses, cuts, debts, family]) if (r.error) throw r.error;
    this.income.set(settings.data?.monthly_income ?? 0);
    this.concepts.set((concepts.data as ConceptRow[]).map(toConcept));
    this.cards.set((cards.data as CardRow[]).map(toCard));
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
    } catch (e) {
      // 23505 = valor repetido (por ejemplo, dos tarjetas con el mismo nombre)
      this.error.set(
        (e as PostgrestError | undefined)?.code === '23505'
          ? 'Ese nombre ya existe. Usa otro.'
          : 'No se pudo guardar. Revisa tu conexión e intenta de nuevo.',
      );
      return false;
    }
  }
}
