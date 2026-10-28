import { describe, expect, it } from 'vitest';
import { StreakInfo } from '../habits/streaks';
import { badgeStates, levelName } from './logros.config';

const streaks = (best: number): StreakInfo => ({ cur: best, best, frozen: new Set(), recovering: false, freezeReady: false });
const ctx = (best: number, days = {}, totalDone = 0) => ({ days, streaks: streaks(best), totalDone });
const by = (states: ReturnType<typeof badgeStates>, id: string) => states.find((s) => s.def.id === id)!;

describe('badgeStates', () => {
  it('sin nada hecho, ninguna insignia está ganada', () => {
    expect(badgeStates(ctx(0)).every((s) => !s.earned)).toBe(true);
  });

  it('gana por racha y muestra el progreso de las demás', () => {
    const s = badgeStates(ctx(2, {}, 21));
    expect(by(s, 'primer-paso')).toMatchObject({ earned: true, sub: 'Ganada' });
    expect(by(s, 'doble-racha').earned).toBe(true);
    expect(by(s, 'semana-de-fuego')).toMatchObject({ earned: false, sub: '2 / 7 días' });
    expect(by(s, 'mes-imparable').sub).toBe('2 / 30 días');
  });

  it('cuenta los días en que se marcó una misión concreta', () => {
    const days = { '2026-10-01': { celular: true }, '2026-10-02': { celular: '2026-10-02T07:00:00Z' }, '2026-10-03': { ingles: true } };
    const s = badgeStates(ctx(0, days, 3));
    expect(by(s, 'madrugador').value).toBe(2);
    expect(by(s, 'poliglota').value).toBe(1);
  });
});

describe('levelName', () => {
  it('sin nombre configurado usa "Nivel N"', () => {
    expect(levelName(3)).toBe('Nivel 3');
  });
});
