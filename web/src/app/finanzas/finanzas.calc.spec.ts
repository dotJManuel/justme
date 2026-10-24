import {
  ageDays,
  currentCutPeriod,
  cutPending,
  debtRows,
  expenseTotals,
  familyTotals,
  isoToLocalInput,
  localInputToIso,
  monthSummary,
  parseMoney,
  personSummaries,
} from './finanzas.calc';
import { Cut, Debt, Expense, FamilyMove } from './finanzas.models';

const exp = (section: Expense['section'], amount: number, total: number | null = null): Expense => ({
  id: `${section}-${amount}`,
  section,
  concept: 'x',
  installment: '',
  total,
  amount,
  purchasedAt: null,
});

const debt = (id: string, person: string, kind: Debt['kind'], amount: number, appliesTo: string | null = null): Debt => ({
  id,
  person,
  kind,
  concept: '',
  amount,
  date: null,
  appliesTo,
});

describe('resumen del mes', () => {
  // Valores del Excel: Santander 6305.18, BBVA 2427, fijos 4155, ingreso 15000
  const rows = [exp('santander', 6305.18), exp('bbva', 2427), exp('fijos', 4155)];

  it('suma tarjetas y gastos fijos, y calcula el balance', () => {
    const s = monthSummary(rows, 15000);
    expect(s.tarjetas).toBe(8732.18);
    expect(s.gran).toBe(12887.18);
    expect(s.balance).toBe(2112.82);
  });

  it('el balance puede ser negativo', () => {
    expect(monthSummary(rows, 10000).balance).toBe(-2887.18);
  });

  it('los totales por sección incluyen la quincena y el monto total', () => {
    const t = expenseTotals([exp('bbva', 74, 74), exp('bbva', 259, 259), exp('bbva', 100, 100)]);
    expect(t).toEqual({ total: 433, amount: 433, quincena: 216.5 });
  });
});

describe('cortes', () => {
  it('lo pendiente es el monto menos lo pagado', () => {
    const c: Cut = { id: '1', card: 'santander', period: '13 ago a 12 sep', periodEnd: null, amount: 12714.37, paid: 6850 };
    expect(cutPending(c)).toBe(5864.37);
  });
});

describe('corte en curso', () => {
  it('Santander corta el 12: pasado el 12, el corte termina el 12 del mes siguiente', () => {
    expect(currentCutPeriod('santander', new Date(2026, 9, 23))).toEqual({ start: '2026-10-13', end: '2026-11-12', label: '13 oct a 12 nov' });
  });

  it('el mismo día de corte todavía cuenta como el corte que termina', () => {
    expect(currentCutPeriod('santander', new Date(2026, 9, 12)).label).toBe('13 sep a 12 oct');
  });

  it('BBVA corta el 24', () => {
    expect(currentCutPeriod('bbva', new Date(2026, 9, 23))).toEqual({ start: '2026-09-25', end: '2026-10-24', label: '25 sep a 24 oct' });
    expect(currentCutPeriod('bbva', new Date(2026, 9, 25)).label).toBe('25 oct a 24 nov');
  });

  it('cruza el fin de año', () => {
    expect(currentCutPeriod('santander', new Date(2026, 11, 20)).end).toBe('2027-01-12');
  });
});

describe('fecha y hora de captura', () => {
  it('ida y vuelta con el campo datetime-local', () => {
    const iso = localInputToIso('2026-10-23T14:05');
    expect(iso).not.toBeNull();
    expect(isoToLocalInput(iso)).toBe('2026-10-23T14:05');
    expect(localInputToIso('')).toBeNull();
    expect(isoToLocalInput(null)).toBe('');
  });
});

describe('dinero que me deben', () => {
  const debts = [
    debt('c1', 'Isma', 'cargo', 7000),
    debt('c2', 'Isma', 'cargo', 2599),
    debt('a1', 'Isma', 'abono', 1000, 'c1'),
    debt('a2', 'Isma', 'abono', 500, 'c1'),
    debt('a3', 'isma', 'abono', 800, 'c2'),
    debt('c3', 'Ange', 'cargo', 428),
  ];

  it('el saldo de cada cargo descuenta solo los abonos aplicados a él', () => {
    const rows = debtRows(debts, new Date(2026, 9, 23));
    expect(rows.find((r) => r.id === 'c1')?.balance).toBe(5500);
    expect(rows.find((r) => r.id === 'c2')?.balance).toBe(1799);
    expect(rows.find((r) => r.id === 'a1')?.balance).toBeNull();
  });

  it('agrupa por persona sin distinguir mayúsculas y ordena alfabéticamente', () => {
    const { people, total } = personSummaries(debts);
    expect(people.map((p) => p.person)).toEqual(['Ange', 'Isma']);
    const isma = people[1];
    expect(isma.lent).toBe(9599);
    expect(isma.paid).toBe(2300);
    expect(isma.pending).toBe(7299);
    expect(isma.ratio).toBeCloseTo(2300 / 9599);
    expect(total.pending).toBe(7727);
  });

  it('sin préstamos el porcentaje pagado es 0, no NaN', () => {
    expect(personSummaries([debt('a', 'X', 'abono', 100)]).people[0].ratio).toBe(0);
  });

  it('cuenta la antigüedad en días', () => {
    expect(ageDays('2026-10-13', new Date(2026, 9, 23, 18, 30))).toBe(10);
    expect(ageDays('2026-10-23', new Date(2026, 9, 23, 0, 5))).toBe(0);
  });
});

describe('dinero con familia', () => {
  it('lo que me queda es lo recibido menos lo dado', () => {
    const m = (direction: FamilyMove['direction'], amount: number): FamilyMove => ({
      id: `${direction}${amount}`,
      direction,
      name: 'x',
      date: null,
      amount,
    });
    expect(familyTotals([m('recibido', 1823), m('recibido', 24710), m('dado', 15000)])).toEqual({
      recibido: 26533,
      dado: 15000,
      left: 11533,
    });
  });
});

describe('parseMoney', () => {
  it('acepta pesos con símbolo y comas', () => {
    expect(parseMoney('$1,234.5')).toBe(1234.5);
    expect(parseMoney('  300 ')).toBe(300);
  });

  it('rechaza vacío, texto y negativos', () => {
    expect(parseMoney('')).toBeNull();
    expect(parseMoney('abc')).toBeNull();
    expect(parseMoney('-5')).toBeNull();
  });
});
