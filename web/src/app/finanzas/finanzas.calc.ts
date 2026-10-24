import { MN } from '../habits/habits.config';
import { dateKey, parseKey } from '../habits/streaks';
import { Concept, CreditCard, Cut, Debt, Expense, FamilyMove, Person } from './finanzas.models';

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
  /** Lo que toca pagar este mes en cada tarjeta activa */
  cards: { card: CreditCard; amount: number }[];
  tarjetas: number;
  fijos: number;
  /** Tarjetas + gastos fijos */
  gran: number;
  income: number;
  /** Ingreso − gran total (negativo = te faltan pesos) */
  balance: number;
}

/** Las tarjetas desactivadas no entran en el resumen. */
export function monthSummary(expenses: Expense[], income: number, cards: CreditCard[]): MonthSummary {
  const perCard = cards
    .filter((c) => c.active)
    .map((card) => ({ card, amount: sum(expenses.filter((e) => e.cardId === card.id).map((e) => e.amount)) }));
  const tarjetas = sum(perCard.map((c) => c.amount));
  const fijos = sum(expenses.filter((e) => e.section === 'fijos').map((e) => e.amount));
  const gran = round2(tarjetas + fijos);
  return { cards: perCard, tarjetas, fijos, gran, income, balance: round2(income - gran) };
}

export const cutPending = (c: Pick<Cut, 'amount' | 'paid'>): number => round2(c.amount - c.paid);

export interface CutPeriod {
  start: string;
  /** AAAA-MM-DD del día de corte */
  end: string;
  label: string;
}

/** Día `day` de un mes; si el mes es más corto (por ejemplo 31 en febrero), su último día. */
function cutDate(year: number, month: number, day: number): Date {
  return new Date(year, month, Math.min(day, new Date(year, month + 1, 0).getDate()));
}

/** Corte en curso: desde el día siguiente al corte anterior hasta el próximo día de corte. */
export function currentCutPeriod(cutDay: number, today: Date): CutPeriod {
  const thisMonth = cutDate(today.getFullYear(), today.getMonth(), cutDay);
  const end = today.getDate() <= thisMonth.getDate() ? thisMonth : cutDate(today.getFullYear(), today.getMonth() + 1, cutDay);
  const prevEnd = cutDate(end.getFullYear(), end.getMonth() - 1, cutDay);
  const start = new Date(prevEnd.getFullYear(), prevEnd.getMonth(), prevEnd.getDate() + 1);
  const part = (d: Date) => `${d.getDate()} ${MN[d.getMonth()]}`;
  return { start: dateKey(start), end: dateKey(end), label: `${part(start)} a ${part(end)}` };
}

// ── Fecha y hora en campos <input type="datetime-local"> (hora local) ──

const pad = (n: number): string => String(n).padStart(2, '0');

export function toLocalInput(d: Date): string {
  return `${dateKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const nowLocalInput = (): string => toLocalInput(new Date());

export const isoToLocalInput = (iso: string | null): string => (iso ? toLocalInput(new Date(iso)) : '');

export function localInputToIso(value: string): string | null {
  const d = new Date(value);
  return value && !Number.isNaN(d.getTime()) ? d.toISOString() : null;
}

/** Nombre del concepto de un registro: su texto libre o, si no tiene, el del catálogo. */
export const conceptLabel = (concepts: Concept[], id: string | null, text: string): string =>
  text || concepts.find((c) => c.id === id)?.name || '';

// ── Dinero que me deben ─────────────────────────────────────────────────

export interface DebtRow extends Debt {
  personName: string;
  /** Vacío si el movimiento no tiene concepto. */
  conceptName: string;
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

export function debtRows(debts: Debt[], today: Date, people: Person[], concepts: Concept[]): DebtRow[] {
  const personNames = new Map(people.map((p) => [p.id, p.name]));
  const conceptNames = new Map(concepts.map((c) => [c.id, c.name]));
  const paidTo = new Map<string, number>();
  for (const d of debts) {
    if (d.kind === 'abono' && d.appliesTo) paidTo.set(d.appliesTo, (paidTo.get(d.appliesTo) ?? 0) + d.amount);
  }
  return debts.map((d) => ({
    ...d,
    personName: personNames.get(d.personId) ?? '',
    conceptName: d.conceptText || (d.conceptId && conceptNames.get(d.conceptId)) || '',
    balance: d.kind === 'cargo' ? round2(d.amount - (paidTo.get(d.id) ?? 0)) : null,
    age: d.date ? ageDays(d.date, today) : null,
  }));
}

/** Los movimientos que cumplen `match` y, en cascada, los abonos aplicados a los cargos que desaparecen con ellos. */
export function debtsWithDependents(debts: Debt[], match: (d: Debt) => boolean): Debt[] {
  const gone = new Set(debts.filter(match).map((d) => d.id));
  let grew = true;
  while (grew) {
    grew = false;
    for (const d of debts) {
      if (!gone.has(d.id) && d.appliesTo && gone.has(d.appliesTo)) {
        gone.add(d.id);
        grew = true;
      }
    }
  }
  return debts.filter((d) => gone.has(d.id));
}

export interface PersonSummary {
  personId: string;
  person: string;
  /** Una persona desactivada sigue en el resumen: lo que te debe es dinero real. */
  active: boolean;
  lent: number;
  paid: number;
  pending: number;
  /** 0 a 1 */
  ratio: number;
}

function summarize(personId: string, person: string, active: boolean, rows: Debt[]): PersonSummary {
  const lent = sum(rows.filter((d) => d.kind === 'cargo').map((d) => d.amount));
  const paid = sum(rows.filter((d) => d.kind === 'abono').map((d) => d.amount));
  return { personId, person, active, lent, paid, pending: round2(lent - paid), ratio: lent === 0 ? 0 : paid / lent };
}

/** Una fila por persona con movimientos, en orden alfabético, y el total general. */
export function personSummaries(debts: Debt[], people: Person[]): { people: PersonSummary[]; total: PersonSummary } {
  const byId = new Map(people.map((p) => [p.id, p]));
  const groups = new Map<string, Debt[]>();
  for (const d of debts) groups.set(d.personId, [...(groups.get(d.personId) ?? []), d]);
  const list = [...groups]
    .map(([id, rows]) => summarize(id, byId.get(id)?.name ?? '', byId.get(id)?.active ?? true, rows))
    .sort((a, b) => a.person.localeCompare(b.person, 'es', { sensitivity: 'base' }));
  return { people: list, total: summarize('', 'Total', true, debts) };
}

// ── Dinero con familia ──────────────────────────────────────────────────

export function familyTotals(moves: FamilyMove[]) {
  const recibido = sum(moves.filter((m) => m.direction === 'recibido').map((m) => m.amount));
  const dado = sum(moves.filter((m) => m.direction === 'dado').map((m) => m.amount));
  return { recibido, dado, left: round2(recibido - dado) };
}

// ── Orden de los movimientos ────────────────────────────────────────────

export type SortKey = 'person' | 'kind' | 'concept' | 'amount' | 'date' | 'balance';
export interface SortSpec {
  key: SortKey;
  /** 1 = ascendente, -1 = descendente */
  dir: 1 | -1;
}

/** Ordena por varios criterios a la vez (el primero manda). Los vacíos siempre quedan al final. */
export function sortDebtRows(rows: DebtRow[], sorts: SortSpec[]): DebtRow[] {
  const specs: SortSpec[] = sorts.length ? sorts : [{ key: 'date', dir: -1 }];
  const value = (r: DebtRow, key: SortKey): string | number | null => {
    switch (key) {
      case 'person':
        return r.personName;
      case 'concept':
        return r.conceptName;
      case 'date':
        return r.date;
      case 'balance':
        return r.balance;
      case 'kind':
        return r.kind;
      case 'amount':
        return r.amount;
    }
  };
  return [...rows].sort((a, b) => {
    for (const { key, dir } of specs) {
      const x = value(a, key);
      const y = value(b, key);
      if (x === y) continue;
      if (x === null || x === '') return 1;
      if (y === null || y === '') return -1;
      const c =
        typeof x === 'number' && typeof y === 'number'
          ? x - y
          : String(x).localeCompare(String(y), 'es', { sensitivity: 'base' });
      if (c !== 0) return c * dir;
    }
    return 0;
  });
}
