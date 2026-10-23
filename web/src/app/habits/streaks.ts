import { Habits } from '../supabase.service';
import { GOAL, HABITS } from './habits.config';

/** "YYYY-MM-DD" -> misiones marcadas ese día */
export type Days = Record<string, Habits>;

export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function parseKey(k: string): Date {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function isWeekend(d: Date): boolean {
  const w = d.getDay();
  return w === 0 || w === 6;
}

export function countDone(days: Days, k: string): number {
  const h = days[k] ?? {};
  return HABITS.filter((x) => h[x.k]).length;
}

/** Racha actual y mejor racha. Sábado y domingo no la rompen. */
export function computeStreaks(days: Days, today: Date): { cur: number; best: number } {
  let cur = 0;
  let d = new Date(today);
  // Si hoy aún no llega a la meta, la racha se cuenta desde ayer.
  if (countDone(days, dateKey(d)) < GOAL) d = addDays(d, -1);
  for (let i = 0; i < 2000; i++) {
    if (countDone(days, dateKey(d)) >= GOAL) cur++;
    else if (!isWeekend(d)) break;
    d = addDays(d, -1);
  }

  let best = cur;
  const keys = Object.keys(days)
    .filter((k) => countDone(days, k) > 0)
    .sort();
  if (keys.length) {
    let run = 0;
    d = parseKey(keys[0]);
    while (d <= today) {
      if (countDone(days, dateKey(d)) >= GOAL) {
        run++;
        best = Math.max(best, run);
      } else if (!isWeekend(d) && dateKey(d) !== dateKey(today)) {
        run = 0;
      }
      d = addDays(d, 1);
    }
  }
  return { cur, best };
}
