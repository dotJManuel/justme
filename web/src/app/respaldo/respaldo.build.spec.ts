import { describe, expect, it } from 'vitest';
import { Block } from '../notas/notas.blocks';
import { ExportNote, daysRows, fileName, noteMarkdown, planImages, planNoteFiles, readme, relativeLink, toCsv, uniqueName } from './respaldo.build';

const b = (id: string, type: Block['type'], text = ''): Block => ({ id, type, text });
let k = 0;
const note = (id: string, title: string, o: Partial<ExportNote> = {}): ExportNote => ({
  id, title, icon: '', parentId: null, sortOrder: 0, createdAt: `2026-01-0${(k++ % 9) + 1}T00:00:00Z`, blocks: [], ...o,
});

describe('toCsv', () => {
  it('usa comillas cuando hace falta, CRLF y BOM para Excel', () => {
    const csv = toCsv([{ a: 'hola, mundo', b: 'dice "hi"', c: 'línea\nnueva', d: 5 }], [
      { key: 'a', label: 'A' }, { key: 'b', label: 'B' }, { key: 'c', label: 'C' }, { key: 'd', label: 'D' },
    ]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.slice(1)).toBe('A,B,C,D\r\n"hola, mundo","dice ""hi""","línea\nnueva",5\r\n');
  });

  it('neutraliza lo que una hoja ejecutaría como fórmula, pero no los números negativos', () => {
    const csv = toCsv([{ a: '=SUM(A1)', b: '@cmd', c: '-5', d: '-hola' }], [
      { key: 'a', label: 'a' }, { key: 'b', label: 'b' }, { key: 'c', label: 'c' }, { key: 'd', label: 'd' },
    ]);
    expect(csv.slice(1).split('\r\n')[1]).toBe("'=SUM(A1),'@cmd,-5,'-hola");
  });

  it('los vacíos y los objetos salen bien', () => {
    expect(toCsv([{ a: null, b: undefined, c: { x: 1 }, d: true }], ['a', 'b', 'c', 'd'].map((x) => ({ key: x, label: x }))).slice(1).split('\r\n')[1]).toBe(',,"{""x"":1}",true');
  });
});

describe('nombres de archivo', () => {
  it('limpia lo que el sistema no acepta y nunca queda vacío', () => {
    expect(fileName('A/B: C?')).toBe('A B C');
    expect(fileName('  ...  ')).toBe('Sin título');
    expect(fileName('')).toBe('Sin título');
    expect(fileName('x'.repeat(200))).toHaveLength(80);
  });

  it('uniqueName agrega (2), (3)… sin distinguir mayúsculas', () => {
    const used = new Set<string>();
    expect([uniqueName(used, 'Ideas'), uniqueName(used, 'ideas'), uniqueName(used, 'IDEAS'), uniqueName(used, 'Otra')]).toEqual(['Ideas', 'ideas (2)', 'IDEAS (3)', 'Otra']);
  });
});

describe('relativeLink', () => {
  it('sube y baja carpetas y codifica espacios y paréntesis', () => {
    expect(relativeLink('notas/A.md', 'notas/A/Hija.md')).toBe('A/Hija.md');
    expect(relativeLink('notas/A/Hija.md', 'notas/A.md')).toBe('../A.md');
    expect(relativeLink('notas/A/Hija.md', 'imagenes/x/foto.webp')).toBe('../../imagenes/x/foto.webp');
    expect(relativeLink('notas/A.md', 'notas/Mi nota (2).md')).toBe('Mi%20nota%20%282%29.md');
  });
});

describe('planNoteFiles', () => {
  it('replica el árbol: archivo y carpeta por nota, en orden manual', () => {
    const files = planNoteFiles([
      note('c', 'Hija', { parentId: 'a', sortOrder: 1 }),
      note('a', 'Trabajo', { sortOrder: 0 }),
      note('d', 'Nieta', { parentId: 'c' }),
      note('e', 'Otra', { sortOrder: 1 }),
    ]);
    expect(Object.fromEntries(files)).toEqual({
      a: 'notas/Trabajo.md', c: 'notas/Trabajo/Hija.md', d: 'notas/Trabajo/Hija/Nieta.md', e: 'notas/Otra.md',
    });
  });

  it('nombres repetidos, sin título, huérfanas y ciclos no rompen nada', () => {
    const files = planNoteFiles([
      note('1', 'Igual'), note('2', 'Igual'), note('3', ''), note('4', 'Huérfana', { parentId: 'no-existe' }),
      note('x', 'X', { parentId: 'y' }), note('y', 'Y', { parentId: 'x' }),
    ]);
    expect([...files.values()].filter((p) => p.startsWith('notas/Igual'))).toEqual(['notas/Igual.md', 'notas/Igual (2).md']);
    expect(files.get('3')).toBe('notas/Sin título.md');
    expect(files.get('4')).toBe('notas/Huérfana.md');
    expect(new Set(files.values()).size).toBe(files.size);
  });
});

describe('planImages', () => {
  it('agrupa por nota y no repite nombres', () => {
    const n1 = note('n1', 'A', { blocks: [{ id: 'i1', type: 'image', text: '', path: 'u/n1/f.webp' }, { id: 'i2', type: 'image', text: '', path: 'u/n1/f.webp' }, { id: 'i3', type: 'image', text: '', url: 'https://x.com/a.png' }] });
    expect(planImages([n1]).map((i) => i.file)).toEqual(['imagenes/n1/f.webp', 'imagenes/n1/2-f.webp']);
  });
});

describe('noteMarkdown', () => {
  const parent = note('p', 'Plan', { icon: '🎯' });
  const child = note('c', 'Hija (nota)', { parentId: 'p' });
  parent.blocks = [
    b('1', 'h1', 'Hola'),
    b('2', 'p', 'un <b>párrafo</b>'),
    b('3', 'p', 'otro'),
    b('4', 'ul', 'uno'), b('5', 'ul', 'dos'),
    { id: '6', type: 'todo', text: 'hacer', done: true },
    { id: '7', type: 'page', text: '', ref: 'c' },
    { id: '8', type: 'image', text: 'Mi <i>foto</i>', path: 'u/p/f.webp' },
    { id: '9', type: 'image', text: '', path: 'u/p/rota.webp' },
    { id: '10', type: 'image', text: '', url: 'https://x.com/a.png' },
  ];
  const files = planNoteFiles([parent, child]);
  const titles = new Map([['p', 'Plan'], ['c', 'Hija (nota)']]);

  it('arma el documento con líneas en blanco, listas juntas, enlaces e imágenes relativas', () => {
    const md = noteMarkdown(parent, files, titles, new Map([['u/p/f.webp', 'imagenes/p/f.webp']]));
    expect(md).toBe(
      [
        '# 🎯 Plan', '',
        '# Hola', '',
        'un **párrafo**', '',
        'otro', '',
        '- uno\n- dos', '',
        '- [x] hacer', '',
        '[Hija (nota)](Plan/Hija%20%28nota%29.md)', '',
        '![Mi foto](../imagenes/p/f.webp)', '',
        '![](imagen-no-incluida)', '',
        '![](https://x.com/a.png)', '',
      ].join('\n'),
    );
  });

  it('una nota vacía lleva solo su título y el enlace a una subpágina ausente queda sin dirección', () => {
    expect(noteMarkdown(note('v', ''), planNoteFiles([note('v', '')]), new Map(), new Map())).toBe('# Sin título\n');
    const solo = note('s', 'Sola', { blocks: [{ id: '1', type: 'page', text: '', ref: 'fantasma' }] });
    expect(noteMarkdown(solo, planNoteFiles([solo]), new Map(), new Map())).toContain('[Subpágina]');
  });
});

describe('daysRows', () => {
  it('una fila por misión marcada, en orden de fecha, con el nombre de la misión', () => {
    const rows = daysRows(
      [{ date: '2026-02-02', habits: { b: '2026-02-02T09:00:00Z', a: true, c: false } }, { date: '2026-01-31', habits: { a: '2026-01-31T08:00:00Z' } }, { date: '2026-03-01', habits: null }],
      new Map([['a', 'Leer']]),
    );
    expect(rows).toEqual([
      { fecha: '2026-01-31', clave: 'a', mision: 'Leer', hora: '2026-01-31T08:00:00Z' },
      { fecha: '2026-02-02', clave: 'b', mision: 'b', hora: '2026-02-02T09:00:00Z' },
      { fecha: '2026-02-02', clave: 'a', mision: 'Leer', hora: '' },
    ]);
  });
});

describe('readme', () => {
  it('describe el contenido y avisa de lo que no se pudo incluir', () => {
    const t = readme({ creado: new Date('2026-11-25T12:00:00Z'), notas: 3, imagenes: 2, imagenesFallidas: 1, omitidas: ['fin_audit'] });
    expect(t).toContain('3 doc(s)');
    expect(t).toContain('2 imagen(es)');
    expect(t).toContain('1 imagen(es) no se pudieron');
    expect(t).toContain('fin_audit');
    expect(t.includes('\r\n')).toBe(true);
  });
});
