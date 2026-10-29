import { XP_PER } from './habits.config';
import { parseKey } from './streaks';

// Niveles: cada uno pide más experiencia que el anterior, hasta un nivel máximo, y la escala está pensada para que
// quien cumple su plan todos los días llegue al máximo en un año. La tabla de niveles se guarda (supabase/22_plan_de_niveles.sql)
// y se ajusta sola: los niveles ya alcanzados no cambian y los que faltan se recalculan cuando cambian las misiones o la
// meta diaria. La experiencia sale siempre de las misiones marcadas, así que recalcular nunca pierde experiencia.

/** Nivel máximo por defecto: un nivel por semana, más o menos, a lo largo del año. */
export const LEVEL_CAP_DEFAULT = 50;
export const LEVEL_CAP_MIN = 5;
export const LEVEL_CAP_MAX = 100;

/** Qué tanto dura el plan. */
export const PLAN_DAYS = 365;
/** Aunque se acabe el año, a lo que falta se le dan al menos estos días: pasarse unos días no es problema. */
export const MIN_DAYS_LEFT = 30;

/**
 * Cuánto cuesta cada nivel frente al promedio. El costo crece en línea recta desde `FIRST_STEP × promedio` hasta
 * `(2 − FIRST_STEP) × promedio`: con 0.25 el último cuesta 7 veces el primero.
 */
const FIRST_STEP = 0.25;

/** Días obligatorios que tiene un año con esos días de la semana (de lunes a viernes salen 261). */
export const planDays = (activeDays: number[]): number => Math.max(1, Math.round((PLAN_DAYS * activeDays.length) / 7));

/** Experiencia que se junta en un año yendo a tantas misiones por día. */
export const yearXpFor = (missionsPerDay: number, activeDays: number[]): number => missionsPerDay * XP_PER * planDays(activeDays);

/** Días obligatorios que le quedan al plan (con un mínimo, ver MIN_DAYS_LEFT). `start` es una fecha aaaa-mm-dd. */
export function planDaysLeft(start: string, today: Date, activeDays: number[]): number {
  const elapsed = Math.round((today.getTime() - parseKey(start).getTime()) / 86_400_000);
  const left = Math.max(MIN_DAYS_LEFT, PLAN_DAYS - elapsed);
  return Math.max(1, Math.round((left * activeDays.length) / 7));
}

const roundTo = (n: number, step: number) => Math.round(n / step) * step;
const clampCap = (cap: number) => Math.min(LEVEL_CAP_MAX, Math.max(LEVEL_CAP_MIN, Math.round(cap)));

/** Costo relativo del paso k (0 = de nivel 1 a 2) entre `steps` pasos; el promedio de todos es 1. */
const weight = (k: number, steps: number) => FIRST_STEP + ((2 - 2 * FIRST_STEP) * k) / (steps - 1);

/**
 * Experiencia total que hay que juntar para llegar a cada nivel: el elemento i es la del nivel i + 1 (el nivel 1 es 0).
 * El último es la experiencia del año, y cada nivel pide más que el anterior (nunca menos que una misión).
 */
export function levelThresholds(yearXp: number, cap: number): number[] {
  const steps = clampCap(cap) - 1;
  const out = [0];
  let exact = 0;
  for (let k = 0; k < steps; k++) {
    exact += (yearXp / steps) * weight(k, steps);
    out.push(Math.max(out[k] + XP_PER, roundTo(exact, XP_PER)));
  }
  return out;
}

export interface LevelInfo {
  level: number;
  /** Experiencia con la que empezó este nivel. */
  base: number;
  /** Experiencia que pide el siguiente nivel, null en el máximo. */
  next: number | null;
  /** Lo que lleva dentro del nivel y lo que mide el nivel (para la barra). */
  into: number;
  size: number;
  /** Lo que falta para el siguiente nivel. */
  left: number;
  maxed: boolean;
}

export function levelInfo(thresholds: number[], xp: number): LevelInfo {
  let level = 1;
  while (level < thresholds.length && xp >= thresholds[level]) level++;
  const base = thresholds[level - 1];
  const next = level < thresholds.length ? thresholds[level] : null;
  return {
    level,
    base,
    next,
    into: next === null ? 1 : xp - base,
    size: next === null ? 1 : next - base,
    left: next === null ? 0 : next - xp,
    maxed: next === null,
  };
}

/**
 * Vuelve a repartir los niveles que faltan. Los ya alcanzados (y el actual, que ya empezó) conservan su umbral; el resto
 * se recalcula con la misma curva para que el último caiga en `xp + budget`, o sea, justo cuando termines de juntar lo
 * que esperas ganar de aquí al final del plan. Nunca sube de nivel por sí solo: el siguiente umbral queda por encima de `xp`.
 */
export function replanLevels(thresholds: number[], xp: number, budget: number): number[] {
  const { level, base, maxed } = levelInfo(thresholds, xp);
  if (maxed) return thresholds;
  const steps = thresholds.length - 1;
  const remaining = steps - (level - 1); // pasos que faltan, contando el del nivel actual
  const span = Math.max(xp + budget - base, remaining * XP_PER);

  let sum = 0;
  for (let k = level - 1; k < steps; k++) sum += weight(k, steps);

  const out = thresholds.slice(0, level);
  let exact = base;
  for (let k = level - 1; k < steps; k++) {
    exact += (span / sum) * weight(k, steps);
    out.push(Math.max(out[out.length - 1] + XP_PER, roundTo(exact, XP_PER)));
  }
  // El nivel actual nunca se completa por recalcular: su meta queda por encima de la experiencia que ya llevas
  if (out[level] <= xp) {
    out[level] = Math.floor(xp / XP_PER) * XP_PER + XP_PER;
    for (let i = level + 1; i < out.length; i++) out[i] = Math.max(out[i], out[i - 1] + XP_PER);
  }
  return out;
}

/** Qué parte de las misiones activas se espera cumplir cada día: la meta diaria entre las activas, de 5 % a 100 %. */
export const levelRatioFor = (goal: number, activeCount: number): number => Math.min(1, Math.max(0.05, goal / Math.max(1, activeCount)));
