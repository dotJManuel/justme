import { IconName } from '../icons/icon';
import { Days, StreakInfo } from '../habits/streaks';

// Insignias y nombres de nivel. NO existen en el backend: son una configuración del cliente, calculada solo con los
// días ya guardados (ningún dato nuevo se guarda). Cambia la lista para agregar, quitar o ajustar insignias.

/** Nombre de cada nivel, por posición (el nivel 1 es el índice 0). Vacío = se muestra solo "Nivel N". */
export const LEVEL_NAMES: string[] = [];

export interface BadgeContext {
  days: Days;
  streaks: StreakInfo;
  /** Misiones marcadas en toda la historia. */
  totalDone: number;
}

export interface BadgeDef {
  id: string;
  name: string;
  icon: IconName;
  /** Cuánto hay que juntar para ganarla. */
  target: number;
  /** Unidad del progreso, para el texto "2 / 7 días". */
  unit: string;
  /** Texto de lo que pide, para la etiqueta accesible. */
  rule: string;
  progress: (ctx: BadgeContext) => number;
}

/** Días en que se marcó una misión concreta (por su clave). */
const daysWith = (days: Days, key: string): number => Object.values(days).filter((h) => !!h[key]).length;

export const BADGES: BadgeDef[] = [
  { id: 'primer-paso', name: 'Primer paso', icon: 'check', target: 1, unit: 'misión', rule: 'Completa tu primera misión', progress: (c) => c.totalDone },
  { id: 'doble-racha', name: 'Doble racha', icon: 'flame', target: 2, unit: 'días', rule: 'Llega a 2 días de racha', progress: (c) => c.streaks.best },
  { id: 'semana-de-fuego', name: 'Semana de fuego', icon: 'calendar', target: 7, unit: 'días', rule: 'Llega a 7 días de racha', progress: (c) => c.streaks.best },
  { id: 'madrugador', name: 'Madrugador', icon: 'sun-dim', target: 7, unit: 'días', rule: 'Celular lejos 7 días', progress: (c) => daysWith(c.days, 'celular') },
  { id: 'poliglota', name: 'Políglota', icon: 'languages', target: 10, unit: 'días', rule: 'Vocabulario de inglés 10 días', progress: (c) => daysWith(c.days, 'ingles') },
  { id: 'mes-imparable', name: 'Mes imparable', icon: 'trophy', target: 30, unit: 'días', rule: 'Llega a 30 días de racha', progress: (c) => c.streaks.best },
];

export interface BadgeState {
  def: BadgeDef;
  value: number;
  earned: boolean;
  /** "Ganada" o "2 / 7 días". */
  sub: string;
}

export function badgeStates(ctx: BadgeContext, defs: BadgeDef[] = BADGES): BadgeState[] {
  return defs.map((def) => {
    const value = def.progress(ctx);
    const earned = value >= def.target;
    return { def, value, earned, sub: earned ? 'Ganada' : `${value} / ${def.target} ${def.unit}` };
  });
}

/** Nombre del nivel, o "Nivel N" si no tiene uno configurado. */
export const levelName = (level: number): string => LEVEL_NAMES[level - 1] ?? `Nivel ${level}`;
