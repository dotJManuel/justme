import { dateKey } from '../habits/streaks';
import { DebtRow, fmtDate, fmtMoney, round2, sum } from './finanzas.calc';

// Estado de cuenta de una persona: lo que se le prestó, lo que ha pagado y lo que aún debe, con el desglose.
// Es la información de la tarjeta que se comparte por WhatsApp; sin Angular ni DOM, para poder probarla.

export interface StatementCargo {
  date: string | null;
  concept: string;
  /** Monto original del préstamo. */
  amount: number;
  /** Lo que ya se pagó de este préstamo. */
  paid: number;
  /** Lo que todavía debe de este préstamo. */
  balance: number;
}

export interface StatementPayment {
  date: string | null;
  concept: string;
  /** El préstamo al que se aplicó el pago ("Sin asignar" si no se ligó a uno). */
  appliedTo: string;
  amount: number;
}

export interface Statement {
  person: string;
  asOf: Date;
  lent: number;
  paid: number;
  pending: number;
  /** Solo los préstamos que todavía tienen saldo, del más antiguo al más reciente. */
  cargos: StatementCargo[];
  /** Todos los pagos recibidos, del más antiguo al más reciente. */
  payments: StatementPayment[];
  /**
   * Diferencia entre el total pendiente y la suma de los préstamos pendientes: pagos que no se ligaron a ningún
   * préstamo o que se aplicaron de más. Siempre es cero o negativa; sin ella, las cuentas de la tarjeta no cuadrarían.
   */
  adjust: number;
  /** Cuántos préstamos ya quedaron liquidados (no se listan, pero sus pagos sí aparecen). */
  settled: number;
}

/** Fechas ascendentes; las que no tienen fecha, al final. */
const byDate = (a: { date: string | null }, b: { date: string | null }): number =>
  a.date === b.date ? 0 : a.date === null ? 1 : b.date === null ? -1 : a.date.localeCompare(b.date);

/** `rows` son todos los movimientos (hacen falta para saber a qué préstamo se aplicó cada pago). */
export function buildStatement(rows: DebtRow[], personId: string, asOf: Date): Statement | null {
  const mine = rows.filter((r) => r.personId === personId);
  if (!mine.length) return null;
  const byId = new Map(rows.map((r) => [r.id, r]));
  const cargos = mine.filter((r) => r.kind === 'cargo');
  const abonos = mine.filter((r) => r.kind === 'abono');

  const lent = sum(cargos.map((r) => r.amount));
  const paid = sum(abonos.map((r) => r.amount));
  const pending = round2(lent - paid);

  const open = cargos
    .filter((r) => (r.balance ?? 0) > 0.004)
    .map((r) => ({
      date: r.date,
      concept: r.conceptName || 'Sin concepto',
      amount: r.amount,
      paid: round2(r.amount - (r.balance ?? 0)),
      balance: r.balance ?? 0,
    }))
    .sort(byDate);

  const payments = abonos
    .map((r) => ({
      date: r.date,
      concept: r.conceptName || 'Pago',
      appliedTo: r.appliesTo ? (byId.get(r.appliesTo)?.conceptName || 'Sin concepto') : 'Sin asignar',
      amount: r.amount,
    }))
    .sort(byDate);

  return {
    person: mine[0].personName,
    asOf,
    lent,
    paid,
    pending,
    cargos: open,
    payments,
    adjust: round2(pending - sum(open.map((c) => c.balance))),
    settled: cargos.filter((r) => (r.balance ?? 0) <= 0.004).length,
  };
}

const day = (key: string | null): string => (key ? fmtDate(key) : 'Sin fecha');

/** El estado de cuenta en texto para WhatsApp (los asteriscos son negritas allí). */
export function statementText(s: Statement): string {
  const lines = [
    `*Estado de cuenta — ${s.person}*`,
    `Al ${fmtDate(dateKey(s.asOf))}`,
    '',
    `Prestado: ${fmtMoney(s.lent)}`,
    `Pagado: ${fmtMoney(s.paid)}`,
    `*Pendiente: ${fmtMoney(s.pending)}*`,
  ];
  if (s.cargos.length) {
    lines.push('', '*Lo que queda pendiente*');
    for (const c of s.cargos) {
      const detail = c.paid > 0 ? ` (de ${fmtMoney(c.amount)}; ya pagó ${fmtMoney(c.paid)})` : '';
      lines.push(`• ${day(c.date)} · ${c.concept} — debe ${fmtMoney(c.balance)}${detail}`);
    }
    if (Math.abs(s.adjust) > 0.004) lines.push(`• Pagos sin asignar a un préstamo: ${fmtMoney(s.adjust)}`);
  }
  if (s.payments.length) {
    lines.push('', '*Pagos recibidos*');
    for (const p of s.payments) {
      const to = p.appliedTo === 'Sin asignar' ? '' : ` (a ${p.appliedTo})`;
      lines.push(`• ${day(p.date)} · ${p.concept}${to} — ${fmtMoney(p.amount)}`);
    }
  }
  return lines.join('\n');
}
