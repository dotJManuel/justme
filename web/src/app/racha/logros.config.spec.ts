import { describe, expect, it } from 'vitest';
import { StreakInfo } from '../habits/streaks';
import { BadgeDef, DEFAULT_BADGES, badgeRule, badgeStates, levelName } from './logros.config';

const streaks = (best: number): StreakInfo => ({ cur: best, best, frozen: new Set(), recovering: false, freezeReady: false });
const ctx = (best: number, days = {}, totalDone = 0, xp = totalDone * 10) => ({ days, streaks: streaks(best), totalDone, xp });
const DEFS: BadgeDef[] = DEFAULT_BADGES.map((d, i) => ({ ...d, id: `b${i}`, active: true }));
const by = (states: ReturnType<typeof badgeStates>, name: string) => states.find((s) => s.def.name === name)!;

describe('badgeStates', () => {
  it('sin nada hecho, ninguna insignia está ganada', () => {
    expect(badgeStates(ctx(0), DEFS).every((s) => !s.earned)).toBe(true);
  });

  it('gana por racha y muestra el progreso de las demás', () => {
    const s = badgeStates(ctx(2, {}, 21), DEFS);
    expect(by(s, 'Primer paso')).toMatchObject({ earned: true, sub: 'Ganada' });
    expect(by(s, 'Doble racha').earned).toBe(true);
    expect(by(s, 'Semana de fuego')).toMatchObject({ earned: false, sub: '2 / 7 días' });
    expect(by(s, 'Mes imparable').sub).toBe('2 / 30 días');
  });

  it('cuenta los días en que se marcó una misión concreta', () => {
    const days = { '2026-10-01': { celular: true }, '2026-10-02': { celular: '2026-10-02T07:00:00Z' }, '2026-10-03': { ingles: true } };
    const s = badgeStates(ctx(0, days, 3), DEFS);
    expect(by(s, 'Madrugador').value).toBe(2);
    expect(by(s, 'Políglota').value).toBe(1);
  });

  it('mide misiones totales y XP', () => {
    const defs: BadgeDef[] = [
      { id: 'a', name: 'Cien', icon: 'bolt', kind: 'misiones', target: 100, habitKey: null, active: true },
      { id: 'b', name: 'Mil XP', icon: 'bolt', kind: 'xp', target: 1000, habitKey: null, active: true },
    ];
    const s = badgeStates(ctx(0, {}, 40, 400), defs);
    expect(s[0]).toMatchObject({ value: 40, earned: false, sub: '40 / 100 misiones' });
    expect(s[1]).toMatchObject({ value: 400, earned: false, sub: '400 / 1000 XP' });
  });

  it('una insignia de misión sin misión elegida no avanza', () => {
    const def: BadgeDef = { id: 'x', name: 'X', icon: 'check', kind: 'mision', target: 1, habitKey: null, active: true };
    expect(badgeStates(ctx(5, { '2026-10-01': { celular: true } }, 1), [def])[0].value).toBe(0);
  });
});

describe('badgeRule', () => {
  it('dice lo que pide cada tipo, en singular y plural', () => {
    expect(badgeRule({ ...DEFS[2] })).toBe('Llega a 7 días de racha');
    expect(badgeRule({ ...DEFS[0] })).toBe('Completa 1 misión');
    expect(badgeRule({ ...DEFS[3] }, () => 'Celular lejos al despertar')).toBe('Celular lejos al despertar: 7 días');
  });
});

describe('levelName', () => {
  it('sin nombre configurado usa "Nivel N"', () => {
    expect(levelName(3)).toBe('Nivel 3');
  });
});
