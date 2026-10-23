import { FREEZE_MIN, GOAL, HABITS } from './habits.config';
import { addDays, computeStreaks, dateKey, Days, isWeekend } from './streaks';

const DONE = Object.fromEntries(HABITS.slice(0, GOAL).map((h) => [h.k, true]));

describe('computeStreaks', () => {
  it('el fin de semana no rompe la racha', () => {
    // Jue 15, vie 16 y lun 19 de octubre de 2026
    const days: Days = { '2026-10-15': DONE, '2026-10-16': DONE, '2026-10-19': DONE };
    expect(computeStreaks(days, new Date(2026, 9, 19)).cur).toBe(3);
  });

  it('un día entre semana sin meta rompe la racha', () => {
    const days: Days = { '2026-10-15': DONE, '2026-10-19': DONE };
    expect(computeStreaks(days, new Date(2026, 9, 19)).cur).toBe(1);
  });

  it('si hoy aún no llega a la meta, cuenta desde ayer', () => {
    const days: Days = { '2026-10-15': DONE, '2026-10-16': DONE, '2026-10-19': { celular: true } };
    expect(computeStreaks(days, new Date(2026, 9, 19)).cur).toBe(2);
  });

  describe('congelación', () => {
    // FREEZE_MIN días entre semana cumplidos que terminan el mar 13 de octubre de 2026
    const SEVEN: Days = {};
    for (let d = new Date(2026, 9, 13), n = 0; n < FREEZE_MIN; d = addDays(d, -1)) {
      if (isWeekend(d)) continue;
      SEVEN[dateKey(d)] = DONE;
      n++;
    }

    it('tras FREEZE_MIN días cumplidos, un día fallado se congela y al cumplir al siguiente la racha sigue', () => {
      const days: Days = { ...SEVEN, '2026-10-15': DONE }; // falló el mié 14
      const r = computeStreaks(days, new Date(2026, 9, 15));
      expect(r.cur).toBe(FREEZE_MIN + 1);
      expect(r.frozen.has('2026-10-14')).toBe(true);
      expect(r.recovering).toBe(false);
    });

    it('mientras no se cumple el día siguiente, queda en recuperación', () => {
      const r = computeStreaks(SEVEN, new Date(2026, 9, 15));
      expect(r.cur).toBe(FREEZE_MIN);
      expect(r.recovering).toBe(true);
    });

    it('dos días seguidos sin cumplir rompen la racha', () => {
      const r = computeStreaks(SEVEN, new Date(2026, 9, 16)); // fallaron mié 14 y jue 15
      expect(r.cur).toBe(0);
      expect(r.recovering).toBe(false);
    });

    it('con menos de FREEZE_MIN días cumplidos no hay congelación', () => {
      const days: Days = { '2026-10-12': DONE, '2026-10-13': DONE, '2026-10-15': DONE };
      const r = computeStreaks(days, new Date(2026, 9, 15));
      expect(r.cur).toBe(1);
      expect(r.frozen.size).toBe(0);
    });

    it('avisa cuando hay una congelación lista', () => {
      expect(computeStreaks(SEVEN, new Date(2026, 9, 14)).freezeReady).toBe(true);
    });
  });

  it('la mejor racha recuerda una racha anterior', () => {
    const days: Days = { '2026-10-12': DONE, '2026-10-13': DONE, '2026-10-14': DONE };
    const { cur, best } = computeStreaks(days, new Date(2026, 9, 19));
    expect(cur).toBe(0);
    expect(best).toBe(3);
  });
});
