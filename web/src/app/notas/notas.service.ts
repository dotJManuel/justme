import { Injectable, inject, signal } from '@angular/core';
import { environment } from '../../environments/environment';
import { SupabaseService } from '../supabase.service';
import { Block, MAX_TITLE, newBlock, parseBlocks, serializeBlocks } from './notas.blocks';

export interface Note {
  id: string;
  title: string;
  blocks: Block[];
  /** ISO de la última vez que se guardó. */
  updatedAt: string;
  /** Quién edita ahora (id de una pestaña); null si nadie. */
  lockHolder: string | null;
  lockUntil: string | null;
}

/** Resultado de tomar o usar el bloqueo de edición. */
export type LockResult = 'ok' | 'locked' | 'missing';

interface NoteRow {
  id: string;
  title: string;
  content: unknown;
  updated_at: string;
  lock_holder: string | null;
  lock_until: string | null;
}

const COLS = 'id, title, content, updated_at, lock_holder, lock_until';

/** Cada cuánto se renueva el bloqueo (dura 45 s en la base de datos). */
export const HEARTBEAT_MS = 15_000;

const toNote = (r: NoteRow): Note => ({
  id: r.id,
  title: r.title,
  blocks: parseBlocks(r.content),
  updatedAt: r.updated_at,
  lockHolder: r.lock_holder,
  lockUntil: r.lock_until,
});

const byRecent = (a: Note, b: Note) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0);

/**
 * Notas en Supabase (tabla `notes`, ver supabase/24_notas.sql). Solo una pestaña o dispositivo edita una nota a la
 * vez: `holder` identifica esta pestaña y el servidor rechaza el guardado de quien no tenga el bloqueo.
 */
@Injectable({ providedIn: 'root' })
export class NotasService {
  private readonly client = inject(SupabaseService).client;
  /** Token de la sesión, a la mano para soltar el bloqueo al cerrar la pestaña (ahí no se puede esperar nada). */
  private token: string | null = null;

  /** Identifica a esta pestaña ante el bloqueo. */
  readonly holder = newHolder();
  readonly notes = signal<Note[]>([]);
  readonly loaded = signal(false);
  private loading?: Promise<void>;

  constructor() {
    const auth = this.client.auth;
    void auth.getSession().then(({ data }) => (this.token ??= data.session?.access_token ?? null));
    auth.onAuthStateChange((_event, session) => (this.token = session?.access_token ?? null));
  }

  load(): Promise<void> {
    this.loading ??= this.fetchAll().catch((e) => {
      this.loading = undefined;
      throw e;
    });
    return this.loading;
  }

  /** Olvida lo cargado (al cambiar de usuario). */
  reset() {
    this.loading = undefined;
    this.notes.set([]);
    this.loaded.set(false);
  }

  async create(): Promise<Note> {
    const { data, error } = await this.client
      .from('notes')
      .insert({ title: '', content: serializeBlocks([newBlock()]) })
      .select(COLS)
      .single();
    if (error) throw error;
    const note = toNote(data as NoteRow);
    this.notes.update((l) => [note, ...l]);
    return note;
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.client.from('notes').delete().eq('id', id);
    if (error) throw error;
    this.notes.update((l) => l.filter((n) => n.id !== id));
  }

  /** Trae una nota fresca (y la deja en la lista). null si ya no existe. */
  async fetchOne(id: string): Promise<Note | null> {
    const { data, error } = await this.client.from('notes').select(COLS).eq('id', id).maybeSingle();
    if (error) throw error;
    if (!data) {
      this.notes.update((l) => l.filter((n) => n.id !== id));
      return null;
    }
    const note = toNote(data as NoteRow);
    this.put(note);
    return note;
  }

  /** Toma (o renueva) el bloqueo de edición. `force` se lo quita a otra pestaña ("Editar aquí"). */
  async acquire(id: string, force = false): Promise<LockResult> {
    const { data, error } = await this.client.rpc('note_lock', { p_id: id, p_holder: this.holder, p_force: force });
    if (error) throw error;
    return data as LockResult;
  }

  async release(id: string): Promise<void> {
    await this.client.rpc('note_unlock', { p_id: id, p_holder: this.holder });
  }

  /**
   * Suelta el bloqueo al cerrar la pestaña, cuando ya no se puede esperar una respuesta: la petición sobrevive a
   * la página (`keepalive`). Si falla, el bloqueo vence solo a los 45 s.
   */
  releaseOnExit(id: string) {
    const token = this.token;
    if (!token) return;
    try {
      void fetch(`${environment.supabaseUrl}/rest/v1/rpc/note_unlock`, {
        method: 'POST',
        keepalive: true,
        headers: { 'Content-Type': 'application/json', apikey: environment.supabaseKey, Authorization: `Bearer ${token}` },
        body: JSON.stringify({ p_id: id, p_holder: this.holder }),
      }).catch(() => undefined);
    } catch {
      /* el bloqueo vence solo */
    }
  }

  /** Guarda título y contenido. 'locked' = otra sesión tomó el bloqueo y NO se guardó nada. */
  async save(id: string, title: string, blocks: Block[]): Promise<LockResult> {
    const clean = title.slice(0, MAX_TITLE);
    const content = serializeBlocks(blocks);
    const { data, error } = await this.client.rpc('note_save', { p_id: id, p_holder: this.holder, p_title: clean, p_content: content });
    if (error) throw error;
    const result = data as LockResult;
    if (result === 'ok') {
      this.notes.update((l) =>
        l.map((n) => (n.id === id ? { ...n, title: clean, blocks: content, updatedAt: new Date().toISOString(), lockHolder: this.holder } : n)).sort(byRecent),
      );
    } else if (result === 'missing') {
      this.notes.update((l) => l.filter((n) => n.id !== id));
    }
    return result;
  }

  /** ¿Otra pestaña o dispositivo tiene el bloqueo vigente de esta nota? */
  lockedByOther(n: Pick<Note, 'lockHolder' | 'lockUntil'>): boolean {
    return !!n.lockHolder && n.lockHolder !== this.holder && !!n.lockUntil && Date.parse(n.lockUntil) > Date.now();
  }

  private put(note: Note) {
    this.notes.update((l) => (l.some((n) => n.id === note.id) ? l.map((n) => (n.id === note.id ? note : n)) : [note, ...l]).sort(byRecent));
  }

  private async fetchAll(): Promise<void> {
    const { data, error } = await this.client.from('notes').select(COLS).order('updated_at', { ascending: false });
    if (error) throw error;
    this.notes.set((data as NoteRow[]).map(toNote));
    this.loaded.set(true);
  }
}

function newHolder(): string {
  const c = globalThis.crypto;
  return (c?.randomUUID ? c.randomUUID() : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`).slice(0, 36);
}
