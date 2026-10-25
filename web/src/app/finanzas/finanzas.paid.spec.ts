import { describe, expect, it } from 'vitest';
import { settledCargoIds } from './finanzas.calc';
import { Debt } from './finanzas.models';

const d = (p: Partial<Debt>): Debt => ({
  id: 'x', personId: 'p', kind: 'cargo', conceptId: null, conceptText: '', amount: 0, date: null, appliesTo: null, ...p,
});

describe('settledCargoIds', () => {
  const debts = [
    d({ id: 'c1', amount: 100 }),
    d({ id: 'c2', amount: 50 }),
    d({ id: 'a1', kind: 'abono', amount: 100, appliesTo: 'c1' }),
    d({ id: 'a2', kind: 'abono', amount: 20, appliesTo: 'c2' }),
  ];
  it('detecta los cargos saldados y no los que aún deben', () => {
    expect(settledCargoIds(debts, ['c1', 'c2'])).toEqual(['c1']);
  });
  it('ignora los que ya están en pagados', () => {
    expect(settledCargoIds(debts.map((x) => (x.id === 'c1' ? { ...x, archived: true } : x)), ['c1'])).toEqual([]);
  });
});
