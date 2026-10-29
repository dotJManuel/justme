// Grupos de misiones ("¿Cuándo?": Mañana, Durante el día, Noche y los propios). Cada misión guarda su grupo
// (tabla `mission_groups`, ver supabase/20_grupos_de_misiones.sql). Lo de aquí es lo que no depende de la base de
// datos: los nombres iniciales, cómo se deduce el grupo de una misión que no tiene (por su hora) y qué misión toca ahora.

/** Los grupos con los que empieza cada persona, en este orden. */
export const MISSION_GROUPS: string[] = ['Mañana', 'Durante el día', 'Noche'];

/** Largo máximo del nombre de un grupo (el tope de la base de datos). */
export const MAX_GROUP_LENGTH = 24;

/** Primer y segundo horario ("H:MM") del texto, en minutos desde medianoche. */
function times(when: string): number[] {
  return [...when.matchAll(/(\d{1,2}):(\d{2})/g)].map((m) => Number(m[1]) * 60 + Number(m[2])).filter((n) => n < 24 * 60);
}

/**
 * El grupo que dice la hora de una misión. Mañana: empieza antes de las 12. Durante el día: de 12 a 18, o "huecos"
 * (cualquier momento). Noche: desde las 18, y lo que no dice hora ("Cuando surja") para dejarlo al final del día.
 * Sirve para las misiones iniciales y para las que no tienen grupo guardado.
 */
export function inferGroup(when: string): string {
  if (/hueco/i.test(when)) return 'Durante el día';
  const [start] = times(when);
  if (start === undefined) return 'Noche';
  return start < 12 * 60 ? 'Mañana' : start < 18 * 60 ? 'Durante el día' : 'Noche';
}

/**
 * Los nombres de grupo dados, sin repetir y en el orden de `order` (el de los grupos guardados). Los que no están
 * en `order` (grupos deducidos, mientras no existan los guardados) van al final: primero los de siempre.
 */
export function orderGroupNames(names: string[], order: string[]): string[] {
  const unique = [...new Set(names)];
  const rank = (n: string): number => {
    const i = order.indexOf(n);
    if (i >= 0) return i;
    const d = MISSION_GROUPS.indexOf(n);
    return order.length + (d >= 0 ? d : MISSION_GROUPS.length);
  };
  return unique.map((n, i) => ({ n, i })).sort((a, b) => rank(a.n) - rank(b.n) || a.i - b.i).map((x) => x.n);
}

export interface NextMission<T> {
  mission: T;
  /** Su horario incluye la hora actual. */
  inWindow: boolean;
}

/**
 * La misión pendiente que toca ahora: la que está en su horario; si no, la próxima por horario; si no, la primera sin
 * hora fija (huecos); y si solo quedan horarios que ya pasaron, la primera de la lista.
 */
export function nextMission<T extends { when: string }>(pending: T[], now: Date): NextMission<T> | null {
  if (!pending.length) return null;
  const minutes = now.getHours() * 60 + now.getMinutes();
  const timed = pending
    .map((mission) => {
      const [start, end] = times(mission.when);
      return start === undefined || /hueco/i.test(mission.when) ? null : { mission, start, end: end ?? start + 60 };
    })
    .filter((x): x is { mission: T; start: number; end: number } => x !== null);

  const current = timed.find((x) => x.start <= minutes && minutes <= x.end);
  if (current) return { mission: current.mission, inWindow: true };
  const upcoming = timed.filter((x) => x.start > minutes).sort((a, b) => a.start - b.start)[0];
  if (upcoming) return { mission: upcoming.mission, inWindow: false };
  const flexible = pending.find((m) => !timed.some((x) => x.mission === m));
  return { mission: flexible ?? pending[0], inWindow: false };
}
