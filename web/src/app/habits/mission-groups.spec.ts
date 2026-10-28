import { describe, expect, it } from 'vitest';
import { missionGroup, nextMission } from './mission-groups';

const at = (h: number, m = 0) => new Date(2026, 9, 27, h, m);
const M = (k: string, when: string) => ({ k, when });

describe('missionGroup', () => {
  it('agrupa las misiones por defecto como en el diseño', () => {
    expect(missionGroup('7:00')).toBe('Mañana');
    expect(missionGroup('7:40 – 8:40')).toBe('Mañana');
    expect(missionGroup('8:40 · 1 a 3 min')).toBe('Mañana');
    expect(missionGroup('Huecos del trabajo')).toBe('Durante el día');
    expect(missionGroup('8:40 y huecos del trabajo')).toBe('Durante el día');
    expect(missionGroup('19:00 · 10 a 15 min')).toBe('Noche');
    expect(missionGroup('21:00 – 22:30')).toBe('Noche');
    expect(missionGroup('Cuando surja')).toBe('Noche');
  });

  it('de 12 a 18 es durante el día', () => {
    expect(missionGroup('13:30')).toBe('Durante el día');
  });
});

describe('nextMission', () => {
  const list = [M('grab', '8:40 · 1 a 3 min'), M('rev', 'Huecos del trabajo'), M('voz', '19:00 · 10 a 15 min'), M('proy', '21:00 – 22:30')];

  it('sin pendientes no hay siguiente', () => {
    expect(nextMission([], at(10))).toBeNull();
  });

  it('elige la que está en su horario', () => {
    expect(nextMission(list, at(21, 30))).toEqual({ mission: list[3], inWindow: true });
  });

  it('si ninguna está en horario, la próxima por hora', () => {
    expect(nextMission(list, at(10))).toEqual({ mission: list[2], inWindow: false });
  });

  it('pasado el último horario, la primera sin hora fija', () => {
    expect(nextMission(list, at(23, 18))).toEqual({ mission: list[1], inWindow: false });
  });

  it('si solo quedan horarios pasados, la primera de la lista', () => {
    const only = [list[0], list[2]];
    expect(nextMission(only, at(23, 18))).toEqual({ mission: only[0], inWindow: false });
  });
});
