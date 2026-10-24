import { dateKey, parseKey } from '../habits/streaks';
import { DebtRow, MonthSummary, PersonSummary, cutPending, expenseTotals, perQuincena, sum } from './finanzas.calc';
import { HistoryLine } from './finanzas.history';
import { Cut, Expense, FamilyMove } from './finanzas.models';
import { Sheet } from './xlsx';

// Hojas de Excel de cada desglose de Finanzas. Son funciones puras: reciben lo que se ve en pantalla y devuelven
// la hoja; quien las llama decide el nombre del archivo y la descarga (ver xlsx.ts).

/** Fecha de hoy como AAAA-MM-DD, para el nombre de los archivos. */
export const today = (): string => dateKey(new Date());

const day = (key: string | null): Date | null => (key ? parseKey(key) : null);
const stamp = (iso: string | null): Date | null => (iso ? new Date(iso) : null);

export function summarySheet(s: MonthSummary): Sheet {
  return {
    name: 'Resumen del mes',
    columns: [
      { header: 'Concepto', width: 34 },
      { header: 'Monto', width: 16, type: 'money' },
    ],
    rows: [
      ...s.cards.map((c): [string, number] => [`Tarjeta ${c.card.name} (a pagar)`, c.amount]),
      ['Total tarjetas (a pagar)', s.tarjetas],
      ['Gastos fijos', s.fijos],
      ['Gran total del mes', s.gran],
      ['Ingreso mensual', s.income],
      ['Balance', s.balance],
    ],
  };
}

/** Gastos de una tarjeta (con fecha, "a meses" y monto total) o gastos fijos (solo monto mensual). */
export function expensesSheet(name: string, rows: Expense[], isCard: boolean, labelOf: (e: Expense) => string): Sheet {
  const t = expenseTotals(rows);
  if (!isCard) {
    return {
      name,
      columns: [
        { header: 'Concepto', width: 36 },
        { header: 'Monto mensual', width: 16, type: 'money' },
        { header: 'Por quincena', width: 16, type: 'money' },
      ],
      rows: rows.map((r) => [labelOf(r), r.amount, perQuincena(r.amount)]),
      total: ['Total', t.amount, t.quincena],
    };
  }
  return {
    name,
    columns: [
      { header: 'Concepto', width: 36 },
      { header: 'Fecha y hora', width: 18, type: 'datetime' },
      { header: 'A meses', width: 10 },
      { header: 'Monto total', width: 15, type: 'money' },
      { header: 'Por pagar', width: 15, type: 'money' },
      { header: 'Por quincena', width: 15, type: 'money' },
    ],
    rows: rows.map((r) => [labelOf(r), stamp(r.purchasedAt), r.installment, r.total, r.amount, perQuincena(r.amount)]),
    total: ['Total', null, null, t.total, t.amount, t.quincena],
  };
}

/** Cortes, del más reciente al más antiguo. Con `cardName` agrega la columna de la tarjeta. */
export function cutsSheet(name: string, cuts: Cut[], cardName?: (cardId: string) => string): Sheet {
  const sorted = [...cuts].sort((a, b) => (b.periodEnd ?? '').localeCompare(a.periodEnd ?? ''));
  const withCard = !!cardName;
  return {
    name,
    columns: [
      ...(withCard ? [{ header: 'Tarjeta', width: 22 }] : []),
      { header: 'Periodo de corte', width: 26 },
      { header: 'Monto del corte', width: 16, type: 'money' as const },
      { header: 'Pagado', width: 16, type: 'money' as const },
      { header: 'Pendiente', width: 16, type: 'money' as const },
    ],
    rows: sorted.map((c) => [...(cardName ? [cardName(c.cardId)] : []), c.period, c.amount, c.paid, cutPending(c)]),
  };
}

export function peopleSheet(s: { people: PersonSummary[]; total: PersonSummary }): Sheet {
  const row = (p: PersonSummary) => [p.person + (p.active ? '' : ' (inactiva)'), p.lent, p.paid, p.pending, p.ratio];
  return {
    name: 'Resumen por persona',
    columns: [
      { header: 'Persona', width: 26 },
      { header: 'Prestado', width: 16, type: 'money' },
      { header: 'Pagado', width: 16, type: 'money' },
      { header: 'Pendiente', width: 16, type: 'money' },
      { header: '% pagado', width: 12, type: 'percent' },
    ],
    rows: s.people.map(row),
    total: ['Total', s.total.lent, s.total.paid, s.total.pending, s.total.ratio],
  };
}

/** Cargos y abonos. `all` son todos los movimientos (para decir a qué cargo se aplicó cada abono). */
export function movementsSheet(rows: DebtRow[], all: DebtRow[] = rows): Sheet {
  const concept = new Map(all.map((r) => [r.id, r.conceptName || 'Sin concepto']));
  return {
    name: 'Movimientos',
    columns: [
      { header: 'Persona', width: 22 },
      { header: 'Tipo', width: 22 },
      { header: 'Concepto', width: 36 },
      { header: 'Monto', width: 15, type: 'money' },
      { header: 'Fecha', width: 14, type: 'date' },
      { header: 'Días', width: 8, type: 'int' },
      { header: 'Saldo', width: 15, type: 'money' },
      { header: 'Aplica a', width: 30 },
    ],
    rows: rows.map((r) => [
      r.personName,
      r.kind === 'cargo' ? 'Cargo (préstamo)' : 'Abono (pago recibido)',
      r.conceptName,
      r.amount,
      day(r.date),
      r.age,
      r.balance,
      r.appliesTo ? (concept.get(r.appliesTo) ?? '') : '',
    ]),
  };
}

/** Recibido o dado. `conceptOf` y `personOf` devuelven el nombre ya resuelto. */
export function familySheet(
  name: string,
  rows: FamilyMove[],
  personHeader: string,
  conceptOf: (m: FamilyMove) => string,
  personOf: (m: FamilyMove) => string,
): Sheet {
  return {
    name,
    columns: [
      { header: 'Concepto', width: 34 },
      { header: personHeader, width: 24 },
      { header: 'Fecha', width: 14, type: 'date' },
      { header: 'Monto', width: 15, type: 'money' },
    ],
    rows: rows.map((m) => [conceptOf(m), personOf(m), day(m.date), m.amount]),
    total: ['Total', null, null, sum(rows.map((m) => m.amount))],
  };
}

const ACTION = { insert: 'Agregado', update: 'Editado', delete: 'Eliminado' } as const;

export function historySheet(name: string, lines: HistoryLine[]): Sheet {
  return {
    name,
    columns: [
      { header: 'Registrado', width: 18, type: 'datetime' },
      { header: 'Acción', width: 12 },
      { header: 'Tipo', width: 12 },
      { header: 'Persona / tarjeta', width: 24 },
      { header: 'Concepto', width: 34 },
      { header: 'Monto', width: 15, type: 'money' },
      { header: 'Fecha del movimiento', width: 20 },
      { header: 'Cambios', width: 60 },
    ],
    rows: lines.map((l) => [
      new Date(l.at),
      ACTION[l.action],
      l.badge,
      l.who,
      l.what,
      l.amount,
      l.when,
      l.changes.map((c) => `${c.label}: ${c.from} → ${c.to}`).join('; '),
    ]),
  };
}
