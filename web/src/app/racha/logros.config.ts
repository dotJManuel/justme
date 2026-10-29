import { IconName } from '../icons/icon';
import { Days, StreakInfo } from '../habits/streaks';

// Insignias y nombres de nivel. Las insignias son de cada persona (tabla `badges`, ver supabase/18_insignias.sql) y se
// administran en Perfil › Insignias; aquí vive cómo se calcula su avance. Nada se guarda sobre si ya se ganó:
// se calcula siempre con los días guardados. Los nombres de nivel siguen siendo una constante del cliente.

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
  /** Cuánto hay que juntar para ganarla. */
  target: number;
  /** Solo para `mision`: la clave de la misión. */
  habitKey: string | null;
  active: boolean;
}

/** Las siete de siempre: lo que recibe cada persona al empezar (igual que en la base de datos). */
export const DEFAULT_BADGES: Omit<BadgeDef, 'id' | 'active'>[] = [
  { name: 'Primer paso', icon: 'check', kind: 'misiones', target: 1, habitKey: null },
  { name: 'Doble racha', icon: 'flame', kind: 'racha', target: 2, habitKey: null },
  { name: 'Semana de fuego', icon: 'calendar', kind: 'racha', target: 7, habitKey: null },
  { name: 'Madrugador', icon: 'sun-dim', kind: 'mision', target: 7, habitKey: 'celular' },
  { name: 'Políglota', icon: 'languages', kind: 'mision', target: 10, habitKey: 'ingles' },
  { name: 'Mes imparable', icon: 'trophy', kind: 'racha', target: 30, habitKey: null },
  { name: 'En movimiento', icon: 'bolt', kind: 'mision', target: 7, habitKey: 'ejercicio' },
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

/** Lo que pide la insignia, en una frase ("Llega a 7 días de racha"). */
export function badgeRule(def: BadgeDef, habitName: (key: string) => string = (k) => k): string {
  const n = def.target;
  switch (def.kind) {
    case 'racha':
      return `Llega a ${n} ${unitOf('racha', n)} de racha`;
    case 'misiones':
      return `Completa ${n} ${unitOf('misiones', n)}`;
    case 'xp':
      return `Junta ${n} XP`;
    case 'mision':
      return `${habitName(def.habitKey ?? '')}: ${n} ${unitOf('mision', n)}`;
  }
}

export interface BadgeState {
  def: BadgeDef;
  value: number;
  earned: boolean;
  /** "Ganada" o "2 / 7 días". */
  sub: string;
  rule: string;
}

export function badgeStates(ctx: BadgeContext, defs: BadgeDef[], habitName?: (key: string) => string): BadgeState[] {
  return defs.map((def) => {
    const value = badgeProgress(def, ctx);
    const earned = value >= def.target;
    return {
      def,
      value,
      earned,
      sub: earned ? 'Ganada' : `${value} / ${def.target} ${unitOf(def.kind, def.target)}`,
      rule: badgeRule(def, habitName),
    };
  });
}

/** Nombre del nivel, o "Nivel N" si no tiene uno configurado. */
export const levelName = (level: number): string => LEVEL_NAMES[level - 1] ?? `Nivel ${level}`;
