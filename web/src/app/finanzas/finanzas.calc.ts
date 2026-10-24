import { parseKey } from '../habits/streaks';
import { Cut, Debt, Expense, FamilyMove } from './finanzas.models';

// Cálculos del módulo de finanzas, sin Angular ni Supabase: son los mismos que hacía el Excel.

const DAY_MS = 86_400_000;
const MAX_MONEY = 9_999_999_999.99;

export const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;
export const sum = (xs: number[]): number => round2(xs.reduce((a, b) => a + b, 0));

/** Texto de un campo de dinero a número; null si está vacío o no es un monto válido (≥ 0). */
export function parseMoney(text: string): number | null {
  const t = text.replace(/[$,\s]/g, '');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 && n <= MAX_MONEY ? round2(n) : null;
}

const money = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
export const fmtMoney = (n: number): string => money.format(n);

export function fmtDate(key: string | null): string {
  if (!key) return '';
  return parseKey(key).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Mitad de un pago mensual: lo que toca cada quincena. */
export const perQuincena = (n: number): number => round2(n / 2);

// ── Gastos ──────────────────────────────────────────────────────────────

export interface ExpenseTotals {
  total: number;
  amount: number;
  quincena: number;
}

export function expenseTotals(rows: Expense[]): ExpenseTotals {
  const amount = sum(rows.map((r) => r.amount));
  return { total: sum(rows.map((r) => r.total ?? 0)), amount, quincena: sum(rows.map((r) => perQuincena(r.amount))) };
}

export interface MonthSummary {
  santander: number;
  bbva: number;
  tarjetas: number;
  fijos: number;
  /** Tarjetas + gastos fijos */
  gran: number;
  income: number;
  /** Ingreso − gran total (negativo = te faltan pesos) */
  balance: number;
}

export function monthSummary(expenses: Expense[], income: number): MonthSummary {
  const of = (s: Expense['section']) => sum(expenses.filter((e) => e.section === s).map((e) => e.amount));
  const santander = of('santander');
  const bbva = of('bbva');
  const fijos = of('fijos');
  const gran = round2(santander + bbva + fijos);
  return { santander, bbva, tarjetas: round2(santander + bbva), fijos, gran, income, balance: round2(income - gran) };
}

export const cutPending = (c: Cut): number => round2(c.amount - c.paid);

// ── Dinero que me deben ─────────────────────────────────────────────────

export interface DebtRow extends Debt {
  /** Cargos: lo que falta por pagar de ese cargo. Abonos: null. */
  balance: number | null;
  /** Días desde la fecha del movimiento; null si no tiene fecha. */
  age: number | null;
}

/** Días completos entre `key` y `today` (en hora local). */
export function ageDays(key: string, today: Date): number {
  const from = parseKey(key);
  const to = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((to.getTime() - from.getTime()) / DAY_MS);
}

export function debtRows(debts: Debt[], today: Date): DebtRow[] {
  const paidTo = new Map<string, number>();
  for (const d of debts) {
    if (d.kind === 'abono' && d.appliesTo) paidTo.set(d.appliesTo, (paidTo.get(d.appliesTo) ?? 0) + d.amount);
  }
  return debts.map((d) => ({
    ...d,
    balance: d.kind === 'cargo' ? round2(d.amount - (paidTo.get(d.id) ?? 0)) : null,
    age: d.date ? ageDays(d.date, today) : null,
  }));
}

export interface PersonSummary {
  person: string;
  lent: number;
  paid: number;
  pending: number;
  /** 0 a 1 */
  ratio: number;
}

export const personKey = (p: string): string => p.trim().toLowerCase();

function summarize(person: string, rows: Debt[]): PersonSummary {
  const lent = sum(rows.filter((d) => d.kind === 'cargo').map((d) => d.amount));
  const paid = sum(rows.filter((d) => d.kind === 'abono').map((d) => d.amount));
  return { person, lent, paid, pending: round2(lent - paid), ratio: lent === 0 ? 0 : paid / lent };
}

/** Una fila por persona (sin distinguir mayúsculas), en orden alfabético, y el total general. */
export function personSummaries(debts: Debt[]): { people: PersonSummary[]; total: PersonSummary } {
  const groups = new Map<string, Debt[]>();
  for (const d of debts) {
    const k = personKey(d.person);
    groups.set(k, [...(groups.get(k) ?? []), d]);
  }
  const people = [...groups.values()]
    .map((rows) => summarize(rows[0].person.trim(), rows))
    .sort((a, b) => a.person.localeCompare(b.person, 'es', { sensitivity: 'base' }));
  return { people, total: summarize('Total', debts) };
}

// ── Dinero con familia ──────────────────────────────────────────────────

export function familyTotals(moves: FamilyMove[]) {
  const recibido = sum(moves.filter((m) => m.direction === 'recibido').map((m) => m.amount));
  const dado = sum(moves.filter((m) => m.direction === 'dado').map((m) => m.amount));
  return { recibido, dado, left: round2(recibido - dado) };
}
