import { Habits } from '../supabase.service';
import { FREEZE_MIN, GOAL, HABITS } from './habits.config';

/** "YYYY-MM-DD" -> misiones marcadas ese día */
export type Days = Record<string, Habits>;

export interface StreakInfo {
  cur: number;
  best: number;
  /** Días entre semana que no se cumplieron pero fueron congelados. */
  frozen: Set<string>;
  /** El último día se congeló y falta cumplir para recuperar la racha. */
  recovering: boolean;
  /** Hay una congelación ganada por si un día no se cumple. */
  freezeReady: boolean;
}

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

/**
 * Recorre los días en orden. Sábado y domingo no rompen la racha, y hoy aún no cuenta como fallado.
 * Un día entre semana sin cumplir se congela si hubo al menos FREEZE_MIN días cumplidos desde el
 * último quiebre o congelación; si no, la racha se rompe.
 */
export function computeStreaks(days: Days, today: Date): StreakInfo {
  const frozen = new Set<string>();
  let run = 0;
  let best = 0;
  let sinceFreeze = 0;
  let recovering = false;

  const keys = Object.keys(days)
    .filter((k) => countDone(days, k) > 0)
    .sort();
  if (keys.length) {
    const todayKey = dateKey(today);
    let d = parseKey(keys[0]);
    while (d <= today) {
      const k = dateKey(d);
      if (countDone(days, k) >= GOAL) {
        run++;
        sinceFreeze++;
        recovering = false;
        best = Math.max(best, run);
      } else if (!isWeekend(d) && k !== todayKey) {
        if (sinceFreeze >= FREEZE_MIN) {
          frozen.add(k);
          sinceFreeze = 0;
          recovering = true;
        } else {
          run = 0;
          sinceFreeze = 0;
          recovering = false;
        }
      }
      d = addDays(d, 1);
    }
  }
  return { cur: run, best, frozen, recovering, freezeReady: !recovering && sinceFreeze >= FREEZE_MIN };
}
