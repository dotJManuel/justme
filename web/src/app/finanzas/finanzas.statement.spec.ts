import { DebtRow } from './finanzas.calc';
import { buildStatement, statementText } from './finanzas.statement';

const row = (over: Partial<DebtRow>): DebtRow => ({
  id: 'x',
  personId: 'p1',
  kind: 'cargo',
  conceptId: null,
  conceptText: '',
  amount: 0,
  date: null,
  appliesTo: null,
  personName: 'Isma',
  conceptName: '',
  balance: null,
  age: null,
  ...over,
});

const ASOF = new Date(2026, 9, 24);

describe('estado de cuenta', () => {
  const rows = [
    row({ id: 'c1', amount: 7000, date: '2026-07-17', conceptName: 'Nintendo', balance: 5500 }),
    row({ id: 'c2', amount: 2599, date: '2026-09-22', conceptName: 'Tenis', balance: 1799 }),
    row({ id: 'c3', amount: 300, date: '2026-05-01', conceptName: 'Cena', balance: 0 }),
    row({ id: 'a1', kind: 'abono', amount: 1000, date: '2026-07-20', conceptName: 'Pago', appliesTo: 'c1' }),
    row({ id: 'a2', kind: 'abono', amount: 500, date: '2026-08-01', appliesTo: 'c1' }),
    row({ id: 'a3', kind: 'abono', amount: 800, date: '2026-10-01', appliesTo: 'c2' }),
    row({ id: 'a4', kind: 'abono', amount: 300, date: '2026-05-10', conceptName: 'Cena', appliesTo: 'c3' }),
    row({ id: 'o1', personId: 'p2', personName: 'Ange', amount: 99, balance: 99 }),
  ];

  it('suma lo prestado, lo pagado y lo pendiente solo de esa persona', () => {
    const s = buildStatement(rows, 'p1', ASOF)!;
    expect(s).toMatchObject({ person: 'Isma', lent: 9899, paid: 2600, pending: 7299 });
  });

  it('lista solo los préstamos con saldo, del más antiguo al más reciente, con lo ya pagado de cada uno', () => {
    const s = buildStatement(rows, 'p1', ASOF)!;
    expect(s.cargos.map((c) => c.concept)).toEqual(['Nintendo', 'Tenis']);
    expect(s.cargos[0]).toMatchObject({ amount: 7000, paid: 1500, balance: 5500 });
    expect(s.settled).toBe(1);
  });

  it('lista todos los pagos en orden y dice a qué préstamo se aplicó cada uno', () => {
    const s = buildStatement(rows, 'p1', ASOF)!;
    expect(s.payments.map((p) => p.amount)).toEqual([300, 1000, 500, 800]);
    expect(s.payments[1].appliedTo).toBe('Nintendo');
  });

  it('las cuentas cuadran: préstamos pendientes + ajuste = total pendiente', () => {
    const s = buildStatement(rows, 'p1', ASOF)!;
    const open = s.cargos.reduce((n, c) => n + c.balance, 0);
    expect(Math.round((open + s.adjust) * 100) / 100).toBe(s.pending);
    expect(s.adjust).toBe(0);
  });

  it('un pago sin asignar a un préstamo aparece como ajuste negativo', () => {
    const s = buildStatement([row({ id: 'c', amount: 1000, balance: 1000, conceptName: 'X' }), row({ id: 'a', kind: 'abono', amount: 200 })], 'p1', ASOF)!;
    expect(s.pending).toBe(800);
    expect(s.adjust).toBe(-200);
    expect(s.payments[0].appliedTo).toBe('Sin asignar');
  });

  it('una persona sin movimientos no tiene estado de cuenta', () => {
    expect(buildStatement(rows, 'nadie', ASOF)).toBeNull();
  });

  it('el texto para WhatsApp trae el resumen, lo pendiente y los pagos', () => {
    const t = statementText(buildStatement(rows, 'p1', ASOF)!);
    expect(t).toContain('*Estado de cuenta — Isma*');
    expect(t).toContain('*Pendiente: ');
    expect(t).toContain('Lo que queda pendiente');
    expect(t).toContain('Nintendo');
    expect(t).toContain('Pagos recibidos');
    expect(t).toContain('(a Nintendo)');
  });
});
