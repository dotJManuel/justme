import {
  ageDays,
  currentCutPeriod,
  cutPending,
  debtRows,
  conceptLabel,
  debtsWithDependents,
  expenseTotals,
  familyTotals,
  filterDebtRows,
  isoToLocalInput,
  localInputToIso,
  monthSummary,
  parseMoney,
  personSummaries,
  resolveConcept,
  sortDebtRows,
} from './finanzas.calc';
import { Concept, CreditCard, Cut, Debt, Expense, FamilyMove, Person } from './finanzas.models';

const SANTANDER: CreditCard = { id: 'sa', name: 'Santander', cutDay: 12, active: true };
const BBVA: CreditCard = { id: 'bb', name: 'BBVA', cutDay: 24, active: true };

/** cardId = tarjeta del gasto; null = gasto fijo */
const exp = (cardId: string | null, amount: number, total: number | null = null): Expense => ({
  id: `${cardId}-${amount}`,
  section: cardId ? 'tarjeta' : 'fijos',
  cardId,
  conceptId: 'k',
  conceptText: '',
  installment: '',
  total,
  amount,
  purchasedAt: null,
});

const PEOPLE: Person[] = [
  { id: 'p-isma', scope: 'deudor', name: 'Isma', active: true },
  { id: 'p-ange', scope: 'deudor', name: 'Ange', active: true },
  { id: 'p-yo', scope: 'deudor', name: 'YO', active: false },
];
const CONCEPTS: Concept[] = [{ id: 'k-pago', scope: 'movimiento', name: 'Pago', active: true }];

const debt = (
  id: string,
  personId: string,
  kind: Debt['kind'],
  amount: number,
  appliesTo: string | null = null,
  conceptId: string | null = null,
): Debt => ({ id, personId, kind, conceptId, conceptText: '', amount, date: null, appliesTo });

describe('resumen del mes', () => {
  // Valores del Excel: Santander 6305.18, BBVA 2427, fijos 4155, ingreso 15000
  const rows = [exp('sa', 6305.18), exp('bb', 2427), exp(null, 4155)];
  const cards = [SANTANDER, BBVA];

  it('suma tarjetas y gastos fijos, y calcula el balance', () => {
    const s = monthSummary(rows, 15000, cards);
    expect(s.tarjetas).toBe(8732.18);
    expect(s.gran).toBe(12887.18);
    expect(s.balance).toBe(2112.82);
  });

  it('una tarjeta desactivada no suma en el resumen', () => {
    const s = monthSummary(rows, 15000, [SANTANDER, { ...BBVA, active: false }]);
    expect(s.cards.map((c) => c.card.name)).toEqual(['Santander']);
    expect(s.tarjetas).toBe(6305.18);
    expect(s.gran).toBe(10460.18);
  });

  it('el balance puede ser negativo', () => {
    expect(monthSummary(rows, 10000, cards).balance).toBe(-2887.18);
  });

  it('los totales por sección incluyen la quincena y el monto total', () => {
    const t = expenseTotals([exp('bb', 74, 74), exp('bb', 259, 259), exp('bb', 100, 100)]);
    expect(t).toEqual({ total: 433, amount: 433, quincena: 216.5 });
  });
});

describe('cortes', () => {
  it('lo pendiente es el monto menos lo pagado', () => {
    const c: Cut = { id: '1', cardId: 'sa', period: '13 ago a 12 sep', periodEnd: null, amount: 12714.37, paid: 6850 };
    expect(cutPending(c)).toBe(5864.37);
  });
});

describe('corte en curso', () => {
  it('Santander corta el 12: pasado el 12, el corte termina el 12 del mes siguiente', () => {
    expect(currentCutPeriod(12, new Date(2026, 9, 23))).toEqual({ start: '2026-10-13', end: '2026-11-12', label: '13 oct a 12 nov' });
  });

  it('el mismo día de corte todavía cuenta como el corte que termina', () => {
    expect(currentCutPeriod(12, new Date(2026, 9, 12)).label).toBe('13 sep a 12 oct');
  });

  it('BBVA corta el 24', () => {
    expect(currentCutPeriod(24, new Date(2026, 9, 23))).toEqual({ start: '2026-09-25', end: '2026-10-24', label: '25 sep a 24 oct' });
    expect(currentCutPeriod(24, new Date(2026, 9, 25)).label).toBe('25 oct a 24 nov');
  });

  it('si el mes es más corto, el corte cae en su último día', () => {
    expect(currentCutPeriod(31, new Date(2027, 1, 10)).label).toBe('1 feb a 28 feb');
    expect(currentCutPeriod(31, new Date(2026, 3, 10)).label).toBe('1 abr a 30 abr');
  });

  it('cruza el fin de año', () => {
    expect(currentCutPeriod(12, new Date(2026, 11, 20)).end).toBe('2027-01-12');
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
    debt('c1', 'p-isma', 'cargo', 7000),
    debt('c2', 'p-isma', 'cargo', 2599),
    debt('a1', 'p-isma', 'abono', 1000, 'c1', 'k-pago'),
    debt('a2', 'p-isma', 'abono', 500, 'c1'),
    debt('a3', 'p-isma', 'abono', 800, 'c2'),
    debt('c3', 'p-ange', 'cargo', 428),
  ];
  const today = new Date(2026, 9, 23);

  it('el saldo de cada cargo descuenta solo los abonos aplicados a él', () => {
    const rows = debtRows(debts, today, PEOPLE, CONCEPTS);
    expect(rows.find((r) => r.id === 'c1')?.balance).toBe(5500);
    expect(rows.find((r) => r.id === 'c2')?.balance).toBe(1799);
    expect(rows.find((r) => r.id === 'a1')?.balance).toBeNull();
  });

  it('resuelve el nombre de la persona y del concepto (vacío si no tiene)', () => {
    const rows = debtRows(debts, today, PEOPLE, CONCEPTS);
    expect(rows.find((r) => r.id === 'a1')).toMatchObject({ personName: 'Isma', conceptName: 'Pago' });
    expect(rows.find((r) => r.id === 'c1')?.conceptName).toBe('');
  });

  it('un concepto de texto libre manda sobre el del catálogo y también se muestra', () => {
    const free = { ...debt('f1', 'p-ange', 'cargo', 10), conceptText: 'Regalo único' };
    expect(debtRows([free], today, PEOPLE, CONCEPTS)[0].conceptName).toBe('Regalo único');
    expect(conceptLabel(CONCEPTS, 'k-pago', '')).toBe('Pago');
    expect(conceptLabel(CONCEPTS, null, 'Algo único')).toBe('Algo único');
    expect(conceptLabel(CONCEPTS, null, '')).toBe('');
  });

  it('agrupa por persona y ordena alfabéticamente', () => {
    const { people, total } = personSummaries(debts, PEOPLE);
    expect(people.map((p) => p.person)).toEqual(['Ange', 'Isma']);
    const isma = people[1];
    expect(isma.lent).toBe(9599);
    expect(isma.paid).toBe(2300);
    expect(isma.pending).toBe(7299);
    expect(isma.ratio).toBeCloseTo(2300 / 9599);
    expect(total.pending).toBe(7727);
  });

  it('una persona desactivada sigue en el resumen, marcada como inactiva', () => {
    const { people, total } = personSummaries([debt('x', 'p-yo', 'cargo', 100)], PEOPLE);
    expect(people[0]).toMatchObject({ person: 'YO', active: false, pending: 100 });
    expect(total.pending).toBe(100);
  });

  it('sin préstamos el porcentaje pagado es 0, no NaN', () => {
    expect(personSummaries([debt('a', 'p-isma', 'abono', 100)], PEOPLE).people[0].ratio).toBe(0);
  });

  it('cuenta la antigüedad en días', () => {
    expect(ageDays('2026-10-13', new Date(2026, 9, 23, 18, 30))).toBe(10);
    expect(ageDays('2026-10-23', new Date(2026, 9, 23, 0, 5))).toBe(0);
  });

  it('borrar un cargo arrastra los abonos aplicados a él', () => {
    expect(debtsWithDependents(debts, (d) => d.id === 'c1').map((d) => d.id)).toEqual(['c1', 'a1', 'a2']);
  });

  it('borrar un concepto arrastra los abonos de los cargos que desaparecen', () => {
    const withConcept = [debt('c9', 'p-ange', 'cargo', 50, null, 'k-pago'), debt('a9', 'p-ange', 'abono', 20, 'c9')];
    expect(debtsWithDependents(withConcept, (d) => d.conceptId === 'k-pago').map((d) => d.id)).toEqual(['c9', 'a9']);
  });
});

describe('filtro de movimientos', () => {
  const mk = (id: string, personId: string, personName: string, kind: Debt['kind'], conceptName: string): ReturnType<typeof debtRows>[number] => ({
    ...debt(id, personId, kind, 10),
    personName,
    conceptName,
    balance: null,
    age: null,
  });
  const rows = [mk('1', 'p-isma', 'Isma', 'cargo', 'Café'), mk('2', 'p-isma', 'Isma', 'abono', 'Pago'), mk('3', 'p-ange', 'Ange', 'cargo', 'Cena')];
  const ids = (f: Parameters<typeof filterDebtRows>[1]) => filterDebtRows(rows, f).map((r) => r.id).join('');
  const none = { personId: '', kind: '' as const, query: '' };

  it('sin filtros deja todo', () => {
    expect(ids(none)).toBe('123');
  });

  it('por persona y por tipo, juntos', () => {
    expect(ids({ ...none, personId: 'p-isma' })).toBe('12');
    expect(ids({ ...none, kind: 'cargo' })).toBe('13');
    expect(ids({ ...none, personId: 'p-isma', kind: 'abono' })).toBe('2');
  });

  it('la búsqueda ignora mayúsculas y acentos y mira persona y concepto', () => {
    expect(ids({ ...none, query: 'cafe' })).toBe('1');
    expect(ids({ ...none, query: 'ANGE' })).toBe('3');
    expect(ids({ ...none, query: 'zzz' })).toBe('');
  });
});

describe('orden de movimientos', () => {
  const at = (id: string, personId: string, kind: Debt['kind'], amount: number, date: string | null): Debt => ({
    ...debt(id, personId, kind, amount),
    date,
  });
  const rows = debtRows(
    [
      at('1', 'p-isma', 'cargo', 300, '2026-10-01'),
      at('2', 'p-ange', 'abono', 100, '2026-10-05'),
      at('3', 'p-ange', 'cargo', 200, null),
      at('4', 'p-ange', 'cargo', 500, '2026-09-01'),
    ],
    new Date(2026, 9, 23),
    PEOPLE,
    CONCEPTS,
  );
  const ids = (s: Parameters<typeof sortDebtRows>[1]) => sortDebtRows(rows, s).map((r) => r.id).join('');

  it('sin criterios: la fecha más reciente primero y sin fecha al final', () => {
    expect(ids([])).toBe('2143');
  });

  it('combina criterios: persona y luego monto descendente', () => {
    expect(ids([{ key: 'person', dir: 1 }, { key: 'amount', dir: -1 }])).toBe('4321');
  });

  it('los vacíos quedan al final también en descendente', () => {
    expect(ids([{ key: 'date', dir: 1 }])).toBe('4123');
    expect(ids([{ key: 'date', dir: -1 }])).toBe('2143');
  });

  it('ordena por tipo y luego por persona', () => {
    expect(ids([{ key: 'kind', dir: 1 }, { key: 'person', dir: -1 }])).toBe('2134');
  });
});

describe('dinero con familia', () => {
  it('lo que me queda es lo recibido menos lo dado', () => {
    const m = (direction: FamilyMove['direction'], amount: number): FamilyMove => ({
      id: `${direction}${amount}`,
      direction,
      conceptId: null,
      conceptText: '',
      personId: null,
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

const CONCEPT_OPTIONS: Concept[] = [
  { id: 'k1', scope: 'gasto', name: 'Netflix', active: true },
  { id: 'k2', scope: 'gasto', name: 'Disney', active: false },
];

describe('resolveConcept', () => {
  it('si lo escrito coincide con un concepto activo, se enlaza al catálogo (sin importar mayúsculas)', () => {
    expect(resolveConcept(CONCEPT_OPTIONS, '  netflix ')).toEqual({ id: 'k1', text: '' });
  });

  it('si no coincide con ninguno, queda como texto libre recortado', () => {
    expect(resolveConcept(CONCEPT_OPTIONS, '  Tamales de la esquina ')).toEqual({ id: null, text: 'Tamales de la esquina' });
  });

  it('un concepto desactivado no se enlaza (queda como texto)… salvo que el registro ya lo tuviera', () => {
    expect(resolveConcept(CONCEPT_OPTIONS, 'Disney')).toEqual({ id: null, text: 'Disney' });
    expect(resolveConcept(CONCEPT_OPTIONS, 'Disney', 'k2')).toEqual({ id: 'k2', text: '' });
  });

  it('vacío significa sin concepto', () => {
    expect(resolveConcept(CONCEPT_OPTIONS, '   ')).toEqual({ id: null, text: '' });
  });
});
