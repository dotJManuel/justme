import { Injectable, computed, inject, signal } from '@angular/core';
import {
  DEFAULT_ACTIVE_DAYS,
  DEFAULT_FREEZE_MIN,
  DEFAULT_GOAL,
  DEFAULT_HABITS,
} from './habits/habits.config';
import { inferGroup, orderGroupNames } from './habits/mission-groups';
import { RachaConfig } from './habits/streaks';
import { SupabaseService } from './supabase.service';

export interface HabitItem {
  k: string;
  name: string;
  when: string;
  active: boolean;
  /** Grupo ("¿Cuándo?") al que pertenece; null si no tiene (o si aún no existe la tabla de grupos). */
  groupId: string | null;
}

/** Grupo de misiones (Mañana, Durante el día, Noche o uno propio). */
export interface HabitGroup {
  id: string;
  name: string;
}

interface HabitRow {
  key: string;
  name: string;
  when_text: string;
  position: number;
  active: boolean;
  group_id?: string | null;
}

interface GroupRow {
  id: string;
  name: string;
  position: number;
}

/** Ajustes del usuario (meta, congelación, días), su lista de misiones y los grupos de misiones, guardados en Supabase. */
@Injectable({ providedIn: 'root' })
export class ConfigService {
  private readonly client = inject(SupabaseService).client;

  /** Todas las misiones en orden, activas o no. */
  readonly habits = signal<HabitItem[]>([]);
  /** Grupos en su orden. */
  readonly groups = signal<HabitGroup[]>([]);
  /**
   * ¿Existe la tabla de grupos (supabase/20_grupos_de_misiones.sql)? Si no, todo sigue como antes: el grupo de cada
   * misión se deduce de su hora y los grupos no se pueden administrar.
   */
  readonly groupsReady = signal(false);
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
    this.groups.set([]);
    this.groupsReady.set(false);
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

  // ── Misiones

  async addHabit(name: string, when: string, groupId: string | null = null): Promise<void> {
    const k = 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    const position = this.habits().length;
    const group = this.groupsReady() ? groupId : null;
    const { error } = await this.client
      .from('habits')
      .insert({ key: k, name, when_text: when, position, active: true, ...(this.groupsReady() && { group_id: group }) });
    if (error) throw error;
    this.habits.update((list) => [...list, { k, name, when, active: true, groupId: group }]);
  }

  async updateHabit(k: string, patch: Partial<Omit<HabitItem, 'k'>>): Promise<void> {
    const row: Partial<HabitRow> = {};
    if (patch.name !== undefined) row.name = patch.name;
    if (patch.when !== undefined) row.when_text = patch.when;
    if (patch.active !== undefined) row.active = patch.active;
    if (patch.groupId !== undefined && this.groupsReady()) row.group_id = patch.groupId;
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
      ...(this.groupsReady() && { group_id: h.groupId }),
    }));
    const { error } = await this.client.from('habits').upsert(rows, { onConflict: 'user_id,key' });
    if (error) throw error;
    this.habits.set(list);
  }

  // ── Grupos

  /** Nombre del grupo de una misión: el guardado o, si no tiene, el que dice su hora. */
  groupName(h: HabitItem): string {
    return this.groups().find((g) => g.id === h.groupId)?.name ?? inferGroup(h.when);
  }

  /** Los nombres de grupo dados, en el orden de los grupos (y los que no existen como grupo, al final). */
  orderGroups(names: string[]): string[] {
    return orderGroupNames(names, this.groups().map((g) => g.name));
  }

  /** ¿Ya hay un grupo con ese nombre (sin importar mayúsculas)? `exceptId` es el que se está editando. */
  groupExists(name: string, exceptId?: string): boolean {
    const n = name.trim().toLowerCase();
    return this.groups().some((g) => g.id !== exceptId && g.name.toLowerCase() === n);
  }

  /** Cuántas misiones (activas o no) tiene un grupo. */
  groupSize(id: string): number {
    return this.habits().filter((h) => h.groupId === id).length;
  }

  /** Crea un grupo al final y devuelve su id. */
  async addGroup(name: string): Promise<string> {
    const { data, error } = await this.client
      .from('mission_groups')
      .insert({ name, position: this.groups().length })
      .select('id, name')
      .single();
    if (error) throw error;
    this.groups.update((l) => [...l, { id: data.id, name: data.name }]);
    return data.id as string;
  }

  async renameGroup(id: string, name: string): Promise<void> {
    const { error } = await this.client.from('mission_groups').update({ name }).eq('id', id);
    if (error) throw error;
    this.groups.update((l) => l.map((g) => (g.id === id ? { ...g, name } : g)));
  }

  /** Sube (-1) o baja (+1) un grupo. */
  async moveGroup(id: string, dir: -1 | 1): Promise<void> {
    const list = [...this.groups()];
    const i = list.findIndex((g) => g.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    const results = await Promise.all(list.map((g, position) => this.client.from('mission_groups').update({ position }).eq('id', g.id)));
    const failed = results.find((r) => r.error);
    if (failed?.error) throw failed.error;
    this.groups.set(list);
  }

  /** Quita un grupo vacío. Con misiones dentro no se quita: primero hay que moverlas. */
  async removeGroup(id: string): Promise<void> {
    if (this.groupSize(id) > 0) throw new Error('El grupo tiene misiones');
    const { error } = await this.client.from('mission_groups').delete().eq('id', id);
    if (error) throw error;
    this.groups.update((l) => l.filter((g) => g.id !== id));
  }

  // ── Carga

  private async fetch(): Promise<void> {
    let { settings, habits, groups } = await this.read();
    if (!settings) {
      await this.seed();
      ({ settings, habits, groups } = await this.read());
    }
    if (!settings) throw new Error('No se pudieron crear los ajustes');
    this.goal.set(settings.goal);
    this.freezeMin.set(settings.freeze_min);
    this.activeDays.set(settings.active_days);
    this.groupsReady.set(groups !== null);
    this.groups.set((groups ?? []).map((g) => ({ id: g.id, name: g.name })));
    this.habits.set(
      habits.map((r) => ({ k: r.key, name: r.name, when: r.when_text, active: r.active, groupId: r.group_id ?? null })),
    );
  }

  /** Los grupos, o null si todavía no existe la tabla (no se ha corrido supabase/20_grupos_de_misiones.sql). */
  private async readGroups(): Promise<GroupRow[] | null> {
    const g = await this.client.from('mission_groups').select('id, name, position').order('position').order('created_at');
    return g.error ? null : (g.data as GroupRow[]);
  }

  private async read() {
    const groups = await this.readGroups();
    const cols = groups ? 'key, name, when_text, position, active, group_id' : 'key, name, when_text, position, active';
    const [s, h] = await Promise.all([
      this.client.from('settings').select('goal, freeze_min, active_days').maybeSingle(),
      this.client.from('habits').select(cols).order('position'),
    ]);
    if (s.error) throw s.error;
    if (h.error) throw h.error;
    return { settings: s.data, habits: h.data as unknown as HabitRow[], groups };
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
    // Al crearse los ajustes, la base crea también los grupos de siempre; cada misión inicial va al que le toca.
    const groups = await this.readGroups();
    const idOf = (name: string) => groups?.find((g) => g.name === name)?.id ?? null;
    const h = await this.client.from('habits').upsert(
      DEFAULT_HABITS.map((x, position) => ({
        key: x.k,
        name: x.name,
        when_text: x.when,
        position,
        active: true,
        ...(groups && { group_id: idOf(inferGroup(x.when)) }),
      })),
      { onConflict: 'user_id,key', ignoreDuplicates: true },
    );
    if (h.error) throw h.error;
  }
}
