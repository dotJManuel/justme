import { Injectable, computed, inject, signal } from '@angular/core';
import {
  DEFAULT_ACTIVE_DAYS,
  DEFAULT_FREEZE_MIN,
  DEFAULT_GOAL,
  DEFAULT_HABITS,
} from './habits/habits.config';
import { RachaConfig } from './habits/streaks';
import { SupabaseService } from './supabase.service';

export interface HabitItem {
  k: string;
  name: string;
  when: string;
  active: boolean;
}

interface HabitRow {
  key: string;
  name: string;
  when_text: string;
  position: number;
  active: boolean;
}

/** Ajustes del usuario (meta, congelación, días) y su lista de misiones, guardados en Supabase. */
@Injectable({ providedIn: 'root' })
export class ConfigService {
  private readonly client = inject(SupabaseService).client;

  /** Todas las misiones en orden, activas o no. */
  readonly habits = signal<HabitItem[]>([]);
  readonly goal = signal(DEFAULT_GOAL);
  readonly freezeMin = signal(DEFAULT_FREEZE_MIN);
  readonly activeDays = signal<number[]>(DEFAULT_ACTIVE_DAYS);

  readonly activeHabits = computed(() => this.habits().filter((h) => h.active));
  readonly racha = computed<RachaConfig>(() => ({
    habitKeys: this.habits().map((h) => h.k),
    goal: this.goal(),
    freezeMin: this.freezeMin(),
    activeDays: this.activeDays(),
  }));

  private loading?: Promise<void>;

  /** Carga una sola vez; si falla, se puede reintentar. */
  load(): Promise<void> {
    this.loading ??= this.fetch().catch((e) => {
      this.loading = undefined;
      throw e;
    });
    return this.loading;
  }

  /** Olvida lo cargado (al cambiar de usuario). */
  reset() {
    this.loading = undefined;
    this.habits.set([]);
    this.goal.set(DEFAULT_GOAL);
    this.freezeMin.set(DEFAULT_FREEZE_MIN);
    this.activeDays.set(DEFAULT_ACTIVE_DAYS);
  }

  async saveSettings(goal: number, freezeMin: number, activeDays: number[]): Promise<void> {
    const days = [...activeDays].sort();
    const { error } = await this.client.from('settings').upsert(
      { goal, freeze_min: freezeMin, active_days: days, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    );
    if (error) throw error;
    this.goal.set(goal);
    this.freezeMin.set(freezeMin);
    this.activeDays.set(days);
  }

  async addHabit(name: string, when: string): Promise<void> {
    const k = 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    const position = this.habits().length;
    const { error } = await this.client
      .from('habits')
      .insert({ key: k, name, when_text: when, position, active: true });
    if (error) throw error;
    this.habits.update((list) => [...list, { k, name, when, active: true }]);
  }

  async updateHabit(k: string, patch: Partial<Omit<HabitItem, 'k'>>): Promise<void> {
    const row: Partial<HabitRow> = {};
    if (patch.name !== undefined) row.name = patch.name;
    if (patch.when !== undefined) row.when_text = patch.when;
    if (patch.active !== undefined) row.active = patch.active;
    const { error } = await this.client.from('habits').update(row).eq('key', k);
    if (error) throw error;
    this.habits.update((list) => list.map((h) => (h.k === k ? { ...h, ...patch } : h)));
  }

  /** Sube (-1) o baja (+1) una misión en la lista completa. */
  async move(k: string, dir: -1 | 1): Promise<void> {
    const list = [...this.habits()];
    const i = list.findIndex((h) => h.k === k);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    const rows = list.map((h, position) => ({
      key: h.k,
      name: h.name,
      when_text: h.when,
      position,
      active: h.active,
    }));
    const { error } = await this.client.from('habits').upsert(rows, { onConflict: 'user_id,key' });
    if (error) throw error;
    this.habits.set(list);
  }

  private async fetch(): Promise<void> {
    let { settings, habits } = await this.read();
    if (!settings) {
      await this.seed();
      ({ settings, habits } = await this.read());
    }
    if (!settings) throw new Error('No se pudieron crear los ajustes');
    this.goal.set(settings.goal);
    this.freezeMin.set(settings.freeze_min);
    this.activeDays.set(settings.active_days);
    this.habits.set(habits.map((r) => ({ k: r.key, name: r.name, when: r.when_text, active: r.active })));
  }

  private async read() {
    const [s, h] = await Promise.all([
      this.client.from('settings').select('goal, freeze_min, active_days').maybeSingle(),
      this.client.from('habits').select('key, name, when_text, position, active').order('position'),
    ]);
    if (s.error) throw s.error;
    if (h.error) throw h.error;
    return { settings: s.data, habits: h.data as HabitRow[] };
  }

  /** Primera vez del usuario: copia los valores iniciales a la base de datos. */
  private async seed(): Promise<void> {
    const s = await this.client
      .from('settings')
      .upsert(
        { goal: DEFAULT_GOAL, freeze_min: DEFAULT_FREEZE_MIN, active_days: DEFAULT_ACTIVE_DAYS },
        { onConflict: 'user_id', ignoreDuplicates: true },
      );
    if (s.error) throw s.error;
    const h = await this.client.from('habits').upsert(
      DEFAULT_HABITS.map((x, position) => ({
        key: x.k,
        name: x.name,
        when_text: x.when,
        position,
        active: true,
      })),
      { onConflict: 'user_id,key', ignoreDuplicates: true },
    );
    if (h.error) throw h.error;
  }
}
