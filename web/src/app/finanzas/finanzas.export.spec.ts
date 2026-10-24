import { DebtRow } from './finanzas.calc';
import { cutsSheet, expensesSheet, familySheet, historySheet, movementsSheet, peopleSheet } from './finanzas.export';
import { HistoryLine } from './finanzas.history';
import { Cut, Expense, FamilyMove } from './finanzas.models';

const expense = (amount: number, over: Partial<Expense> = {}): Expense => ({
  id: String(amount),
  section: 'tarjeta',
  cardId: 'sa',
  conceptId: null,
  conceptText: 'x',
  installment: '',
  total: amount,
  amount,
  purchasedAt: null,
  ...over,
});

describe('hojas de Excel', () => {
  it('gastos de tarjeta: columnas, quincena y fila de totales', () => {
    const s = expensesSheet('Santander', [expense(100), expense(51)], true, () => 'Netflix');
    expect(s.columns.map((c) => c.header)).toEqual(['Concepto', 'Fecha y hora', 'A meses', 'Monto total', 'Por pagar', 'Por quincena']);
    expect(s.rows[1]).toEqual(['Netflix', null, '', 51, 51, 25.5]);
    expect(s.total).toEqual(['Total', null, null, 151, 151, 75.5]);
  });

  it('gastos fijos: solo monto mensual y quincena', () => {
    const s = expensesSheet('Gastos fijos', [expense(500, { section: 'fijos', cardId: null })], false, () => 'Internet');
    expect(s.columns.map((c) => c.header)).toEqual(['Concepto', 'Monto mensual', 'Por quincena']);
    expect(s.rows).toEqual([['Internet', 500, 250]]);
  });

  it('cortes: del más reciente al más antiguo y con la tarjeta si se pide', () => {
    const cut = (period: string, periodEnd: string | null, amount: number, paid: number): Cut => ({ id: period, cardId: 'sa', period, periodEnd, amount, paid });
    const s = cutsSheet('Cortes', [cut('viejo', '2026-09-12', 100, 100), cut('nuevo', '2026-10-12', 200, 50), cut('sin fecha', null, 1, 0)], () => 'Santander');
    expect(s.rows.map((r) => r[1])).toEqual(['nuevo', 'viejo', 'sin fecha']);
    expect(s.rows[0]).toEqual(['Santander', 'nuevo', 200, 50, 150]);
  });

  it('resumen por persona marca a las inactivas', () => {
    const p = { personId: '1', person: 'YO', active: false, lent: 100, paid: 0, pending: 100, ratio: 0 };
    const s = peopleSheet({ people: [p], total: { ...p, person: 'Total', active: true } });
    expect(s.rows[0][0]).toBe('YO (inactiva)');
    expect(s.total).toEqual(['Total', 100, 0, 100, 0]);
  });

  it('movimientos: dice a qué cargo se aplicó cada abono', () => {
    const row = (over: Partial<DebtRow>): DebtRow => ({
      id: 'x',
      personId: 'p',
      kind: 'cargo',
      conceptId: null,
      conceptText: '',
      amount: 10,
      date: '2026-07-17',
      appliesTo: null,
      personName: 'Isma',
      conceptName: '',
      balance: null,
      age: 5,
      ...over,
    });
    const cargo = row({ id: 'c1', conceptName: 'Nintendo', balance: 6000, amount: 7000 });
    const abono = row({ id: 'a1', kind: 'abono', conceptName: 'Pago', amount: 1000, appliesTo: 'c1' });
    const s = movementsSheet([abono], [cargo, abono]);
    expect(s.rows[0][1]).toBe('Abono (pago recibido)');
    expect(s.rows[0][7]).toBe('Nintendo');
    expect(movementsSheet([cargo]).rows[0].slice(3, 7)).toEqual([7000, expect.any(Date), 5, 6000]);
  });

  it('recibido o dado suma el total', () => {
    const m = (amount: number): FamilyMove => ({ id: String(amount), direction: 'dado', conceptId: null, conceptText: 'Cena', personId: null, date: null, amount });
    const s = familySheet('Dado', [m(200), m(300)], 'Para quién', () => 'Cena', () => 'Abuelita');
    expect(s.total).toEqual(['Total', null, null, 500]);
    expect(s.rows[0]).toEqual(['Cena', 'Abuelita', null, 200]);
  });

  it('historial: acción en español y los cambios en una sola celda', () => {
    const line: HistoryLine = {
      id: 1,
      at: '2026-10-24T22:52:00.000Z',
      action: 'update',
      badge: 'Abono',
      kind: 'abono',
      who: 'Isma',
      what: 'Pago',
      amount: 600,
      when: '21 oct 2026',
      changes: [
        { label: 'Monto', from: '$500.00', to: '$600.00' },
        { label: 'Fecha', from: '20 oct', to: '21 oct' },
      ],
    };
    const s = historySheet('Movimientos', [line]);
    expect(s.rows[0].slice(1, 7)).toEqual(['Editado', 'Abono', 'Isma', 'Pago', 600, '21 oct 2026']);
    expect(s.rows[0][7]).toBe('Monto: $500.00 → $600.00; Fecha: 20 oct → 21 oct');
  });
});
