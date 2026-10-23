import { DEFAULT_ACTIVE_DAYS, DEFAULT_FREEZE_MIN, DEFAULT_GOAL, DEFAULT_HABITS } from './habits.config';
import { addDays, computeStreaks, dateKey, Days, doneAtLabel, isRestDay, RachaConfig } from './streaks';

const KEYS = DEFAULT_HABITS.map((h) => h.k);
const CFG: RachaConfig = {
  habitKeys: KEYS,
  goal: DEFAULT_GOAL,
  freezeMin: DEFAULT_FREEZE_MIN,
  activeDays: DEFAULT_ACTIVE_DAYS,
};
const DONE = Object.fromEntries(KEYS.slice(0, CFG.goal).map((k) => [k, true]));

describe('computeStreaks', () => {
  it('el fin de semana no rompe la racha', () => {
    // Jue 15, vie 16 y lun 19 de octubre de 2026
    const days: Days = { '2026-10-15': DONE, '2026-10-16': DONE, '2026-10-19': DONE };
    expect(computeStreaks(days, new Date(2026, 9, 19), CFG).cur).toBe(3);
  });

  it('un día entre semana sin meta rompe la racha', () => {
    const days: Days = { '2026-10-15': DONE, '2026-10-19': DONE };
    expect(computeStreaks(days, new Date(2026, 9, 19), CFG).cur).toBe(1);
  });

  it('si hoy aún no llega a la meta, cuenta desde ayer', () => {
    const days: Days = { '2026-10-15': DONE, '2026-10-16': DONE, '2026-10-19': { celular: true } };
    expect(computeStreaks(days, new Date(2026, 9, 19), CFG).cur).toBe(2);
  });

  it('la mejor racha recuerda una racha anterior', () => {
    const days: Days = { '2026-10-12': DONE, '2026-10-13': DONE, '2026-10-14': DONE };
    const { cur, best } = computeStreaks(days, new Date(2026, 9, 19), CFG);
    expect(cur).toBe(0);
    expect(best).toBe(3);
  });

  it('las marcas con hora cuentan igual que las antiguas con true', () => {
    const hora = new Date(2026, 9, 15, 8, 15).toISOString();
    const days: Days = { '2026-10-15': Object.fromEntries(KEYS.slice(0, CFG.goal).map((k) => [k, hora])) };
    expect(computeStreaks(days, new Date(2026, 9, 15), CFG).cur).toBe(1);
  });

  it('doneAtLabel muestra la hora, y la fecha si se marcó otro día', () => {
    const t = new Date(2026, 9, 15, 8, 5).toISOString();
    expect(doneAtLabel(t, '2026-10-15')).toBe('08:05');
    expect(doneAtLabel(t, '2026-10-14')).toBe('15 oct 08:05');
    expect(doneAtLabel(true, '2026-10-15')).toBe('');
    expect(doneAtLabel(undefined, '2026-10-15')).toBe('');
  });

  it('ignora marcas de claves que no están en la lista de misiones', () => {
    const days: Days = { '2026-10-15': { fantasma1: true, fantasma2: true, fantasma3: true, fantasma4: true, fantasma5: true, fantasma6: true } };
    expect(computeStreaks(days, new Date(2026, 9, 15), CFG).cur).toBe(0);
  });

  describe('días habilitados', () => {
    it('un día no habilitado no rompe la racha', () => {
      expect(isRestDay(new Date(2026, 9, 17), CFG.activeDays)).toBe(true); // sábado
      expect(isRestDay(new Date(2026, 9, 17), [1, 2, 3, 4, 5, 6])).toBe(false);
    });

    it('si el sábado es obligatorio, faltar a él rompe la racha', () => {
      const days: Days = { '2026-10-16': DONE, '2026-10-19': DONE }; // falta el sáb 17
      expect(computeStreaks(days, new Date(2026, 9, 19), CFG).cur).toBe(2);
      expect(computeStreaks(days, new Date(2026, 9, 19), { ...CFG, activeDays: [1, 2, 3, 4, 5, 6] }).cur).toBe(1);
    });
  });

  describe('meta configurable', () => {
    it('con otra meta cambia qué días cuentan', () => {
      const days: Days = { '2026-10-15': { celular: true, leetcode: true } };
      expect(computeStreaks(days, new Date(2026, 9, 15), { ...CFG, goal: 2 }).cur).toBe(1);
      expect(computeStreaks(days, new Date(2026, 9, 15), { ...CFG, goal: 3 }).cur).toBe(0);
    });
  });

  describe('congelación', () => {
    // freezeMin días entre semana cumplidos que terminan el mar 13 de octubre de 2026
    const base = (freezeMin: number): Days => {
      const days: Days = {};
      for (let d = new Date(2026, 9, 13), n = 0; n < freezeMin; d = addDays(d, -1)) {
        if (isRestDay(d, CFG.activeDays)) continue;
        days[dateKey(d)] = DONE;
        n++;
      }
      return days;
    };
    const SEVEN = base(DEFAULT_FREEZE_MIN);

    it('tras freezeMin días cumplidos, un día fallado se congela y al cumplir al siguiente la racha sigue', () => {
      const days: Days = { ...SEVEN, '2026-10-15': DONE }; // falló el mié 14
      const r = computeStreaks(days, new Date(2026, 9, 15), CFG);
      expect(r.cur).toBe(DEFAULT_FREEZE_MIN + 1);
      expect(r.frozen.has('2026-10-14')).toBe(true);
      expect(r.recovering).toBe(false);
    });

    it('mientras no se cumple el día siguiente, queda en recuperación', () => {
      const r = computeStreaks(SEVEN, new Date(2026, 9, 15), CFG);
      expect(r.cur).toBe(DEFAULT_FREEZE_MIN);
      expect(r.recovering).toBe(true);
    });

    it('dos días seguidos sin cumplir rompen la racha', () => {
      const r = computeStreaks(SEVEN, new Date(2026, 9, 16), CFG); // fallaron mié 14 y jue 15
      expect(r.cur).toBe(0);
      expect(r.recovering).toBe(false);
    });

    it('con menos de freezeMin días cumplidos no hay congelación', () => {
      const days: Days = { '2026-10-12': DONE, '2026-10-13': DONE, '2026-10-15': DONE };
      const r = computeStreaks(days, new Date(2026, 9, 15), CFG);
      expect(r.cur).toBe(1);
      expect(r.frozen.size).toBe(0);
    });

    it('avisa cuando hay una congelación lista', () => {
      expect(computeStreaks(SEVEN, new Date(2026, 9, 14), CFG).freezeReady).toBe(true);
    });

    it('freezeMin configurable: con 2 días basta', () => {
      const days: Days = { ...base(2), '2026-10-15': DONE };
      const r = computeStreaks(days, new Date(2026, 9, 15), { ...CFG, freezeMin: 2 });
      expect(r.cur).toBe(3);
      expect(r.frozen.has('2026-10-14')).toBe(true);
    });
  });
});
