import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { ConfigService, HabitItem } from './config.service';
import { SupabaseService } from './supabase.service';

const habit = (k: string, when: string, groupId: string | null): HabitItem => ({ k, name: k, when, active: true, groupId });

function setup() {
  TestBed.configureTestingModule({ providers: [{ provide: SupabaseService, useValue: { client: {} } }] });
  const config = TestBed.inject(ConfigService);
  config.groups.set([
    { id: 'g1', name: 'Mañana' },
    { id: 'g2', name: 'Tarde' },
    { id: 'g3', name: 'Noche' },
  ]);
  config.habits.set([habit('a', '7:00', 'g1'), habit('b', '', 'g2'), habit('c', '19:00', null)]);
  return config;
}

describe('ConfigService · grupos de misiones', () => {
  it('el grupo de una misión es el guardado o, si no tiene, el que dice su hora', () => {
    const config = setup();
    expect(config.groupName(config.habits()[1])).toBe('Tarde');
    expect(config.groupName(config.habits()[2])).toBe('Noche');
  });

  it('ordena los nombres como están los grupos', () => {
    const config = setup();
    expect(config.orderGroups(['Noche', 'Mañana', 'Tarde'])).toEqual(['Mañana', 'Tarde', 'Noche']);
  });

  it('detecta nombres repetidos sin importar mayúsculas, salvo el del grupo que se edita', () => {
    const config = setup();
    expect(config.groupExists(' tarde ')).toBe(true);
    expect(config.groupExists('Tarde', 'g2')).toBe(false);
    expect(config.groupExists('Gimnasio')).toBe(false);
  });

  it('cuenta las misiones de un grupo', () => {
    const config = setup();
    expect(config.groupSize('g1')).toBe(1);
    expect(config.groupSize('g3')).toBe(0);
  });

  it('un grupo con misiones no se puede quitar', async () => {
    const config = setup();
    await expect(config.removeGroup('g1')).rejects.toThrow();
    expect(config.groups().length).toBe(3);
  });
});
