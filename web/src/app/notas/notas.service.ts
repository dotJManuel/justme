import { Injectable, inject, signal } from '@angular/core';
import { environment } from '../../environments/environment';
import { SupabaseService } from '../supabase.service';
import { Block, MAX_TITLE, newBlock, newId, parseBlocks, serializeBlocks } from './notas.blocks';

export interface Note {
  id: string;
  title: string;
  blocks: Block[];
  /** ISO de la última vez que se guardó. */
  updatedAt: string;
  /** ISO de cuando se creó. */
  createdAt: string;
  /** Lugar entre sus hermanas (las notas del mismo padre), de menor a mayor. */
  sortOrder: number;
  /** Lugar entre las notas fijadas; null si no está fijada. */
  pinOrder: number | null;
  /** Un emoji que acompaña al título (vacío si no tiene). */
  icon: string;
  /** La nota que la contiene (es una subpágina); null si está en el nivel principal. */
  parentId: string | null;
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
  created_at: string;
  sort_order: number | null;
  pin_order: number | null;
  icon: string | null;
  parent_id: string | null;
  lock_holder: string | null;
  lock_until: string | null;
}

const COLS = 'id, title, content, updated_at, created_at, sort_order, pin_order, icon, parent_id, lock_holder, lock_until';

/** Almacenamiento privado de las imágenes (ver supabase/26_notas_imagenes_y_arreglo.sql). */
const BUCKET = 'note-images';
/** Cuánto duran las direcciones firmadas de las imágenes, y cuánto antes de vencer se piden de nuevo. */
const SIGNED_SECONDS = 2 * 3600;
const RENEW_BEFORE_MS = 10 * 60_000;

/** Una dirección temporal para ver una imagen privada. */
export interface SignedUrl {
  url: string;
  /** Cuándo vence (ms desde 1970). */
  exp: number;
}

/** Cada cuánto se renueva el bloqueo (dura 45 s en la base de datos). */
export const HEARTBEAT_MS = 15_000;

const toNote = (r: NoteRow): Note => ({
  id: r.id,
  title: r.title,
  blocks: parseBlocks(r.content),
  updatedAt: r.updated_at,
  createdAt: r.created_at,
  sortOrder: r.sort_order ?? 0,
  pinOrder: r.pin_order,
  icon: r.icon ?? '',
  parentId: r.parent_id,
  lockHolder: r.lock_holder,
  lockUntil: r.lock_until,
});

const byRecent = (a: Note, b: Note) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0);

/**
 * Notas en Supabase (tabla `notes`, ver supabase/24_notas.sql y 25_notas_subpaginas.sql). Solo una pestaña o dispositivo edita una nota a la
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
  /** Direcciones firmadas de las imágenes subidas, por ruta del archivo. */
  readonly imageUrls = signal<Record<string, SignedUrl>>({});
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

  /** Crea una nota vacía; con `parentId`, como subpágina de esa nota. */
  async create(parentId: string | null = null): Promise<Note> {
    const last = this.notes().filter((n) => n.parentId === parentId).reduce((m, n) => Math.max(m, n.sortOrder), -1);
    const { data, error } = await this.client
      .from('notes')
      .insert({ title: '', content: serializeBlocks([newBlock()]), parent_id: parentId, sort_order: last + 1 })
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
    // La base de datos borra también las subpáginas (en cascada): aquí se quitan del caché.
    const gone = new Set([id, ...this.descendants(id).map((n) => n.id)]);
    this.notes.update((l) => l.filter((n) => !gone.has(n.id)));
    // Las imágenes de esas notas ya no se necesitan: se borran del almacenamiento (sin bloquear ni avisar si falla).
    void this.deleteNoteFiles([...gone]);
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
  async save(id: string, title: string, blocks: Block[], icon = ''): Promise<LockResult> {
    const clean = title.slice(0, MAX_TITLE);
    const content = serializeBlocks(blocks);
    const { data, error } = await this.client.rpc('note_save', { p_id: id, p_holder: this.holder, p_title: clean, p_content: content, p_icon: icon });
    if (error) throw error;
    const result = data as LockResult;
    if (result === 'ok') {
      this.notes.update((l) =>
        l.map((n) => (n.id === id ? { ...n, title: clean, icon, blocks: content, updatedAt: new Date().toISOString(), lockHolder: this.holder } : n)).sort(byRecent),
      );
    } else if (result === 'missing') {
      this.notes.update((l) => l.filter((n) => n.id !== id));
    }
    return result;
  }

  // ── Orden, fijadas y agrupar ───────────────────────────────────────────────

  /** Llama a una función de la base de datos. Se separa para que la demo de desarrollo pueda sustituirla. */
  protected async rpc(name: string, args: Record<string, unknown>): Promise<unknown> {
    const { data, error } = await this.client.rpc(name, args);
    if (error) throw error;
    return data;
  }

  /** Cambia las notas del caché de golpe; devuelve cómo deshacerlo si la base de datos rechaza el cambio. */
  private optimistic(change: (n: Note) => Note): () => void {
    const before = this.notes();
    this.notes.set(before.map(change));
    return () => this.notes.set(before);
  }

  /** Las notas fijadas, en este orden; las demás dejan de estarlo. */
  async setPins(ids: string[]): Promise<void> {
    const undo = this.optimistic((n) => ({ ...n, pinOrder: ids.includes(n.id) ? ids.indexOf(n.id) : null }));
    try {
      await this.rpc('note_set_pins', { p_ids: ids });
    } catch (e) {
      undo();
      throw e;
    }
  }

  /** Fija o suelta una nota: al fijarla va al final de las fijadas. */
  togglePin(id: string): Promise<void> {
    const pins = this.notes().filter((n) => n.pinOrder !== null).sort((a, b) => (a.pinOrder ?? 0) - (b.pinOrder ?? 0)).map((n) => n.id);
    return this.setPins(pins.includes(id) ? pins.filter((x) => x !== id) : [...pins, id]);
  }

  /** El orden de un grupo de notas hermanas: cada una toma su posición en la lista. */
  async reorder(ids: string[]): Promise<void> {
    const undo = this.optimistic((n) => (ids.includes(n.id) ? { ...n, sortOrder: ids.indexOf(n.id) } : n));
    try {
      await this.rpc('note_reorder', { p_ids: ids });
    } catch (e) {
      undo();
      throw e;
    }
  }

  /**
   * Mete una nota dentro de otra (o la sube al nivel principal con `parentId` null). Con `order` (los ids de sus nuevas
   * hermanas, ya con ella en su lugar) queda en esa posición; sin él, al final. Lanza si se intenta meter una nota dentro
   * de sí misma o de una de sus subpáginas.
   */
  async move(id: string, parentId: string | null, order?: string[]): Promise<void> {
    const last = this.notes().filter((n) => n.parentId === parentId && n.id !== id).reduce((m, n) => Math.max(m, n.sortOrder), -1);
    const undo = this.optimistic((n) => (n.id === id ? { ...n, parentId, sortOrder: last + 1 } : n));
    try {
      const result = await this.rpc('note_move', { p_id: id, p_parent: parentId });
      if (result === 'cycle') throw new Error('cycle');
      if (result === 'missing') throw new Error('missing');
      if (order?.length) await this.reorder(order);
    } catch (e) {
      undo();
      throw e;
    }
  }

  // ── Imágenes ───────────────────────────────────────────────────────────────

  private async userId(): Promise<string> {
    const { data } = await this.client.auth.getSession();
    const id = data.session?.user.id;
    if (!id) throw new Error('sin sesión');
    return id;
  }

  /** Sube una imagen a la carpeta de la persona y de la nota; devuelve la ruta del archivo. */
  async uploadImage(noteId: string, blob: Blob, ext: string, contentType: string): Promise<string> {
    const path = `${await this.userId()}/${noteId}/${newId()}.${ext}`;
    const { error } = await this.client.storage.from(BUCKET).upload(path, blob, { contentType, cacheControl: '31536000', upsert: false });
    if (error) throw error;
    return path;
  }

  /** Pide direcciones firmadas para las rutas que aún no tienen una vigente. */
  async ensureImageUrls(paths: string[], force = false): Promise<void> {
    const now = Date.now();
    const cur = this.imageUrls();
    const need = [...new Set(paths)].filter((p) => p && (force || !cur[p] || cur[p].exp - now < RENEW_BEFORE_MS));
    if (!need.length) return;
    const { data, error } = await this.client.storage.from(BUCKET).createSignedUrls(need, SIGNED_SECONDS);
    if (error) throw error;
    const exp = now + SIGNED_SECONDS * 1000;
    const next = { ...this.imageUrls() };
    for (const r of data ?? []) if (r.path && r.signedUrl) next[r.path] = { url: r.signedUrl, exp };
    this.imageUrls.set(next);
  }

  /** Borra un archivo de imagen (se llama al quitar el bloque; si falla, no pasa nada: solo queda un archivo sin usar). */
  async deleteImage(path: string): Promise<void> {
    await this.client.storage.from(BUCKET).remove([path]).catch(() => undefined);
  }

  /** Borra todas las imágenes de las notas indicadas. */
  private async deleteNoteFiles(noteIds: string[]): Promise<void> {
    try {
      const uid = await this.userId();
      for (const id of noteIds) {
        const folder = `${uid}/${id}`;
        const { data } = await this.client.storage.from(BUCKET).list(folder, { limit: 200 });
        if (data?.length) await this.client.storage.from(BUCKET).remove(data.map((o) => `${folder}/${o.name}`));
      }
    } catch {
      /* son archivos sueltos: no justifica un error */
    }
  }

  /** Una nota del caché por su id. */
  byId(id: string | null | undefined): Note | undefined {
    return id ? this.notes().find((n) => n.id === id) : undefined;
  }

  /** Las subpáginas directas de una nota. */
  children(id: string): Note[] {
    return this.notes().filter((n) => n.parentId === id);
  }

  /** Todas las subpáginas de una nota, a cualquier profundidad. */
  descendants(id: string): Note[] {
    const out: Note[] = [];
    const walk = (p: string) => {
      for (const c of this.children(p)) {
        out.push(c);
        walk(c.id);
      }
    };
    walk(id);
    return out;
  }

  /** La cadena de notas que contienen a esta, de la más alta a la más cercana (sin incluirla). */
  ancestors(id: string): Note[] {
    const out: Note[] = [];
    let cur = this.byId(this.byId(id)?.parentId);
    for (let guard = 0; cur && guard < 20; guard++) {
      out.unshift(cur);
      cur = this.byId(cur.parentId);
    }
    return out;
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
