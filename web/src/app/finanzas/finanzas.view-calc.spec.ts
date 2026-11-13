import { describe, expect, it } from 'vitest';
import { Expense } from './finanzas.models';
import { cutProgress, cutText, daysUntil, endedPurchases, initials, parseInstallment, percent } from './finanzas.view-calc';

describe('parseInstallment', () => {
  it('lee "pago K de N"', () => {
    expect(parseInstallment('05/09')).toEqual({ k: 5, n: 9 });
    expect(parseInstallment(' 1 / 12 ')).toEqual({ k: 1, n: 12 });
  });

  it('rechaza lo que no es una mensualidad', () => {
    expect(parseInstallment('')).toBeNull();
    expect(parseInstallment('a meses')).toBeNull();
    expect(parseInstallment('10/9')).toBeNull();
    expect(parseInstallment('1/0')).toBeNull();
  });
});

describe('initials', () => {
  it('toma dos letras', () => {
    expect(initials('Ismael')).toBe('IS');
    expect(initials('Ana María López')).toBe('AM');
    expect(initials('mm')).toBe('MM');
    expect(initials('  ')).toBe('?');
  });
});

describe('cortes', () => {
  const today = new Date(2026, 9, 27);

  it('cuenta los días que faltan', () => {
    expect(daysUntil('2026-11-12', today)).toBe(16);
    expect(daysUntil('2026-10-27', today)).toBe(0);
  });

  it('dice el corte en palabras', () => {
    expect(cutText(0)).toBe('Corte hoy');
    expect(cutText(1)).toBe('Corte mañana');
    expect(cutText(16)).toBe('Corte en 16 días');
  });

  it('calcula qué tanto del periodo ya pasó', () => {
    expect(cutProgress({ start: '2026-10-13', end: '2026-11-12', label: '' }, today)).toBe(47);
    expect(cutProgress({ start: '2026-10-28', end: '2026-11-12', label: '' }, today)).toBe(0);
  });
});

describe('percent', () => {
  it('redondea y no divide entre cero', () => {
    expect(percent(7047.18, 13688.18)).toBe(51);
    expect(percent(5, 0)).toBe(0);
  });
});

describe('endedPurchases', () => {
  const e = (p: Partial<Expense>): Expense => ({
    id: 'x', section: 'tarjeta', cardId: 'c', conceptId: null, conceptText: 'Algo', installment: '', total: 10, amount: 10,
    purchasedAt: '2026-10-20T12:00:00', ...p,
  });
  const rows = [
    e({ id: 'vieja' }),
    e({ id: 'fijada', pinned: true }),
    e({ id: 'meses', installment: '02/06' }),
    e({ id: 'actual', purchasedAt: '2026-11-15T12:00:00' }),
    e({ id: 'sinfecha', purchasedAt: null }),
    e({ id: 'fijo', section: 'fijos', cardId: null, purchasedAt: null }),
  ];

  it('solo limpia compras de contado de cortes anteriores', () => {
    expect(endedPurchases(rows, '2026-11-13').map((x) => x.id)).toEqual(['vieja', 'sinfecha']);
  });

  it('no toca las fijadas, las de meses ni los gastos fijos', () => {
    const ids = endedPurchases(rows, '2030-01-01').map((x) => x.id);
    expect(ids).not.toContain('fijada');
    expect(ids).not.toContain('meses');
    expect(ids).not.toContain('fijo');
  });
});
