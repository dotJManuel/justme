import { Injectable, computed, inject, signal } from '@angular/core';
import { IconName } from '../icons/icon';
import { SupabaseService } from '../supabase.service';
import { BADGE_ICONS, BadgeDef, BadgeKind } from './logros.config';

interface BadgeRow {
  id: string;
  name: string;
  icon: string;
  kind: BadgeKind;
  targets: number[];
  habit_key: string | null;
  active: boolean;
}

/** Lo que se captura de una insignia (la base de datos pone el id y el orden). */
export type BadgeDraft = Pick<BadgeDef, 'name' | 'icon' | 'kind' | 'targets' | 'habitKey'>;

const COLS = 'id, name, icon, kind, targets, habit_key, active';

const toDef = (r: BadgeRow): BadgeDef => ({
  id: r.id,
  name: r.name,
  icon: (BADGE_ICONS as string[]).includes(r.icon) ? (r.icon as IconName) : 'trophy',
  kind: r.kind,
  targets: r.targets,
  habitKey: r.habit_key,
  active: r.active,
});

const toRow = (d: BadgeDraft) => ({
  name: d.name,
  icon: d.icon,
  kind: d.kind,
  targets: d.targets,
  // Solo el tipo "mision" lleva misión (la base lo exige así)
  habit_key: d.kind === 'mision' ? d.habitKey : null,
});

/** Insignias de la persona, guardadas en Supabase (tabla `badges`, ver supabase/18_insignias.sql). */
@Injectable({ providedIn: 'root' })
export class BadgesService {
  private readonly client = inject(SupabaseService).client;

  /** Todas, activas o no, en su orden. */
  readonly all = signal<BadgeDef[]>([]);
  /** Solo las que se muestran en Logros. */
  readonly active = computed(() => this.all().filter((b) => b.active));
  readonly loaded = signal(false);
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
    this.all.set([]);
    this.loaded.set(false);
  }

  async add(draft: BadgeDraft): Promise<void> {
    const position = this.all().length;
    const { data, error } = await this.client.from('badges').insert({ ...toRow(draft), position }).select(COLS).single();
    if (error) throw error;
    this.all.update((l) => [...l, toDef(data as BadgeRow)]);
  }

  async update(id: string, draft: BadgeDraft): Promise<void> {
    const { data, error } = await this.client.from('badges').update(toRow(draft)).eq('id', id).select(COLS).single();
    if (error) throw error;
    this.all.update((l) => l.map((b) => (b.id === id ? toDef(data as BadgeRow) : b)));
  }

  async setActive(id: string, active: boolean): Promise<void> {
    const { error } = await this.client.from('badges').update({ active }).eq('id', id);
    if (error) throw error;
    this.all.update((l) => l.map((b) => (b.id === id ? { ...b, active } : b)));
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.client.from('badges').delete().eq('id', id);
    if (error) throw error;
    this.all.update((l) => l.filter((b) => b.id !== id));
  }

  private async fetch(): Promise<void> {
    const { data, error } = await this.client.from('badges').select(COLS).order('position').order('created_at');
    if (error) throw error;
    this.all.set((data as BadgeRow[]).map(toDef));
    this.loaded.set(true);
  }
}
