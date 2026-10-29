import { Injectable, inject, signal } from '@angular/core';
import { SupabaseService } from '../supabase.service';

export interface AppLink {
  id: string;
  title: string;
  url: string;
  note: string;
}

interface LinkRow {
  id: string;
  title: string;
  url: string;
  note: string;
}

const COLS = 'id, title, url, note';

/**
 * Convierte lo que se escribió en una dirección válida: sin esquema se asume https y solo se aceptan http(s).
 * Devuelve null si no es una dirección.
 */
export function normalizeUrl(raw: string): string | null {
  const text = raw.trim();
  if (!text || /\s/.test(text)) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`;
  try {
    const u = new URL(withScheme);
    return (u.protocol === 'http:' || u.protocol === 'https:') && u.hostname.includes('.') ? u.href : null;
  } catch {
    return null;
  }
}

/** Enlaces externos de Perfil, guardados en Supabase (tabla `links`, ver supabase/17_enlaces.sql). */
@Injectable({ providedIn: 'root' })
export class LinksService {
  private readonly client = inject(SupabaseService).client;

  readonly links = signal<AppLink[]>([]);
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
    this.links.set([]);
    this.loaded.set(false);
  }

  async add(title: string, url: string, note: string): Promise<void> {
    const position = this.links().length;
    const { data, error } = await this.client.from('links').insert({ title, url, note, position }).select(COLS).single();
    if (error) throw error;
    this.links.update((l) => [...l, data as LinkRow]);
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.client.from('links').delete().eq('id', id);
    if (error) throw error;
    this.links.update((l) => l.filter((x) => x.id !== id));
  }

  private async fetch(): Promise<void> {
    const { data, error } = await this.client.from('links').select(COLS).order('position').order('created_at');
    if (error) throw error;
    this.links.set(data as LinkRow[]);
    this.loaded.set(true);
  }
}
