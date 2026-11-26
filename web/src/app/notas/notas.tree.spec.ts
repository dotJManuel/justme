import { describe, expect, it } from 'vitest';
import type { Note } from './notas.service';
import { ancestorIds, byManual, childrenOf, dropZone, isInside, mergeOrder, pinnedNotes, placeNear, shift, sortAll, sortRoots, trashFamily, trashRoots, visibleRows } from './notas.tree';

let n = 0;
const note = (id: string, o: Partial<Note> = {}): Note => ({
  id, title: id, blocks: [], updatedAt: '2026-01-01T00:00:00Z', createdAt: `2026-01-0${(n++ % 9) + 1}T00:00:00Z`, sortOrder: 0, pinOrder: null, icon: '', parentId: null,
  lockHolder: null, lockUntil: null, ...o,
});

describe('orden de las notas', () => {
  const a = note('a', { title: 'Zorro', sortOrder: 2, updatedAt: '2026-03-01T00:00:00Z', createdAt: '2026-01-03T00:00:00Z' });
  const b = note('b', { title: 'árbol', sortOrder: 0, updatedAt: '2026-01-01T00:00:00Z', createdAt: '2026-01-01T00:00:00Z' });
  const c = note('c', { title: '', sortOrder: 1, updatedAt: '2026-02-01T00:00:00Z', createdAt: '2026-01-02T00:00:00Z' });
  const sub = note('s', { parentId: 'a', title: 'Hija' });

  it('cada modo ordena el nivel principal y deja fuera las subpáginas', () => {
    const all = [a, b, c, sub];
    expect(sortRoots(all, 'manual').map((x) => x.id)).toEqual(['b', 'c', 'a']);
    expect(sortRoots(all, 'recientes').map((x) => x.id)).toEqual(['a', 'c', 'b']);
    expect(sortRoots(all, 'creadas').map((x) => x.id)).toEqual(['a', 'c', 'b']);
  });

  it('por título ignora acentos y mayúsculas y deja las sin título al final', () => {
    expect(sortRoots([a, b, c], 'titulo').map((x) => x.id)).toEqual(['b', 'a', 'c']);
  });

  it('el orden manual es estable: a igualdad, la más antigua primero', () => {
    const x = note('x', { sortOrder: 5, createdAt: '2026-01-02T00:00:00Z' });
    const y = note('y', { sortOrder: 5, createdAt: '2026-01-01T00:00:00Z' });
    expect([x, y].sort(byManual).map((k) => k.id)).toEqual(['y', 'x']);
  });

  it('childrenOf devuelve las subpáginas directas en orden manual', () => {
    const k1 = note('k1', { parentId: 'p', sortOrder: 1 });
    const k0 = note('k0', { parentId: 'p', sortOrder: 0 });
    expect(childrenOf([k1, k0, note('otra', { parentId: 'q' })], 'p').map((x) => x.id)).toEqual(['k0', 'k1']);
  });
});

describe('fijadas', () => {
  it('salen en su orden y solo las fijadas', () => {
    const list = [note('a', { pinOrder: 2 }), note('b'), note('c', { pinOrder: 0 }), note('d', { pinOrder: 1 })];
    expect(pinnedNotes(list).map((x) => x.id)).toEqual(['c', 'd', 'a']);
  });
});

describe('árbol', () => {
  const root1 = note('r1', { sortOrder: 0 });
  const root2 = note('r2', { sortOrder: 1 });
  const k1 = note('k1', { parentId: 'r1', sortOrder: 0 });
  const k2 = note('k2', { parentId: 'r1', sortOrder: 1 });
  const g1 = note('g1', { parentId: 'k1' });
  const all = [root2, g1, k2, root1, k1];

  it('aplana solo lo expandido, con su sangría', () => {
    expect(visibleRows(all, new Set()).map((r) => [r.note.id, r.depth, r.hasChildren, r.expanded])).toEqual([
      ['r1', 0, true, false],
      ['r2', 0, false, false],
    ]);
    expect(visibleRows(all, new Set(['r1', 'k1'])).map((r) => `${r.depth}${r.note.id}`)).toEqual(['0r1', '1k1', '2g1', '1k2', '0r2']);
  });

  it('una nota sin hijas nunca figura como expandida y una huérfana sube al nivel principal', () => {
    const rows = visibleRows([note('x', { parentId: 'borrada' }), root2], new Set(['r2', 'x']));
    expect(rows.map((r) => [r.note.id, r.depth, r.expanded])).toEqual([['x', 0, false], ['r2', 0, false]].sort(() => 0).map((r) => r));
  });

  it('un ciclo en los datos no cuelga el árbol', () => {
    const a = note('a', { parentId: 'b' });
    const b = note('b', { parentId: 'a' });
    expect(() => visibleRows([a, b], new Set(['a', 'b']))).not.toThrow();
  });

  it('isInside reconoce la propia nota y a sus descendientes', () => {
    expect(isInside(all, 'g1', 'r1')).toBe(true);
    expect(isInside(all, 'r1', 'r1')).toBe(true);
    expect(isInside(all, 'r1', 'g1')).toBe(false);
    expect(isInside(all, 'r2', 'r1')).toBe(false);
  });

  it('ancestorIds va de la más alta a la más cercana', () => {
    expect(ancestorIds(all, 'g1')).toEqual(['r1', 'k1']);
    expect(ancestorIds(all, 'r1')).toEqual([]);
  });
});

describe('mover en una lista', () => {
  it('placeNear pone un id antes o después de otro y lo quita de donde estaba', () => {
    expect(placeNear(['a', 'b', 'c', 'd'], 'd', 'b', 'before')).toEqual(['a', 'd', 'b', 'c']);
    expect(placeNear(['a', 'b', 'c', 'd'], 'a', 'c', 'after')).toEqual(['b', 'c', 'a', 'd']);
    expect(placeNear(['a', 'b'], 'x', 'b', 'before')).toEqual(['a', 'x', 'b']);
    expect(placeNear(['a', 'b'], 'x', 'zzz', 'after')).toEqual(['a', 'b', 'x']);
  });

  it('shift sube o baja un lugar y respeta las orillas', () => {
    expect(shift(['a', 'b', 'c'], 'b', -1)).toEqual(['b', 'a', 'c']);
    expect(shift(['a', 'b', 'c'], 'b', 1)).toEqual(['a', 'c', 'b']);
    expect(shift(['a', 'b', 'c'], 'a', -1)).toEqual(['a', 'b', 'c']);
    expect(shift(['a', 'b', 'c'], 'c', 1)).toEqual(['a', 'b', 'c']);
    expect(shift(['a', 'b'], 'x', 1)).toEqual(['a', 'b']);
  });

  it('dropZone reparte la altura de la fila', () => {
    expect(dropZone(102, 100, 40, true)).toBe('before');
    expect(dropZone(120, 100, 40, true)).toBe('inside');
    expect(dropZone(138, 100, 40, true)).toBe('after');
    expect(dropZone(110, 100, 40, false)).toBe('before');
    expect(dropZone(130, 100, 40, false)).toBe('after');
  });
});

describe('mergeOrder', () => {
  it('rellena los lugares del subconjunto sin mover lo demás', () => {
    // «p» y «q» están fijadas (no se ven en la lista de abajo): conservan su lugar.
    expect(mergeOrder(['a', 'p', 'b', 'q', 'c'], ['a', 'b', 'c'], ['c', 'a', 'b'])).toEqual(['c', 'p', 'a', 'q', 'b']);
    expect(mergeOrder(['a', 'b', 'c'], ['a', 'b', 'c'], ['b', 'c', 'a'])).toEqual(['b', 'c', 'a']);
  });

  it('si la lista nueva no trae los mismos ids, no cambia nada', () => {
    expect(mergeOrder(['a', 'b', 'c'], ['a', 'b'], ['a', 'x'])).toEqual(['a', 'b', 'c']);
    expect(mergeOrder(['a', 'b', 'c'], ['a', 'b'], ['a'])).toEqual(['a', 'b', 'c']);
  });
});

describe('todas las notas y la papelera', () => {
  const a = note('a', { sortOrder: 0, updatedAt: '2026-01-01T00:00:00Z' });
  const s = note('s', { parentId: 'a', updatedAt: '2026-05-01T00:00:00Z' });
  const b = note('b', { sortOrder: 1, updatedAt: '2026-03-01T00:00:00Z' });

  it('sortAll incluye las subpáginas; en «Mi orden» van tras su padre', () => {
    expect(sortAll([a, s, b], 'recientes').map((x) => x.id)).toEqual(['s', 'b', 'a']);
    expect(sortAll([a, s, b], 'manual').map((x) => x.id)).toEqual(['a', 's', 'b']);
  });

  it('trashRoots deja solo lo eliminado por sí mismo y trashFamily junta lo que se fue con él', () => {
    const at = '2026-06-01T00:00:00Z';
    const t = [note('p', { deletedAt: at }), note('h', { parentId: 'p', deletedAt: at }), note('x', { parentId: 'p', deletedAt: '2026-05-01T00:00:00Z' })];
    expect(trashRoots(t).map((x) => x.id).sort()).toEqual(['p', 'x']);
    expect(trashFamily(t, 'p').map((x) => x.id)).toEqual(['p', 'h']);
  });
});
