import { describe, expect, it } from 'vitest';
import { inferGroup, nextMission, orderGroupNames } from './mission-groups';

const at = (h: number, m = 0) => new Date(2026, 9, 27, h, m);
const M = (k: string, when: string) => ({ k, when });

describe('inferGroup', () => {
  it('deduce el grupo de las misiones por defecto como en el diseño', () => {
    expect(inferGroup('7:00')).toBe('Mañana');
    expect(inferGroup('7:40 – 8:40')).toBe('Mañana');
    expect(inferGroup('8:40 · 1 a 3 min')).toBe('Mañana');
    expect(inferGroup('Huecos del trabajo')).toBe('Durante el día');
    expect(inferGroup('8:40 y huecos del trabajo')).toBe('Durante el día');
    expect(inferGroup('30 min · huecos del día')).toBe('Durante el día');
    expect(inferGroup('19:00 · 10 a 15 min')).toBe('Noche');
    expect(inferGroup('21:00 – 22:30')).toBe('Noche');
    expect(inferGroup('Cuando surja')).toBe('Noche');
  });

  it('de 12 a 18 es durante el día', () => {
    expect(inferGroup('13:30')).toBe('Durante el día');
  });
});

describe('orderGroupNames', () => {
  it('sigue el orden de los grupos guardados', () => {
    expect(orderGroupNames(['Noche', 'Tarde', 'Mañana'], ['Mañana', 'Tarde', 'Durante el día', 'Noche'])).toEqual(['Mañana', 'Tarde', 'Noche']);
  });

  it('sin grupos guardados, primero los de siempre y luego el resto por aparición', () => {
    expect(orderGroupNames(['Noche', 'Gimnasio', 'Mañana', 'Tarde'], [])).toEqual(['Mañana', 'Noche', 'Gimnasio', 'Tarde']);
  });

  it('no repite nombres', () => {
    expect(orderGroupNames(['A', 'A', 'B'], ['B', 'A'])).toEqual(['B', 'A']);
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
