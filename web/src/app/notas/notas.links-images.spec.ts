import { describe, expect, it } from 'vitest';
import { Block, inlineToMarkdown, parseBlocks, plain, preview, safeUrl, sanitizeInline, serializeBlocks, setType, toPlainText } from './notas.blocks';
import { fitSize } from './notas.images';

describe('enlaces en el texto', () => {
  it('conserva un enlace con dirección segura y le quita lo demás', () => {
    expect(sanitizeInline('<a href="https://ejemplo.com/a?x=1&amp;y=2" onclick="x()" style="color:red" target="_blank">hola</a>')).toBe(
      '<a href="https://ejemplo.com/a?x=1&amp;y=2">hola</a>',
    );
    expect(sanitizeInline("<a href='mailto:a@b.com'>correo</a>")).toBe('<a href="mailto:a@b.com">correo</a>');
  });

  it('descarta direcciones peligrosas o raras y deja solo el texto', () => {
    for (const bad of ['javascript:alert(1)', 'data:text/html;base64,AAA', 'ftp://x.com', '//evil.com', 'https://a b.com']) {
      expect(sanitizeInline(`<a href="${bad}">texto</a>`)).toBe('texto');
    }
    // Lo que sigue a las comillas es otro atributo (como lo lee el navegador): no pasa a la salida.
    const smuggled = sanitizeInline('<a href="https://x.com/"onmouseover="alert(1)">texto</a>');
    expect(smuggled).toBe('<a href="https://x.com/">texto</a>');
    expect(smuggled).not.toContain('onmouseover');
    expect(sanitizeInline('<a>sin dirección</a>')).toBe('sin dirección');
  });

  it('no anida enlaces, mezcla bien con el formato y es idempotente', () => {
    const html = '<a href="https://a.com">uno <b>dos</b> <a href="https://b.com">tres</a></a>';
    const once = sanitizeInline(html);
    expect(once).toBe('<a href="https://a.com">uno <b>dos</b> tres</a>');
    expect(sanitizeInline(once)).toBe(once);
    const amp = sanitizeInline('<a href="https://a.com/?q=1&amp;r=2">x</a>');
    expect(sanitizeInline(amp)).toBe(amp);
  });

  it('un enlace vacío desaparece y plain() solo ve el texto', () => {
    expect(sanitizeInline('a<a href="https://a.com"></a>b')).toBe('ab');
    expect(plain('ver <a href="https://a.com">aquí</a>')).toBe('ver aquí');
  });

  it('safeUrl acepta http, https y mailto', () => {
    expect(safeUrl(' https://a.com/x ')).toBe('https://a.com/x');
    expect(safeUrl('MAILTO:a@b.com')).toBe('MAILTO:a@b.com');
    expect(safeUrl('javascript:1')).toBeNull();
    expect(safeUrl('')).toBeNull();
  });

  it('se copia como Markdown y la vista previa no muestra la dirección', () => {
    expect(inlineToMarkdown('ver <a href="https://a.com/?q=1&amp;r=2"><b>aquí</b></a>')).toBe('ver [**aquí**](https://a.com/?q=1&r=2)');
    const list: Block[] = [{ id: '1', type: 'p', text: 'ver <a href="https://a.com">aquí</a>' }];
    expect(preview(list)).toBe('ver aquí');
  });

  it('los enlaces dentro de las celdas de una tabla también se limpian', () => {
    const t = parseBlocks([{ id: 't', type: 'table', rows: [['<a href="javascript:1">x</a>', '<a href="https://a.com">y</a>']] }])[0];
    expect(t.rows).toEqual([['x', '<a href="https://a.com">y</a>']]);
  });
});

describe('imágenes', () => {
  it('una imagen subida guarda su ruta y su pie; una externa, su dirección', () => {
    const out = parseBlocks([
      { id: 'a', type: 'image', path: 'uid/nota/foto.webp', text: 'Mi <b>foto</b>', url: 'https://x.com/ignorada.png' },
      { id: 'b', type: 'image', url: 'https://x.com/foto.png' },
    ]);
    expect(out[0]).toEqual({ id: 'a', type: 'image', text: 'Mi <b>foto</b>', path: 'uid/nota/foto.webp' });
    expect(out[1]).toEqual({ id: 'b', type: 'image', text: '', url: 'https://x.com/foto.png' });
  });

  it('sin ruta ni dirección válida, o con una peligrosa, pasa a párrafo', () => {
    const out = parseBlocks([
      { id: 'a', type: 'image' },
      { id: 'b', type: 'image', url: 'javascript:alert(1)' },
      { id: 'c', type: 'image', path: '../otra/persona.png' },
      { id: 'd', type: 'image', path: 'a b/c.png' },
      { id: 'e', type: 'image', url: 'data:image/png;base64,AAAA' },
    ]);
    expect(out.every((b) => b.type === 'p')).toBe(true);
  });

  it('serializeBlocks no deja campos de más y setType a otro tipo quita la imagen', () => {
    const img = parseBlocks([{ id: 'a', type: 'image', path: 'u/n/f.png', text: 'x', rows: [['no']], icon: 'z' }])[0];
    expect(serializeBlocks([img])).toEqual([{ id: 'a', type: 'image', text: 'x', path: 'u/n/f.png' }]);
    const p = setType([img], 0, 'p')[0];
    expect(p).toEqual({ id: 'a', type: 'p', text: '' });
  });

  it('se copia como Markdown con su pie', () => {
    const list: Block[] = [{ id: 'a', type: 'image', text: 'Un <i>gato</i>', url: 'https://x.com/g.png' }, { id: 'b', type: 'image', text: '', path: 'u/n/f.png' }];
    expect(toPlainText('T', list)).toBe('T\n![Un gato](https://x.com/g.png)\n![](imagen)');
  });

  it('fitSize reduce sin deformar y nunca agranda', () => {
    expect(fitSize(4000, 3000)).toEqual({ w: 1600, h: 1200 });
    expect(fitSize(1000, 4000)).toEqual({ w: 400, h: 1600 });
    expect(fitSize(800, 600)).toEqual({ w: 800, h: 600 });
    expect(fitSize(1, 5000)).toEqual({ w: 1, h: 1600 });
  });
});
