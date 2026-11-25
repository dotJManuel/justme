import { describe, expect, it } from 'vitest';
import {
  Block,
  backspaceAtStart,
  codeText,
  emptyRows,
  headings,
  parseBlocks,
  plain,
  sameContent,
  searchText,
  serializeBlocks,
  setType,
  splitWith,
  tableAddCol,
  tableAddRow,
  tableDelCol,
  tableDelRow,
  tableHasContent,
  tableSetCell,
  toPlainText,
} from './notas.blocks';

const b = (id: string, type: Block['type'], text = ''): Block => ({ id, type, text });
const newTable = (): Block => ({ id: 'tbl', type: 'table', text: '', rows: emptyRows(2, 2) });

describe('bloques nuevos: lectura y guardado', () => {
  it('una tabla se normaliza a un rectángulo, se limpia y se acota', () => {
    const out = parseBlocks([{ id: 't', type: 'table', rows: [['<b>a</b>', 'b<script>x</script>'], ['c']] }])[0];
    expect(out.rows).toEqual([['<b>a</b>', 'bx'], ['c', '']]);
    const big = parseBlocks([{ id: 'g', type: 'table', rows: Array.from({ length: 50 }, () => Array(20).fill('x')) }])[0];
    expect(big.rows).toHaveLength(30);
    expect(big.rows![0]).toHaveLength(8);
    expect(parseBlocks([{ id: 'v', type: 'table', rows: 'mal' }])[0].rows).toEqual(emptyRows(2, 2));
  });

  it('una llamada trae su emoji (o el de por defecto) y una subpágina sin ref pasa a párrafo', () => {
    const out = parseBlocks([
      { id: 'c', type: 'callout', text: 'hola', icon: '🔥' },
      { id: 'd', type: 'callout', text: 'x', icon: 7 },
      { id: 'p', type: 'page' },
      { id: 'q', type: 'page', ref: 'abc' },
    ]);
    expect(out[0].icon).toBe('🔥');
    expect(out[1].icon).toBe('💡');
    expect(out[2].type).toBe('p');
    expect(out[3]).toMatchObject({ type: 'page', ref: 'abc', text: '' });
  });

  it('el código es texto plano escapado y estable al releerlo', () => {
    const saved = parseBlocks([{ id: 'k', type: 'code', text: '<b>if (a &lt; b) {}</b>' }])[0];
    expect(parseBlocks([saved])[0].text).toBe(saved.text);
    expect(plain(saved.text)).toBe('if (a < b) {}');
    expect(codeText('a < b\r\nc')).toBe('a &lt; b\nc');
  });

  it('serializeBlocks no deja campos de más', () => {
    const dirty = { id: 'i', type: 'toc', text: 'x', rows: [['a']], icon: 'y' } as Block;
    expect(serializeBlocks([dirty])).toEqual([{ id: 'i', type: 'toc', text: '' }]);
  });
});

describe('cambiar de tipo con bloques nuevos', () => {
  it('a código el texto pasa a plano; de código a otro tipo se conserva', () => {
    const toCode = setType([b('1', 'p', '<b>hola</b>')], 0, 'code');
    expect(toCode[0].text).toBe('hola');
    expect(setType(toCode, 0, 'quote')[0].text).toBe('hola');
  });

  it('a llamada trae su emoji y a tabla sus filas; los bloques sin texto lo pierden', () => {
    expect(setType([b('1', 'p', 'x')], 0, 'callout')[0].icon).toBe('💡');
    expect(setType([b('1', 'p', 'x')], 0, 'table')[0].rows).toHaveLength(3);
    expect(setType([b('1', 'p', 'x')], 0, 'toc')[0].text).toBe('');
  });
});

describe('tablas', () => {
  const t = [
    ['a', 'b'],
    ['c', 'd'],
  ];

  it('edita celdas sin tocar el resto', () => {
    expect(tableSetCell(t, 1, 0, 'X')).toEqual([['a', 'b'], ['X', 'd']]);
    expect(t[1][0]).toBe('c');
  });

  it('agrega y quita filas y columnas dentro de los límites', () => {
    expect(tableAddRow(t, 1)).toEqual([['a', 'b'], ['', ''], ['c', 'd']]);
    expect(tableAddRow(t, 99)[2]).toEqual(['', '']);
    expect(tableAddCol(t, 1)).toEqual([['a', '', 'b'], ['c', '', 'd']]);
    expect(tableDelRow(t, 0)).toEqual([['c', 'd']]);
    expect(tableDelCol(t, 1)).toEqual([['a'], ['c']]);
    expect(tableDelRow([['x']], 0)).toEqual([['x']]);
    expect(tableDelCol([['x']], 0)).toEqual([['x']]);
    expect(tableAddCol([Array(8).fill('')], 0)[0]).toHaveLength(8);
    expect(tableAddRow(Array.from({ length: 30 }, () => ['']), 0)).toHaveLength(30);
  });

  it('sabe si tiene contenido', () => {
    expect(tableHasContent(emptyRows(2, 2))).toBe(false);
    expect(tableHasContent([['', '<b>x</b>']])).toBe(true);
  });
});

describe('índice y búsqueda', () => {
  it('headings lista h1 y h2 con texto, en orden', () => {
    const list = [b('1', 'h1', 'Uno'), b('2', 'p', 'texto'), b('3', 'h2', '<b>Dos</b>'), b('4', 'h2', ''), b('5', 'h1', 'Tres')];
    expect(headings(list)).toEqual([
      { id: '1', level: 1, text: 'Uno' },
      { id: '3', level: 2, text: 'Dos' },
      { id: '5', level: 1, text: 'Tres' },
    ]);
  });

  it('searchText incluye título y el texto de las celdas', () => {
    const tbl: Block = { id: 't', type: 'table', text: '', rows: [['Nombre', 'Edad'], ['<b>Ana</b>', '30']] };
    expect(searchText('Mi Nota', [tbl])).toContain('ana');
    expect(searchText('Mi Nota', [tbl])).toContain('mi nota');
  });
});

describe('Enter y Retroceso con bloques nuevos', () => {
  it('una llamada se parte en un párrafo y conserva su emoji', () => {
    const list: Block[] = [{ id: '1', type: 'callout', text: 'hola', icon: '🔥' }];
    const e = splitWith(list, 0, 'ho', 'la')!;
    expect(e.blocks[0]).toMatchObject({ type: 'callout', icon: '🔥', text: 'ho' });
    expect(e.blocks[1].type).toBe('p');
  });

  it('una tabla no se parte ni se une', () => {
    expect(splitWith([newTable()], 0, '', '')).toBeNull();
    expect(backspaceAtStart([newTable()], 0)).toBeNull();
  });

  it('Retroceso en un párrafo vacío tras una tabla quita solo el párrafo; con texto no hace nada', () => {
    const tbl = newTable();
    const e = backspaceAtStart([tbl, b('2', 'p', '')], 1)!;
    expect(e.blocks).toEqual([tbl]);
    expect(e.caret).toEqual({ index: 0, pos: 0 });
    expect(backspaceAtStart([tbl, b('2', 'p', 'x')], 1)).toBeNull();
  });
});

describe('copiar con bloques nuevos', () => {
  it('toPlainText escribe tablas, llamadas, código, índice y subpáginas', () => {
    const list: Block[] = [
      { id: 'a', type: 'h1', text: 'Uno' },
      { id: 'b', type: 'callout', text: 'ojo', icon: '🔥' },
      { id: 'c', type: 'code', text: 'a &lt; b' },
      { id: 'd', type: 'table', text: '', rows: [['H1', 'H2'], ['<b>x</b>', 'y|z']] },
      { id: 'e', type: 'page', text: '', ref: 'r1' },
      { id: 'f', type: 'toc', text: '' },
    ];
    const lines = toPlainText('T', list, (id) => 'Sub ' + id).split('\n');
    expect(lines).toEqual(['T', '# Uno', '> 🔥 ojo', '```', 'a < b', '```', '| H1 | H2 |', '| --- | --- |', '| **x** | y\\|z |', '[Sub r1]', '- Uno']);
  });

  it('sameContent distingue el ícono de la nota', () => {
    const x = { title: 'a', blocks: [b('1', 'p', 'x')] };
    expect(sameContent(x, { ...x, icon: '' })).toBe(true);
    expect(sameContent(x, { ...x, icon: '🔥' })).toBe(false);
  });
});
