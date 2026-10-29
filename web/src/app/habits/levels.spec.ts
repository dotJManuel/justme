import { describe, expect, it } from 'vitest';
import { DEFAULT_ACTIVE_DAYS, DEFAULT_GOAL, XP_PER } from './habits.config';
import { LEVEL_CAP_DEFAULT, MIN_DAYS_LEFT, levelInfo, levelRatioFor, levelThresholds, planDays, planDaysLeft, replanLevels, yearXpFor } from './levels';

const YEAR_XP = yearXpFor(DEFAULT_GOAL, DEFAULT_ACTIVE_DAYS);
const T = levelThresholds(YEAR_XP, LEVEL_CAP_DEFAULT);

describe('plan del año', () => {
  it('un año de lunes a viernes tiene 261 días obligatorios', () => {
    expect(planDays([1, 2, 3, 4, 5])).toBe(261);
    expect(planDays([0, 1, 2, 3, 4, 5, 6])).toBe(365);
  });

  it('la experiencia del año sale de misiones por día, XP por misión y días del año', () => {
    expect(YEAR_XP).toBe(DEFAULT_GOAL * XP_PER * 261);
  });

  it('los días que le quedan al plan bajan con el tiempo y tienen un mínimo', () => {
    const wk = [1, 2, 3, 4, 5];
    expect(planDaysLeft('2026-01-01', new Date(2026, 0, 1), wk)).toBe(261);
    expect(planDaysLeft('2026-01-01', new Date(2026, 6, 1), wk)).toBe(Math.round(((365 - 181) * 5) / 7));
    // pasado el año se siguen dando unos días en lugar de cero
    expect(planDaysLeft('2026-01-01', new Date(2027, 5, 1), wk)).toBe(Math.round((MIN_DAYS_LEFT * 5) / 7));
  });

  it('qué parte de las misiones activas se espera cumplir: la meta entre las activas, de 5 % a 100 %', () => {
    expect(levelRatioFor(6, 10)).toBeCloseTo(0.6);
    expect(levelRatioFor(6, 3)).toBe(1);
    expect(levelRatioFor(1, 100)).toBe(0.05);
    expect(levelRatioFor(6, 0)).toBe(1);
  });
});

describe('levelThresholds', () => {
  it('tiene un elemento por nivel y empieza en 0', () => {
    expect(T).toHaveLength(LEVEL_CAP_DEFAULT);
    expect(T[0]).toBe(0);
  });

  it('el nivel máximo cae en la experiencia del año', () => {
    expect(Math.abs(T[T.length - 1] - YEAR_XP)).toBeLessThanOrEqual(XP_PER * 5);
  });

  it('cada nivel pide más que el anterior, y el costo crece', () => {
    const costs = T.slice(1).map((v, i) => v - T[i]);
    expect(costs.every((c) => c >= XP_PER)).toBe(true);
    expect(costs[costs.length - 1]).toBeGreaterThan(costs[0] * 5);
    // crece sin bajar (salvo el redondeo a múltiplos de 10)
    costs.forEach((c, i) => i && expect(c).toBeGreaterThanOrEqual(costs[i - 1] - XP_PER));
  });

  it('el primer nivel cuesta alrededor de un día de plan', () => {
    expect(T[1]).toBeGreaterThanOrEqual(YEAR_XP / 261);
    expect(T[1]).toBeLessThanOrEqual((YEAR_XP / 261) * 2);
  });

  it('quien cumple su plan todos los días llega al máximo en un año', () => {
    const perDay = DEFAULT_GOAL * XP_PER;
    const daysNeeded = Math.ceil(T[T.length - 1] / perDay);
    expect(daysNeeded).toBeLessThanOrEqual(261 + 1);
  });

  it('respeta los límites del nivel máximo y las metas mínimas', () => {
    expect(levelThresholds(10000, 1)).toHaveLength(5);
    expect(levelThresholds(10000, 500)).toHaveLength(100);
    const tiny = levelThresholds(100, 50);
    expect(tiny.every((v, i) => i === 0 || v - tiny[i - 1] >= XP_PER)).toBe(true);
  });
});

describe('levelInfo', () => {
  it('sin experiencia es el nivel 1 y falta el primer umbral', () => {
    expect(levelInfo(T, 0)).toMatchObject({ level: 1, base: 0, next: T[1], into: 0, left: T[1], maxed: false });
  });

  it('justo en un umbral ya es ese nivel', () => {
    expect(levelInfo(T, T[1]).level).toBe(2);
    expect(levelInfo(T, T[1] - 1).level).toBe(1);
    expect(levelInfo(T, T[9])).toMatchObject({ level: 10, base: T[9], into: 0 });
  });

  it('dentro de un nivel mide lo que lleva y lo que falta', () => {
    const xp = T[4] + 25;
    expect(levelInfo(T, xp)).toMatchObject({ level: 5, into: 25, size: T[5] - T[4], left: T[5] - xp });
  });

  it('en el máximo no hay siguiente y más experiencia no sube el nivel', () => {
    const last = T[T.length - 1];
    expect(levelInfo(T, last)).toMatchObject({ level: LEVEL_CAP_DEFAULT, next: null, left: 0, maxed: true });
    expect(levelInfo(T, last * 10).level).toBe(LEVEL_CAP_DEFAULT);
  });
});

describe('replanLevels', () => {
  const budget = (missionsPerDay: number, days: number) => missionsPerDay * XP_PER * days;

  it('al empezar, con el mismo plan, deja la misma tabla', () => {
    const same = replanLevels(T, 0, YEAR_XP);
    expect(same).toHaveLength(T.length);
    same.forEach((v, i) => expect(Math.abs(v - T[i])).toBeLessThanOrEqual(XP_PER));
  });

  it('los niveles alcanzados y el actual conservan su umbral', () => {
    const xp = T[19] + 40; // nivel 20
    const next = replanLevels(T, xp, budget(10, 150));
    expect(next.slice(0, 20)).toEqual(T.slice(0, 20));
  });

  it('con más misiones al día, los niveles que faltan piden más; con menos, piden menos', () => {
    const xp = T[19] + 40;
    const days = 150;
    const more = replanLevels(T, xp, budget(9, days));
    const fewer = replanLevels(T, xp, budget(3, days));
    expect(more[49]).toBeGreaterThan(T[49]);
    expect(fewer[49]).toBeLessThan(T[49]);
    // y en los dos casos sigue creciendo, nivel por nivel
    for (const t of [more, fewer]) t.forEach((v, i) => i && expect(v).toBeGreaterThan(t[i - 1]));
  });

  it('el último nivel cae en la experiencia actual más lo que falta por ganar', () => {
    const xp = T[19] + 40;
    const b = budget(6, 150);
    const next = replanLevels(T, xp, b);
    expect(Math.abs(next[49] - (xp + b))).toBeLessThanOrEqual(XP_PER * 30);
  });

  it('recalcular nunca sube de nivel por sí solo', () => {
    const xp = T[19] + 40;
    // un presupuesto mínimo no puede dejar el siguiente nivel por debajo de lo que ya llevas
    const next = replanLevels(T, xp, 0);
    expect(levelInfo(next, xp).level).toBe(20);
    expect(next[20]).toBeGreaterThan(xp);
  });

  it('en el nivel máximo no cambia nada', () => {
    expect(replanLevels(T, T[49] + 500, budget(6, 100))).toEqual(T);
  });
});
