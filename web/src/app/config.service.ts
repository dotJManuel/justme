import { Injectable, computed, inject, signal } from '@angular/core';
import {
  DEFAULT_ACTIVE_DAYS,
  DEFAULT_FREEZE_MIN,
  DEFAULT_GOAL,
  DEFAULT_HABITS,
} from './habits/habits.config';
import { LEVEL_CAP_DEFAULT, levelRatioFor, levelThresholds, yearXpFor } from './habits/levels';
import { inferGroup, orderGroupNames } from './habits/mission-groups';
import { RachaConfig, dateKey } from './habits/streaks';
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

interface PlanRow {
  level_cap: number;
  level_ratio: number | string;
  /** Fecha aaaa-mm-dd. */
  level_start: string;
  level_xp: number[] | null;
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
  /**
   * Plan de niveles (supabase/22_plan_de_niveles.sql): nivel máximo, qué parte de las misiones activas se espera cumplir
   * cada día y desde cuándo cuenta el año.
   */
  readonly levelCap = signal(LEVEL_CAP_DEFAULT);
  readonly levelRatio = signal(levelRatioFor(DEFAULT_GOAL, DEFAULT_HABITS.length));
  readonly levelStart = signal(dateKey(new Date()));
  /** ¿Existen esas columnas? Si no, se usa el plan inicial y no se ajusta. */
  readonly planReady = signal(false);
  /** Experiencia total que pide cada nivel (el elemento i es la del nivel i + 1). */
  readonly levels = signal<number[]>(this.initialLevels());

  readonly activeHabits = computed(() => this.habits().filter((h) => h.active));
  /** Misiones al día que se espera cumplir: esa parte de las activas. */
  readonly expectedPerDay = computed(() => Math.max(1, this.levelRatio() * this.activeHabits().length));
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
    this.levelCap.set(LEVEL_CAP_DEFAULT);
    this.levelRatio.set(levelRatioFor(DEFAULT_GOAL, DEFAULT_HABITS.length));
    this.levelStart.set(dateKey(new Date()));
    this.levels.set(this.initialLevels());
    this.planReady.set(false);
  }

  /** La tabla de niveles de arranque: un año a las misiones al día que se espera cumplir. */
  private initialLevels(): number[] {
    const expected = this.habits().length ? this.expectedPerDay() : DEFAULT_GOAL;
    return levelThresholds(yearXpFor(expected, this.activeDays()), this.levelCap());
  }

  /** Guarda la tabla de niveles que ajustó el plan (ver LevelsService). */
  async saveLevels(levels: number[]): Promise<void> {
    const { error } = await this.client
      .from('settings')
      .upsert({ level_xp: levels, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
    if (error) throw error;
    this.levels.set(levels);
  }

  async saveSettings(goal: number, freezeMin: number, activeDays: number[]): Promise<void> {
    const days = [...activeDays].sort();
    // Con la meta nueva cambia qué parte de las misiones activas se espera cumplir al día
    const ratio = levelRatioFor(goal, this.activeHabits().length);
    const { error } = await this.client.from('settings').upsert(
      {
        goal,
        freeze_min: freezeMin,
        active_days: days,
        ...(this.planReady() && { level_ratio: ratio }),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    );
    if (error) throw error;
    this.goal.set(goal);
    this.freezeMin.set(freezeMin);
    this.activeDays.set(days);
    if (this.planReady()) this.levelRatio.set(ratio);
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
    let { settings, habits, groups, plan } = await this.read();
    if (!settings) {
      await this.seed();
      ({ settings, habits, groups, plan } = await this.read());
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
    this.planReady.set(plan !== null);
    if (plan) {
      this.levelCap.set(plan.level_cap);
      this.levelRatio.set(Number(plan.level_ratio));
      this.levelStart.set(plan.level_start);
      const saved = plan.level_xp;
      if (saved && saved.length === plan.level_cap && saved[0] === 0) {
        this.levels.set(saved);
      } else {
        // Primera vez con el plan: se calcula la tabla y se guarda (si no se puede guardar, se usa igual y se reintenta después)
        this.levels.set(this.initialLevels());
        void this.saveLevels(this.levels()).catch(() => undefined);
      }
    }
  }

  /** Los grupos, o null si todavía no existe la tabla (no se ha corrido supabase/20_grupos_de_misiones.sql). */
  private async readGroups(): Promise<GroupRow[] | null> {
    const g = await this.client.from('mission_groups').select('id, name, position').order('position').order('created_at');
    return g.error ? null : (g.data as GroupRow[]);
  }

  /** El plan de niveles, o null si todavía no existen sus columnas (no se ha corrido supabase/22_plan_de_niveles.sql). */
  private async readPlan(): Promise<PlanRow | null> {
    const p = await this.client.from('settings').select('level_cap, level_ratio, level_start, level_xp').maybeSingle();
    return p.error || !p.data ? null : (p.data as unknown as PlanRow);
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
    return { settings: s.data, habits: h.data as unknown as HabitRow[], groups, plan: await this.readPlan() };
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
