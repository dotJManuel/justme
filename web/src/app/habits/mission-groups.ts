// Cómo se agrupan y ordenan las misiones por la hora que dice su texto de horario (`when`). No hay un campo de
// grupo en la base de datos: se deduce de "7:40 – 8:40", "19:00 · 10 a 15 min", "Huecos del trabajo"…

export type MissionGroup = 'Mañana' | 'Durante el día' | 'Noche';

export const MISSION_GROUPS: MissionGroup[] = ['Mañana', 'Durante el día', 'Noche'];

/** Primer y segundo horario ("H:MM") del texto, en minutos desde medianoche. */
function times(when: string): number[] {
  return [...when.matchAll(/(\d{1,2}):(\d{2})/g)].map((m) => Number(m[1]) * 60 + Number(m[2])).filter((n) => n < 24 * 60);
}

/**
 * Mañana: empieza antes de las 12. Durante el día: de 12 a 18, o "huecos" (cualquier momento). Noche: desde las 18,
 * y lo que no dice hora ("Cuando surja") para dejarlo al final del día.
 */
export function missionGroup(when: string): MissionGroup {
  if (/hueco/i.test(when)) return 'Durante el día';
  const [start] = times(when);
  if (start === undefined) return 'Noche';
  return start < 12 * 60 ? 'Mañana' : start < 18 * 60 ? 'Durante el día' : 'Noche';
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
