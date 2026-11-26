/** Orden, fijadas y árbol de las notas: operaciones puras sobre la lista de notas (sin Angular, se prueban solas). */
import type { Note } from './notas.service';

export type SortMode = 'recientes' | 'manual' | 'titulo' | 'creadas';

export const SORT_MODES: { value: SortMode; label: string }[] = [
  { value: 'recientes', label: 'Recientes' },
  { value: 'manual', label: 'Mi orden' },
  { value: 'titulo', label: 'Título (A–Z)' },
  { value: 'creadas', label: 'Creación' },
];

const collator = new Intl.Collator('es', { sensitivity: 'base', numeric: true });

/** Primero el lugar manual; a igualdad, la más antigua primero (así el orden nunca cambia por sí solo). */
export const byManual = (a: Note, b: Note): number => a.sortOrder - b.sortOrder || (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id < b.id ? -1 : 1);

/** Las subpáginas directas de una nota (o las del nivel principal con null), en el orden manual. */
export function childrenOf(notes: Note[], parentId: string | null): Note[] {
  return notes.filter((n) => n.parentId === parentId).sort(byManual);
}

function sortBy(list: Note[], mode: SortMode): Note[] {
  switch (mode) {
    case 'manual':
      return list.sort(byManual);
    case 'titulo':
      return list.sort((a, b) => collator.compare(a.title.trim() || '￿', b.title.trim() || '￿') || byManual(a, b));
    case 'creadas':
      return list.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
    default:
      return list.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
  }
}

/** Las notas del nivel principal, ordenadas como se pida. */
export function sortRoots(notes: Note[], mode: SortMode): Note[] {
  return sortBy(notes.filter((n) => !n.parentId), mode);
}

/** Todas las notas (también las subpáginas). En «Mi orden» salen como en el árbol: cada nota seguida de sus subpáginas. */
export function sortAll(notes: Note[], mode: SortMode): Note[] {
  if (mode === 'manual') return visibleRows(notes, new Set(notes.map((n) => n.id))).map((r) => r.note);
  return sortBy([...notes], mode);
}

/** Lo que hay en la papelera: los docs que se eliminaron por sí mismos (no junto con su padre), del más reciente al más antiguo. */
export function trashRoots(trash: Note[]): Note[] {
  const byId = new Map(trash.map((n) => [n.id, n]));
  return trash
    .filter((n) => {
      const p = n.parentId ? byId.get(n.parentId) : undefined;
      return !p || p.deletedAt !== n.deletedAt;
    })
    .sort((a, b) => ((a.deletedAt ?? '') < (b.deletedAt ?? '') ? 1 : -1));
}

/** Un doc de la papelera y todo lo que se eliminó junto con él. */
export function trashFamily(trash: Note[], id: string): Note[] {
  const root = trash.find((n) => n.id === id);
  if (!root) return [];
  const out = [root];
  for (let i = 0; i < out.length; i++) out.push(...trash.filter((n) => n.parentId === out[i].id && n.deletedAt === root.deletedAt));
  return out;
}

/** Las notas fijadas, en el orden en que se fijaron o acomodaron. */
export function pinnedNotes(notes: Note[]): Note[] {
  return notes.filter((n) => n.pinOrder !== null).sort((a, b) => (a.pinOrder ?? 0) - (b.pinOrder ?? 0) || byManual(a, b));
}

/** Una fila del árbol ya aplanada, con su sangría. */
export interface TreeRow {
  note: Note;
  depth: number;
  hasChildren: boolean;
  expanded: boolean;
}

/** Las filas visibles del árbol: cada nota, y debajo sus subpáginas si está expandida. */
export function visibleRows(notes: Note[], expanded: ReadonlySet<string>): TreeRow[] {
  const byParent = new Map<string | null, Note[]>();
  for (const n of notes) {
    const key = n.parentId && notes.some((p) => p.id === n.parentId) ? n.parentId : null; // una huérfana se muestra en el nivel principal
    const list = byParent.get(key);
    if (list) list.push(n);
    else byParent.set(key, [n]);
  }
  const out: TreeRow[] = [];
  const walk = (parent: string | null, depth: number, seen: Set<string>) => {
    for (const note of (byParent.get(parent) ?? []).sort(byManual)) {
      if (seen.has(note.id)) continue; // por si los datos traen un ciclo
      const hasChildren = (byParent.get(note.id)?.length ?? 0) > 0;
      const open = hasChildren && expanded.has(note.id);
      out.push({ note, depth, hasChildren, expanded: open });
      if (open) walk(note.id, depth + 1, new Set(seen).add(note.id));
    }
  };
  walk(null, 0, new Set());
  return out;
}

/** ¿`id` es la nota `ancestorId` o está dentro de ella (a cualquier profundidad)? */
export function isInside(notes: Note[], id: string, ancestorId: string): boolean {
  const byId = new Map(notes.map((n) => [n.id, n]));
  let cur = byId.get(id);
  for (let guard = 0; cur && guard < 100; guard++) {
    if (cur.id === ancestorId) return true;
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return false;
}

/** Los ids de las notas que contienen a `id`, de la más alta a la más cercana. */
export function ancestorIds(notes: Note[], id: string): string[] {
  const byId = new Map(notes.map((n) => [n.id, n]));
  const out: string[] = [];
  let cur = byId.get(byId.get(id)?.parentId ?? '');
  for (let guard = 0; cur && guard < 100; guard++) {
    out.unshift(cur.id);
    cur = byId.get(cur.parentId ?? '');
  }
  return out;
}

/** La lista de ids con `movedId` puesto antes o después de `targetId` (se quita de donde estaba). */
export function placeNear(ids: string[], movedId: string, targetId: string, where: 'before' | 'after'): string[] {
  const rest = ids.filter((x) => x !== movedId);
  const at = rest.indexOf(targetId);
  if (at < 0) return [...rest, movedId];
  rest.splice(where === 'before' ? at : at + 1, 0, movedId);
  return rest;
}

/** Sube (-1) o baja (+1) un id un lugar en la lista; igual si ya está en la orilla. */
export function shift(ids: string[], id: string, dir: -1 | 1): string[] {
  const i = ids.indexOf(id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= ids.length) return ids;
  const copy = [...ids];
  [copy[i], copy[j]] = [copy[j], copy[i]];
  return copy;
}

export type DropZone = 'before' | 'inside' | 'after';

/**
 * Dónde cae algo que se arrastra sobre una fila, según la altura del puntero: el cuarto de arriba es «antes», el de abajo
 * «después» y el centro «dentro» (agrupar). Sin `canNest`, el centro se reparte entre antes y después.
 */
export function dropZone(y: number, top: number, height: number, canNest: boolean): DropZone {
  const t = height > 0 ? (y - top) / height : 0.5;
  if (!canNest) return t < 0.5 ? 'before' : 'after';
  return t < 0.25 ? 'before' : t > 0.75 ? 'after' : 'inside';
}

/**
 * Reacomoda un subconjunto de una lista sin mover lo demás: los lugares que ocupaban los ids de `subset` se rellenan, en
 * orden, con `next` (que debe traer esos mismos ids reordenados). Sirve para ordenar «las otras notas» sin perder el lugar
 * de las que están fijadas y no se ven en esa lista.
 */
export function mergeOrder(full: string[], subset: string[], next: string[]): string[] {
  const set = new Set(subset);
  if (next.length !== subset.length || next.some((id) => !set.has(id))) return full;
  let k = 0;
  return full.map((id) => (set.has(id) ? next[k++] : id));
}
