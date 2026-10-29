import { describe, expect, it } from 'vitest';
import { StreakInfo } from '../habits/streaks';
import { BadgeDef, DEFAULT_BADGES, TIER_PRESETS, badgeRule, badgeStates, levelName, targetsError } from './logros.config';

const streaks = (best: number): StreakInfo => ({ cur: best, best, frozen: new Set(), recovering: false, freezeReady: false });
const ctx = (best: number, days = {}, totalDone = 0, xp = totalDone * 10) => ({ days, streaks: streaks(best), totalDone, xp });
const DEFS: BadgeDef[] = DEFAULT_BADGES.map((d, i) => ({ ...d, id: `b${i}`, active: true }));
const by = (states: ReturnType<typeof badgeStates>, name: string) => states.find((s) => s.def.name === name)!;
const def = (over: Partial<BadgeDef>): BadgeDef => ({ id: 'x', name: 'X', icon: 'bolt', kind: 'misiones', targets: [10, 20, 30, 40], habitKey: null, active: true, ...over });

describe('badgeStates', () => {
  it('sin nada hecho, ninguna insignia tiene nivel', () => {
    const s = badgeStates(ctx(0), DEFS);
    expect(s.every((b) => b.tier === 0 && !b.earned && b.tierName === '')).toBe(true);
  });

  it('el nivel es el más alto cuya meta se alcanzó', () => {
    const d = def({});
    const at = (n: number) => badgeStates(ctx(0, {}, n), [d])[0];
    expect(at(9)).toMatchObject({ tier: 0, tierName: '', earned: false, next: 10 });
    expect(at(10)).toMatchObject({ tier: 1, tierName: 'Bronce', earned: true, next: 20 });
    expect(at(25)).toMatchObject({ tier: 2, tierName: 'Plata', next: 30 });
    expect(at(30)).toMatchObject({ tier: 3, tierName: 'Oro', next: 40 });
    expect(at(40)).toMatchObject({ tier: 4, tierName: 'Platino', maxed: true, next: null, pct: 100 });
    expect(at(500).tier).toBe(4);
  });

  it('muestra el avance hacia el siguiente nivel', () => {
    const s = badgeStates(ctx(2, {}, 21), DEFS);
    expect(by(s, 'Primer paso')).toMatchObject({ tier: 1, sub: '21 / 25 misiones', pct: 84 });
    expect(by(s, 'Doble racha')).toMatchObject({ tier: 1, sub: '2 / 7 días' });
    expect(by(s, 'Semana de fuego')).toMatchObject({ tier: 0, earned: false, sub: '2 / 7 días' });
    expect(by(s, 'Mes imparable').sub).toBe('2 / 30 días');
  });

  it('en Platino dice que es el nivel máximo', () => {
    expect(badgeStates(ctx(0, {}, 600), [def({ targets: [1, 2, 3, 4] })])[0].sub).toBe('Nivel máximo · 600 misiones');
  });

  it('cuenta los días en que se marcó una misión concreta', () => {
    const days = { '2026-10-01': { celular: true }, '2026-10-02': { celular: '2026-10-02T07:00:00Z' }, '2026-10-03': { ingles: true } };
    const s = badgeStates(ctx(0, days, 3), DEFS);
    expect(by(s, 'Madrugador').value).toBe(2);
    expect(by(s, 'Políglota').value).toBe(1);
  });

  it('mide misiones totales y XP', () => {
    const defs = [def({ kind: 'misiones', targets: [100, 200, 300, 400] }), def({ kind: 'xp', targets: [1000, 2000, 3000, 4000] })];
    const s = badgeStates(ctx(0, {}, 40, 400), defs);
    expect(s[0]).toMatchObject({ value: 40, tier: 0, sub: '40 / 100 misiones' });
    expect(s[1]).toMatchObject({ value: 400, tier: 0, sub: '400 / 1000 XP' });
  });

  it('una insignia de misión sin misión elegida no avanza', () => {
    const d = def({ kind: 'mision', targets: [1, 2, 3, 4] });
    expect(badgeStates(ctx(5, { '2026-10-01': { celular: true } }, 1), [d])[0].value).toBe(0);
  });
});

describe('badgeRule', () => {
  it('dice las metas de los cuatro niveles, en singular y plural', () => {
    expect(badgeRule(DEFS[2])).toBe('Racha: 7 · 14 · 30 · 60 días');
    expect(badgeRule(DEFS[0])).toBe('Misiones: 1 · 25 · 100 · 500');
    expect(badgeRule(DEFS[3], () => 'Celular lejos al despertar')).toBe('Celular lejos al despertar: 7 · 30 · 100 · 365 días');
  });
});

describe('targetsError', () => {
  it('acepta cuatro enteros de 1 a 100000, cada uno mayor que el anterior', () => {
    expect(targetsError([1, 2, 3, 4])).toBe('');
    expect(targetsError([7, 30, 100, 100000])).toBe('');
  });

  it('rechaza vacíos, decimales, fuera de rango y repetidos o desordenados', () => {
    expect(targetsError([1, 2, 3, null])).toMatch(/entero/);
    expect(targetsError([0, 2, 3, 4])).toMatch(/entero/);
    expect(targetsError([1, 2.5, 3, 4])).toMatch(/entero/);
    expect(targetsError([1, 2, 3, 100001])).toMatch(/entero/);
    expect(targetsError([1, 2, 2, 4])).toMatch(/más que el anterior/);
    expect(targetsError([5, 3, 9, 12])).toMatch(/más que el anterior/);
    expect(targetsError([1, 2, 3])).toBe('Faltan metas');
  });

  it('las metas sugeridas de cada tipo y las de siempre son válidas', () => {
    for (const t of Object.values(TIER_PRESETS)) expect(targetsError(t)).toBe('');
    for (const b of DEFAULT_BADGES) expect(targetsError(b.targets)).toBe('');
  });
});

describe('levelName', () => {
  it('sin nombre configurado usa "Nivel N"', () => {
    expect(levelName(3)).toBe('Nivel 3');
  });
});
