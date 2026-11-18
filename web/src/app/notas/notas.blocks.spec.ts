import { describe, expect, it } from 'vitest';
import {
  Block,
  applyShortcut,
  backspaceAtStart,
  inlineToMarkdown,
  listNumber,
  moveBlock,
  parseBlocks,
  pasteLines,
  plain,
  preview,
  removeBlock,
  sameContent,
  sanitizeInline,
  serializeBlocks,
  splitWith,
  toPlainText,
} from './notas.blocks';

const b = (id: string, type: Block['type'], text = '', done?: boolean): Block => (type === 'todo' ? { id, type, text, done: !!done } : { id, type, text });

describe('sanitizeInline', () => {
  it('conserva b, i, s y code, y normaliza sus sinónimos', () => {
    expect(sanitizeInline('<b>a</b> <i>b</i> <s>c</s> <code>d</code>')).toBe('<b>a</b> <i>b</i> <s>c</s> <code>d</code>');
    expect(sanitizeInline('<strong>a</strong><em>b</em><strike>c</strike><del>d</del>')).toBe('<b>a</b><i>b</i><s>c</s><s>d</s>');
  });

  it('descarta atributos y etiquetas ajenas pero deja su texto', () => {
    expect(sanitizeInline('<b onclick="x()" style="color:red">a</b>')).toBe('<b>a</b>');
    expect(sanitizeInline('<span style="x">hola</span><br><div>mundo</div>')).toBe('holamundo');
    expect(sanitizeInline('<script>alert(1)</script>')).toBe('alert(1)');
    expect(sanitizeInline('<img src=x onerror=alert(1)>')).toBe('');
  });

  it('escapa lo que no es etiqueta y convierte &nbsp; en espacio', () => {
    expect(sanitizeInline('a &amp; b &lt;c&gt; &nbsp;d')).toBe('a &amp; b &lt;c&gt;  d');
    expect(sanitizeInline('1 < 2')).toBe('1 &lt; 2');
  });

  it('cierra lo abierto, ignora cierres sueltos y quita etiquetas vacías', () => {
    expect(sanitizeInline('<b>a<i>b')).toBe('<b>a<i>b</i></b>');
    expect(sanitizeInline('a</b>b')).toBe('ab');
    expect(sanitizeInline('<b></b>x<i><b></b></i>')).toBe('x');
    expect(sanitizeInline('<b>a<b>b</b></b>')).toBe('<b>ab</b>');
  });

  it('es idempotente', () => {
    for (const s of ['<b>a<i>b</i></b>', 'x &amp; <code>y</code>', '<span>z</span>', '<b>a<i>b']) {
      const once = sanitizeInline(s);
      expect(sanitizeInline(once)).toBe(once);
    }
  });
});

describe('texto visible y Markdown', () => {
  it('plain quita etiquetas y desescapa', () => {
    expect(plain('<b>a</b> &amp; &lt;b&gt;')).toBe('a & <b>');
  });

  it('inlineToMarkdown usa las marcas de Markdown', () => {
    expect(inlineToMarkdown('<b>a</b> <i>b</i> <s>c</s> <code>d &amp; e</code>')).toBe('**a** *b* ~~c~~ `d & e`');
  });
});

describe('parseBlocks', () => {
  it('siempre devuelve al menos un párrafo', () => {
    expect(parseBlocks(null)).toHaveLength(1);
    expect(parseBlocks([])[0].type).toBe('p');
    expect(parseBlocks('hola')[0].text).toBe('');
  });

  it('descarta lo mal formado, repara tipos e ids y limpia el texto', () => {
    const out = parseBlocks([{ id: 'a', type: 'h1', text: '<b>T</b><script>x</script>' }, 5, { id: 'a', type: 'raro', text: 7 }, { type: 'todo', text: 'x', done: true }]);
    expect(out.map((x) => x.type)).toEqual(['h1', 'p', 'todo']);
    expect(out[0].text).toBe('<b>T</b>x');
    expect(new Set(out.map((x) => x.id)).size).toBe(3);
    expect(out[1].text).toBe('');
    expect(out[2].done).toBe(true);
  });

  it('un separador no guarda texto', () => {
    expect(serializeBlocks([{ id: 'h', type: 'hr', text: 'x' }])).toEqual([{ id: 'h', type: 'hr', text: '' }]);
  });
});

describe('applyShortcut', () => {
  it('convierte solo cuando el cursor está justo tras el atajo', () => {
    expect(applyShortcut('# ', 2)).toEqual({ type: 'h1', text: '' });
    expect(applyShortcut('## <b>Hola</b>', 3)).toEqual({ type: 'h2', text: '<b>Hola</b>' });
    expect(applyShortcut('- ', 2)).toEqual({ type: 'ul', text: '' });
    expect(applyShortcut('1. ', 3)).toEqual({ type: 'ol', text: '' });
    expect(applyShortcut('[] ', 3)).toEqual({ type: 'todo', text: '' });
    expect(applyShortcut('&gt; ', 2)).toEqual({ type: 'quote', text: '' });
    expect(applyShortcut('# Hola', 6)).toBeNull();
    expect(applyShortcut('hola', 4)).toBeNull();
  });
});

describe('splitWith', () => {
  it('el bloque se queda con lo de antes y lo de después pasa a un párrafo nuevo', () => {
    const e = splitWith([b('1', 'p', 'hola mundo')], 0, 'hola', ' mundo')!;
    expect(e.blocks.map((x) => x.text)).toEqual(['hola', ' mundo']);
    expect(e.caret).toEqual({ index: 1, pos: 0 });
  });

  it('conserva el formato de cada mitad', () => {
    const e = splitWith([b('1', 'p', '<b>ab</b>')], 0, '<b>a</b>', '<b>b</b>')!;
    expect(e.blocks.map((x) => x.text)).toEqual(['<b>a</b>', '<b>b</b>']);
  });

  it('una lista continúa con el mismo tipo y, vacía, se vuelve párrafo', () => {
    const e = splitWith([b('1', 'ul', 'uno')], 0, 'uno', '')!;
    expect(e.blocks.map((x) => x.type)).toEqual(['ul', 'ul']);
    const v = splitWith([b('1', 'todo', '')], 0, '', '')!;
    expect(v.blocks).toHaveLength(1);
    expect(v.blocks[0].type).toBe('p');
  });

  it('un título no se repite y un separador no se parte', () => {
    expect(splitWith([b('1', 'h1', 'Título')], 0, 'Título', '')!.blocks[1].type).toBe('p');
    expect(splitWith([b('1', 'hr')], 0, '', '')).toBeNull();
  });
});

describe('backspaceAtStart', () => {
  it('un bloque especial vuelve a párrafo conservando el texto', () => {
    const e = backspaceAtStart([b('1', 'h2', 'Hola')], 0)!;
    expect(e.blocks[0]).toMatchObject({ type: 'p', text: 'Hola' });
  });

  it('un párrafo se une con el anterior y el cursor queda en la unión (sin contar etiquetas)', () => {
    const e = backspaceAtStart([b('1', 'p', '<b>hola</b>'), b('2', 'p', ' mundo')], 1)!;
    expect(e.blocks).toHaveLength(1);
    expect(e.blocks[0].text).toBe('<b>hola</b> mundo');
    expect(e.caret).toEqual({ index: 0, pos: 4 });
  });

  it('borra un separador anterior y no hace nada al inicio de la nota', () => {
    const e = backspaceAtStart([b('1', 'hr'), b('2', 'p', 'x')], 1)!;
    expect(e.blocks.map((x) => x.id)).toEqual(['2']);
    expect(backspaceAtStart([b('1', 'p', 'x')], 0)).toBeNull();
  });
});

describe('pasteLines', () => {
  it('reparte las líneas en bloques, escapa lo pegado y deja el resto del texto al final', () => {
    const e = pasteLines([b('1', 'p', 'AB')], 0, 'A', 'B', ['x<', 'y', 'z'])!;
    expect(e.blocks.map((x) => x.text)).toEqual(['Ax&lt;', 'y', 'zB']);
    expect(e.caret).toEqual({ index: 2, pos: 1 });
  });

  it('una sola línea no es cosa suya', () => {
    expect(pasteLines([b('1', 'p', '')], 0, '', '', ['solo'])).toBeNull();
  });
});

describe('mover, quitar y numerar', () => {
  it('moveBlock intercambia y respeta las orillas', () => {
    const list = [b('1', 'p'), b('2', 'p')];
    expect(moveBlock(list, 0, 1)!.map((x) => x.id)).toEqual(['2', '1']);
    expect(moveBlock(list, 0, -1)).toBeNull();
    expect(moveBlock(list, 1, 1)).toBeNull();
  });

  it('removeBlock deja siempre un bloque', () => {
    expect(removeBlock([b('1', 'hr')], 0)).toHaveLength(1);
    expect(removeBlock([b('1', 'p'), b('2', 'p')], 0).map((x) => x.id)).toEqual(['2']);
  });

  it('listNumber cuenta los ol seguidos', () => {
    const list = [b('1', 'ol'), b('2', 'ol'), b('3', 'p'), b('4', 'ol')];
    expect([0, 1, 3].map((i) => listNumber(list, i))).toEqual([1, 2, 1]);
  });
});

describe('texto de la nota', () => {
  it('preview junta los primeros bloques con texto, sin formato, y recorta', () => {
    expect(preview([b('1', 'p', ''), b('2', 'h1', '<b>Hola</b>'), b('3', 'p', 'mundo &amp; más')])).toBe('Hola · mundo & más');
    expect(preview([b('1', 'p', 'a'.repeat(300))], 20)).toHaveLength(20);
  });

  it('toPlainText usa marcas tipo Markdown, también para el formato en línea', () => {
    const text = toPlainText('Mi nota', [b('1', 'h1', 'A'), b('2', 'todo', '<b>hacer</b>', true), b('3', 'ol', 'uno'), b('4', 'ol', '<i>dos</i>'), b('5', 'hr')]);
    expect(text).toBe('Mi nota\n# A\n[x] **hacer**\n1. uno\n2. *dos*\n---');
  });

  it('sameContent ignora campos de más y diferencias que la limpieza iguala', () => {
    expect(sameContent({ title: 'a', blocks: [b('1', 'p', 'x')] }, { title: 'a', blocks: [{ id: '1', type: 'p', text: 'x', done: undefined }] })).toBe(true);
    expect(sameContent({ title: 'a', blocks: [b('1', 'p', '<strong>x</strong>')] }, { title: 'a', blocks: [b('1', 'p', '<b>x</b>')] })).toBe(true);
    expect(sameContent({ title: 'a', blocks: [b('1', 'p', 'x')] }, { title: 'b', blocks: [b('1', 'p', 'x')] })).toBe(false);
  });
});
