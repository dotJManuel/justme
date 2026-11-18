/**
 * Bloques de una nota y las operaciones puras que los editan (sin Angular: se prueban solas).
 *
 * `Block.text` es texto con formato en línea: solo admite las etiquetas <b>, <i>, <s> y <code> (sin atributos), y
 * el resto de caracteres va escapado (&amp; &lt; &gt;). `sanitizeInline` garantiza esa forma venga de donde venga.
 * Las posiciones del cursor (`pos`) cuentan caracteres del texto visible, sin contar etiquetas.
 */

export type BlockType = 'p' | 'h1' | 'h2' | 'ul' | 'ol' | 'todo' | 'quote' | 'hr';

export interface Block {
  id: string;
  type: BlockType;
  /** Texto con formato en línea (ver arriba). */
  text: string;
  /** Solo en las tareas. */
  done?: boolean;
}

/** Dónde queda el cursor después de una operación: bloque (por posición) y carácter visible. */
export interface Caret {
  index: number;
  pos: number;
}

export interface Edit {
  blocks: Block[];
  caret: Caret;
}

export const BLOCK_TYPES: readonly BlockType[] = ['p', 'h1', 'h2', 'ul', 'ol', 'todo', 'quote', 'hr'];
export const MAX_BLOCKS = 2000;
export const MAX_TITLE = 200;

// ── Formato en línea ─────────────────────────────────────────────────────────

export type Mark = 'b' | 'i' | 's' | 'code';

const TAGS: Record<string, Mark> = { b: 'b', strong: 'b', i: 'i', em: 'i', s: 's', strike: 's', del: 's', code: 'code' };

export const escapeHtml = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const ENTITIES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'", '&nbsp;': ' ' };
const decode = (s: string): string => s.replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, (m) => ENTITIES[m]);

/**
 * Deja solo b/i/s/code (sin atributos), bien anidadas y cerradas, con el texto escapado. Es idempotente:
 * `sanitizeInline(sanitizeInline(x)) === sanitizeInline(x)`. Cualquier otra etiqueta se descarta conservando su texto.
 */
export function sanitizeInline(html: string): string {
  const out: string[] = [];
  const stack: Mark[] = [];
  for (const part of html.split(/(<[^>]*>)/)) {
    if (part.startsWith('<') && part.endsWith('>') && part.length > 2) {
      const m = /^<(\/?)\s*([a-zA-Z][a-zA-Z0-9]*)/.exec(part);
      const mark = m ? TAGS[m[2].toLowerCase()] : undefined;
      if (!m || !mark || part.endsWith('/>')) continue;
      if (m[1]) {
        const at = stack.lastIndexOf(mark);
        if (at < 0) continue;
        while (stack.length > at) out.push(`</${stack.pop()}>`);
      } else if (!stack.includes(mark)) {
        stack.push(mark);
        out.push(`<${mark}>`);
      }
    } else if (part) {
      out.push(escapeHtml(decode(part)));
    }
  }
  while (stack.length) out.push(`</${stack.pop()}>`);
  let result = out.join('');
  for (let prev = ''; prev !== result; ) {
    prev = result;
    result = result.replace(/<(b|i|s|code)><\/\1>/g, '');
  }
  return result;
}

/** Texto visible (sin etiquetas, con los caracteres ya sin escapar). */
export const plain = (html: string): string => decode(html.replace(/<[^>]*>/g, ''));

/** Texto con formato a Markdown: **negrita**, *cursiva*, ~~tachado~~ y `código`. */
export function inlineToMarkdown(html: string): string {
  const open = { b: '**', i: '*', s: '~~', code: '`' };
  return decode(html.replace(/<(\/?)(b|i|s|code)>/g, (_m, _c, tag: Mark) => open[tag]).replace(/<[^>]*>/g, ''));
}

// ── Bloques ──────────────────────────────────────────────────────────────────

let counter = 0;
export function newId(): string {
  const c = globalThis.crypto;
  return c?.randomUUID ? c.randomUUID() : `b${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function newBlock(type: BlockType = 'p', text = ''): Block {
  return type === 'todo' ? { id: newId(), type, text, done: false } : { id: newId(), type, text };
}

/** Lo que llega de la base de datos puede venir mal formado: se queda solo con lo válido, y siempre hay un bloque. */
export function parseBlocks(raw: unknown): Block[] {
  const out: Block[] = [];
  if (Array.isArray(raw)) {
    for (const r of raw) {
      if (!r || typeof r !== 'object') continue;
      const o = r as Record<string, unknown>;
      const type = BLOCK_TYPES.includes(o['type'] as BlockType) ? (o['type'] as BlockType) : 'p';
      const text = type === 'hr' || typeof o['text'] !== 'string' ? '' : sanitizeInline(o['text']);
      const id = typeof o['id'] === 'string' && o['id'] && !out.some((b) => b.id === o['id']) ? (o['id'] as string) : newId();
      out.push(type === 'todo' ? { id, type, text, done: o['done'] === true } : { id, type, text });
    }
  }
  return out.length ? out : [newBlock()];
}

/** Forma que se guarda (sin campos de más). */
export function serializeBlocks(blocks: Block[]): Block[] {
  return blocks.map((b) => (b.type === 'todo' ? { id: b.id, type: b.type, text: sanitizeInline(b.text), done: !!b.done } : { id: b.id, type: b.type, text: b.type === 'hr' ? '' : sanitizeInline(b.text) }));
}

export const isList = (t: BlockType) => t === 'ul' || t === 'ol' || t === 'todo';

/** Atajos tipo Markdown: «# », «## », «- », «* », «1. », «[] », «> » al inicio de un párrafo. */
const SHORTCUTS: [RegExp, BlockType][] = [
  [/^## /, 'h2'],
  [/^# /, 'h1'],
  [/^[-*] /, 'ul'],
  [/^1\. /, 'ol'],
  [/^\[ ?\] /, 'todo'],
  [/^> /, 'quote'],
];

/**
 * Si lo escrito (texto visible) empieza con un atajo y el cursor está justo después, devuelve el tipo y el texto con
 * formato sin el atajo. El atajo se escribe antes de cualquier formato, así que se quita del inicio del HTML.
 */
export function applyShortcut(html: string, caret: number): { type: BlockType; text: string } | null {
  const visible = plain(html);
  for (const [re, type] of SHORTCUTS) {
    const m = re.exec(visible);
    if (!m || caret !== m[0].length) continue;
    const prefix = escapeHtml(m[0]);
    return html.startsWith(prefix) ? { type, text: html.slice(prefix.length) } : null;
  }
  return null;
}

/** Cambia el tipo de un bloque conservando su texto (un separador no tiene texto). */
export function setType(blocks: Block[], index: number, type: BlockType): Block[] {
  return blocks.map((b, i) => {
    if (i !== index) return b;
    const next: Block = { id: b.id, type, text: type === 'hr' ? '' : b.text };
    if (type === 'todo') next.done = !!b.done;
    return next;
  });
}

/**
 * Enter: el bloque `index` queda con `before` y el resto (`after`) pasa a un bloque nuevo. Una lista vacía se
 * convierte en párrafo en lugar de partirse.
 */
export function splitWith(blocks: Block[], index: number, before: string, after: string): Edit | null {
  const b = blocks[index];
  if (!b || b.type === 'hr' || blocks.length >= MAX_BLOCKS) return null;
  if (isList(b.type) && plain(before + after) === '') {
    return { blocks: setType(blocks, index, 'p'), caret: { index, pos: 0 } };
  }
  const head: Block = { ...b, text: before };
  const tail = newBlock(isList(b.type) ? b.type : 'p', after);
  return { blocks: [...blocks.slice(0, index), head, tail, ...blocks.slice(index + 1)], caret: { index: index + 1, pos: 0 } };
}

/** Retroceso con el cursor al inicio: un bloque especial vuelve a párrafo; un párrafo se une con el anterior. */
export function backspaceAtStart(blocks: Block[], index: number): Edit | null {
  const b = blocks[index];
  if (!b || b.type === 'hr') return null;
  if (b.type !== 'p') return { blocks: setType(blocks, index, 'p'), caret: { index, pos: 0 } };
  if (index === 0) return null;
  const prev = blocks[index - 1];
  if (prev.type === 'hr') {
    return { blocks: [...blocks.slice(0, index - 1), ...blocks.slice(index)], caret: { index: index - 1, pos: 0 } };
  }
  const merged: Block = { ...prev, text: sanitizeInline(prev.text + b.text) };
  return { blocks: [...blocks.slice(0, index - 1), merged, ...blocks.slice(index + 1)], caret: { index: index - 1, pos: plain(prev.text).length } };
}

/**
 * Pegar texto con saltos de línea: `before`/`after` son lo que había antes y después de lo pegado. La primera línea
 * se une con `before` y cada línea siguiente es un bloque; lo que quedaba después va al final del último.
 */
export function pasteLines(blocks: Block[], index: number, before: string, after: string, lines: string[]): Edit | null {
  const b = blocks[index];
  if (!b || b.type === 'hr' || lines.length < 2) return null;
  const type: BlockType = isList(b.type) ? b.type : 'p';
  const middle = lines.slice(1, -1).map((l) => newBlock(type, escapeHtml(l)));
  const last = lines[lines.length - 1];
  const tail = newBlock(type, sanitizeInline(escapeHtml(last) + after));
  const room = MAX_BLOCKS - blocks.length;
  const added = [...middle, tail].slice(0, Math.max(0, room));
  if (!added.length) return null;
  const caretBlock = added[added.length - 1];
  return {
    blocks: [...blocks.slice(0, index), { ...b, text: sanitizeInline(before + escapeHtml(lines[0])) }, ...added, ...blocks.slice(index + 1)],
    caret: { index: index + added.length, pos: caretBlock === tail ? last.length : plain(caretBlock.text).length },
  };
}

/** Sube (-1) o baja (+1) un bloque; null si ya está en la orilla. */
export function moveBlock(blocks: Block[], index: number, dir: -1 | 1): Block[] | null {
  const to = index + dir;
  if (to < 0 || to >= blocks.length || !blocks[index]) return null;
  const copy = [...blocks];
  [copy[index], copy[to]] = [copy[to], copy[index]];
  return copy;
}

/** Quita un separador (los demás bloques se borran con Retroceso). */
export function removeBlock(blocks: Block[], index: number): Block[] {
  const left = blocks.filter((_, i) => i !== index);
  return left.length ? left : [newBlock()];
}

/** Número de una lista numerada: cuántos «ol» seguidos hay hasta este bloque. */
export function listNumber(blocks: Block[], index: number): number {
  let n = 1;
  for (let i = index - 1; i >= 0 && blocks[i].type === 'ol'; i--) n++;
  return n;
}

/** Primeras palabras de la nota para la lista: el texto de los primeros bloques, en una línea y sin formato. */
export function preview(blocks: Block[], max = 140): string {
  let out = '';
  for (const b of blocks) {
    const t = plain(b.text).replace(/\s+/g, ' ').trim();
    if (!t) continue;
    out += (out ? ' · ' : '') + t;
    if (out.length >= max) break;
  }
  return out.length > max ? out.slice(0, max - 1).trimEnd() + '…' : out;
}

/** La nota como texto con marcas de Markdown (para copiarla). */
export function toPlainText(title: string, blocks: Block[]): string {
  const lines = blocks.map((b, i) => {
    const t = inlineToMarkdown(b.text);
    switch (b.type) {
      case 'h1': return `# ${t}`;
      case 'h2': return `## ${t}`;
      case 'ul': return `- ${t}`;
      case 'ol': return `${listNumber(blocks, i)}. ${t}`;
      case 'todo': return `${b.done ? '[x]' : '[ ]'} ${t}`;
      case 'quote': return `> ${t}`;
      case 'hr': return '---';
      default: return t;
    }
  });
  return [title.trim(), ...lines].filter((l, i) => i > 0 || l).join('\n');
}

/** ¿Dos versiones de la nota son iguales? (para no guardar sin cambios). */
export function sameContent(a: { title: string; blocks: Block[] }, b: { title: string; blocks: Block[] }): boolean {
  return a.title === b.title && JSON.stringify(serializeBlocks(a.blocks)) === JSON.stringify(serializeBlocks(b.blocks));
}
