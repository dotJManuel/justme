import { GOAL, HABITS } from './habits.config';
import { computeStreaks, Days } from './streaks';

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

  it('la mejor racha recuerda una racha anterior', () => {
    const days: Days = { '2026-10-12': DONE, '2026-10-13': DONE, '2026-10-14': DONE };
    const { cur, best } = computeStreaks(days, new Date(2026, 9, 19));
    expect(cur).toBe(0);
    expect(best).toBe(3);
  });
});
