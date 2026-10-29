import { IconName } from '../icons/icon';
import { Days, StreakInfo } from '../habits/streaks';

// Insignias y nombres de nivel. Las insignias son de cada persona (tabla `badges`, ver supabase/18_insignias.sql y
// 21_insignias_por_niveles.sql) y se administran en Perfil › Insignias; aquí vive cómo se calcula su avance.
// Cada insignia tiene cuatro niveles, como las medallas de Pokémon GO (Bronce, Plata, Oro y Platino), cada uno con su
// meta. Nada se guarda sobre qué nivel se alcanzó: se calcula siempre con los días guardados.
// Los nombres de nivel de la persona (XP) siguen siendo una constante del cliente.

/** Nombre de cada nivel, por posición (el nivel 1 es el índice 0). Vacío = se muestra solo "Nivel N". */
export const LEVEL_NAMES: string[] = [];

/** Qué se mide para ganar una insignia. */
export type BadgeKind = 'racha' | 'misiones' | 'xp' | 'mision';

export const BADGE_KINDS: { value: BadgeKind; label: string; hint: string }[] = [
  { value: 'racha', label: 'Racha', hint: 'Días de racha seguidos (la mejor marca)' },
  { value: 'misiones', label: 'Misiones', hint: 'Misiones completadas en total' },
  { value: 'xp', label: 'XP', hint: 'Puntos de experiencia juntados' },
  { value: 'mision', label: 'Una misión', hint: 'Días en que cumples una misión concreta' },
];

/** Los niveles de una insignia, del primero al último. */
export const TIERS = ['Bronce', 'Plata', 'Oro', 'Platino'] as const;
export type TierName = (typeof TIERS)[number];

/** La meta más alta que se puede poner (la base de datos lo exige igual). */
export const MAX_TARGET = 100000;

/** Metas sugeridas por tipo, de Bronce a Platino. */
export const TIER_PRESETS: Record<BadgeKind, number[]> = {
  racha: [7, 30, 100, 365],
  misiones: [10, 100, 500, 2000],
  xp: [100, 1000, 5000, 20000],
  mision: [7, 30, 100, 365],
};

/**
 * Por qué cuatro metas no sirven ('' si sirven): enteras, de 1 a MAX_TARGET y cada una mayor que la anterior.
 * Los valores vacíos o con texto cuentan como inválidos.
 */
export function targetsError(values: (number | null)[]): string {
  if (values.length !== TIERS.length) return 'Faltan metas';
  if (!values.every((n) => n !== null && Number.isInteger(n) && n >= 1 && n <= MAX_TARGET)) {
    return `Cada meta es un número entero del 1 al ${MAX_TARGET}`;
  }
  const n = values as number[];
  return n.every((v, i) => i === 0 || v > n[i - 1]) ? '' : 'Cada nivel debe pedir más que el anterior';
}

/** Íconos que se pueden elegir (los mismos que acepta la base de datos). */
export const BADGE_ICONS: IconName[] = ['trophy', 'check', 'flame', 'calendar', 'sun-dim', 'languages', 'bolt', 'heart', 'snowflake', 'users', 'wallet', 'history'];

export interface BadgeContext {
  days: Days;
  streaks: StreakInfo;
  /** Misiones marcadas en toda la historia. */
  totalDone: number;
  /** Puntos de experiencia juntados. */
  xp: number;
}

export interface BadgeDef {
  id: string;
  name: string;
  icon: IconName;
  kind: BadgeKind;
  /** Cuánto hay que juntar para cada nivel: Bronce, Plata, Oro y Platino (de menor a mayor). */
  targets: number[];
  /** Solo para `mision`: la clave de la misión. */
  habitKey: string | null;
  active: boolean;
}

/** Las siete de siempre: lo que recibe cada persona al empezar (igual que en la base de datos). */
export const DEFAULT_BADGES: Omit<BadgeDef, 'id' | 'active'>[] = [
  { name: 'Primer paso', icon: 'check', kind: 'misiones', targets: [1, 25, 100, 500], habitKey: null },
  { name: 'Doble racha', icon: 'flame', kind: 'racha', targets: [2, 7, 14, 30], habitKey: null },
  { name: 'Semana de fuego', icon: 'calendar', kind: 'racha', targets: [7, 14, 30, 60], habitKey: null },
  { name: 'Madrugador', icon: 'sun-dim', kind: 'mision', targets: [7, 30, 100, 365], habitKey: 'celular' },
  { name: 'Políglota', icon: 'languages', kind: 'mision', targets: [10, 30, 100, 365], habitKey: 'ingles' },
  { name: 'Mes imparable', icon: 'trophy', kind: 'racha', targets: [30, 60, 100, 365], habitKey: null },
  { name: 'En movimiento', icon: 'bolt', kind: 'mision', targets: [7, 30, 100, 365], habitKey: 'ejercicio' },
];

/** Días en que se marcó una misión concreta (por su clave). */
const daysWith = (days: Days, key: string): number => Object.values(days).filter((h) => !!h[key]).length;

export function badgeProgress(def: BadgeDef, ctx: BadgeContext): number {
  switch (def.kind) {
    case 'racha':
      return ctx.streaks.best;
    case 'misiones':
      return ctx.totalDone;
    case 'xp':
      return ctx.xp;
    case 'mision':
      return def.habitKey ? daysWith(ctx.days, def.habitKey) : 0;
  }
}

const UNIT: Record<BadgeKind, [string, string]> = {
  racha: ['día', 'días'],
  misiones: ['misión', 'misiones'],
  xp: ['XP', 'XP'],
  mision: ['día', 'días'],
};
const unitOf = (kind: BadgeKind, n: number): string => UNIT[kind][n === 1 ? 0 : 1];

/** Lo que pide la insignia, en una frase con las metas de los cuatro niveles ("Racha: 7 · 30 · 100 · 365 días"). */
export function badgeRule(def: BadgeDef, habitName: (key: string) => string = (k) => k): string {
  const list = def.targets.join(' · ');
  const unit = unitOf(def.kind, def.targets[def.targets.length - 1]);
  switch (def.kind) {
    case 'racha':
      return `Racha: ${list} ${unit}`;
    case 'misiones':
      return `Misiones: ${list}`;
    case 'xp':
      return `XP: ${list}`;
    case 'mision':
      return `${habitName(def.habitKey ?? '')}: ${list} ${unit}`;
  }
}

export interface BadgeState {
  def: BadgeDef;
  value: number;
  /** Niveles alcanzados: 0 (ninguno) a 4 (Platino). */
  tier: number;
  /** Nombre del nivel alcanzado, '' si todavía no tiene ninguno. */
  tierName: TierName | '';
  /** Ganó al menos el primer nivel. */
  earned: boolean;
  /** Llegó al último nivel. */
  maxed: boolean;
  /** Meta del siguiente nivel, null si ya está en Platino. */
  next: number | null;
  /** Qué parte de la meta siguiente lleva, de 0 a 100 (100 en Platino). */
  pct: number;
  /** "Nivel máximo · 400 días" o "12 / 30 días". */
  sub: string;
  rule: string;
}

export function badgeStates(ctx: BadgeContext, defs: BadgeDef[], habitName?: (key: string) => string): BadgeState[] {
  return defs.map((def) => {
    const value = badgeProgress(def, ctx);
    const tier = def.targets.filter((t) => value >= t).length;
    const maxed = tier >= def.targets.length;
    const next = maxed ? null : def.targets[tier];
    return {
      def,
      value,
      tier,
      tierName: tier ? TIERS[tier - 1] : '',
      earned: tier > 0,
      maxed,
      next,
      pct: next === null ? 100 : Math.min(100, Math.floor((value / next) * 100)),
      sub: next === null ? `Nivel máximo · ${value} ${unitOf(def.kind, value)}` : `${value} / ${next} ${unitOf(def.kind, next)}`,
      rule: badgeRule(def, habitName),
    };
  });
}

/** Nombre del nivel, o "Nivel N" si no tiene uno configurado. */
export const levelName = (level: number): string => LEVEL_NAMES[level - 1] ?? `Nivel ${level}`;
