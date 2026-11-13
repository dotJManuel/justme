import { MN } from '../habits/habits.config';
import { IconName } from '../icons/icon';
import { money } from '../ui/money';
import { ageDays, currentCutPeriod, debtRows, personSummaries } from './finanzas.calc';
import { Concept, CreditCard, Debt, Expense, Person } from './finanzas.models';
import { endedPurchases } from './finanzas.view-calc';

/** Un corte aparece en "Por atender" cuando faltan estos días o menos. */
export const CUT_ATTENTION_DAYS = 14;
/** Alguien que debe y no paga desde hace estos días aparece en "Por atender". */
export const STALE_DEBT_DAYS = 30;

/** Algo que pide una acción tuya: un corte que se acerca, compras por limpiar o alguien que no paga. */
export interface Attention {
  key: string;
  icon: IconName;
  /** Urgente: se pinta en el color de aviso. */
  warn: boolean;
  title: string;
  sub: string;
  link: string[];
  query: Record<string, string>;
}

export interface AttentionInput {
  today: Date;
  cards: CreditCard[];
  expenses: Expense[];
  debts: Debt[];
  people: Person[];
  concepts: Concept[];
}

/** Lo que pide atención, lo más urgente primero (cortes por fecha; luego compras por limpiar y deudas sin pagos). */
export function buildAttention(input: AttentionInput, limit = 4): Attention[] {
  const { today } = input;
  const items: (Attention & { rank: number })[] = [];

  for (const card of input.cards.filter((c) => c.active)) {
    const period = currentCutPeriod(card.cutDay, today);
    const mine = input.expenses.filter((e) => e.cardId === card.id);
    const days = -ageDays(period.end, today);
    const [, m, d] = period.end.split('-').map(Number);
    if (days <= CUT_ATTENTION_DAYS) {
      const when = days <= 0 ? 'hoy' : days === 1 ? 'mañana' : `en ${days} días`;
      const amount = mine.reduce((s, e) => s + e.amount, 0);
      items.push({ key: 'cut' + card.id, rank: days, icon: 'card', warn: true, title: `Corte de ${card.name} ${when}`, sub: `${d} ${MN[m - 1]} · ${money(amount)} por pagar`, link: ['/finanzas/tarjetas'], query: { card: card.id } });
    }
    const ended = endedPurchases(mine, period.start).length;
    if (ended) {
      items.push({ key: 'clean' + card.id, rank: 100, icon: 'refresh', warn: false, title: `Limpiar compras de ${card.name}`, sub: `${ended} ${ended === 1 ? 'compra' : 'compras'} del corte anterior`, link: ['/finanzas/tarjetas'], query: { card: card.id } });
    }
  }

  const rows = debtRows(input.debts, today, input.people, input.concepts);
  for (const p of personSummaries(input.debts, input.people).people.filter((x) => x.pending > 0)) {
    const mine = rows.filter((r) => r.personId === p.personId);
    const oldest = Math.max(0, ...mine.filter((r) => r.kind === 'cargo' && (r.balance ?? 0) > 0 && !r.archived).map((r) => r.age ?? 0));
    const lastPay = mine.filter((r) => r.kind === 'abono' && r.date).map((r) => r.date as string).sort().pop();
    const since = lastPay ? ageDays(lastPay, today) : oldest;
    if (oldest >= STALE_DEBT_DAYS && since >= STALE_DEBT_DAYS) {
      items.push({ key: 'owe' + p.personId, rank: 200 - Math.min(since, 150), icon: 'users', warn: false, title: `${p.person} no ha pagado`, sub: `${money(p.pending)} · sin pagos hace ${since} días`, link: ['/finanzas/por-cobrar', p.personId], query: {} });
    }
  }

  return items.sort((a, b) => a.rank - b.rank).slice(0, limit).map(({ rank: _rank, ...item }) => item);
}
