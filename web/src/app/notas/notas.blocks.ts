/**
 * Bloques de una nota y las operaciones puras que los editan (sin Angular: se prueban solas).
 *
 * `Block.text` es texto con formato en línea: solo admite las etiquetas <b>, <i>, <s> y <code> (sin atributos), y
 * el resto de caracteres va escapado (&amp; &lt; &gt;). `sanitizeInline` garantiza esa forma venga de donde venga.
 * Las posiciones del cursor (`pos`) cuentan caracteres del texto visible, sin contar etiquetas.
 *
 * Además de esas etiquetas se admite <a href="..."> (solo http, https o mailto; sin otros atributos).
 *
 * Tipos: p, h1, h2, ul, ol, todo, quote, callout (llamada con emoji), code (texto plano, varias líneas), table
 * (`rows`: celdas con formato en línea), page (enlace a una subpágina, `ref`), image (`path` en el almacenamiento o `url`
 * externa; `text` es el pie de foto), toc (índice de los títulos) y hr.
 */

export type BlockType = 'p' | 'h1' | 'h2' | 'ul' | 'ol' | 'todo' | 'quote' | 'callout' | 'code' | 'table' | 'page' | 'image' | 'toc' | 'hr';

export interface Block {
  id: string;
  type: BlockType;
  /** Texto con formato en línea (ver arriba). En `code`, texto plano escapado. Vacío en table, page, toc y hr. */
  text: string;
  /** Solo en las tareas. */
  done?: boolean;
  /** Solo en las tablas: filas de celdas (texto con formato en línea); la primera fila es el encabezado. */
  rows?: string[][];
  /** Solo en las llamadas: el emoji. */
  icon?: string;
  /** Solo en las subpáginas: id de la nota hija. */
  ref?: string;
  /** Solo en las imágenes subidas: ruta del archivo en el almacenamiento privado. */
  path?: string;
  /** Solo en las imágenes por enlace: dirección web (http o https) de la imagen. */
  url?: string;
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

export const BLOCK_TYPES: readonly BlockType[] = ['p', 'h1', 'h2', 'ul', 'ol', 'todo', 'quote', 'callout', 'code', 'table', 'page', 'image', 'toc', 'hr'];
export const MAX_BLOCKS = 2000;
export const MAX_TITLE = 200;
export const MAX_ROWS = 30;
export const MAX_COLS = 8;
export const MAX_CELL = 2000;
export const DEFAULT_CALLOUT_ICON = '💡';

/**
 * ¿El bloque tiene un texto que se edita en línea y que Enter parte? (Las tablas, subpáginas, imágenes, índices y
 * separadores no; el pie de una imagen tiene su propio campo.)
 */
export const hasText = (t: BlockType): boolean => t !== 'hr' && t !== 'table' && t !== 'page' && t !== 'image' && t !== 'toc';

// ── Formato en línea ─────────────────────────────────────────────────────────

export type Mark = 'b' | 'i' | 's' | 'code';

/** Lo que admite el sanitizador: las marcas de formato y los enlaces. */
type Tag = Mark | 'a';

const TAGS: Record<string, Tag> = { b: 'b', strong: 'b', i: 'i', em: 'i', s: 's', strike: 's', del: 's', code: 'code', a: 'a' };

export const escapeHtml = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeAttr = (s: string): string => escapeHtml(s).replace(/"/g, '&quot;');

const ENTITIES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'", '&nbsp;': ' ' };
const decode = (s: string): string => s.replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, (m) => ENTITIES[m]);

/** Una dirección que se puede abrir desde una nota: http, https o mailto, sin espacios ni comillas. Devuelve la dirección limpia o null. */
export function safeUrl(raw: string): string | null {
  const t = decode(raw).trim();
  return t.length <= 2000 && /^(https?:\/\/|mailto:)[^\s<>"']+$/i.test(t) ? t : null;
}

/**
 * Deja solo b/i/s/code y <a href> (este con una dirección segura y sin otros atributos), bien anidadas y cerradas, con el
 * texto escapado. Es idempotente:
 * `sanitizeInline(sanitizeInline(x)) === sanitizeInline(x)`. Cualquier otra etiqueta se descarta conservando su texto.
 */
export function sanitizeInline(html: string): string {
  const out: string[] = [];
  const stack: Tag[] = [];
  for (const part of html.split(/(<[^>]*>)/)) {
    if (part.startsWith('<') && part.endsWith('>') && part.length > 2) {
      const m = /^<(\/?)\s*([a-zA-Z][a-zA-Z0-9]*)/.exec(part);
      const mark = m ? TAGS[m[2].toLowerCase()] : undefined;
      if (!m || !mark || part.endsWith('/>')) continue;
      if (m[1]) {
        const at = stack.lastIndexOf(mark);
        if (at < 0) continue;
        while (stack.length > at) out.push(`</${stack.pop()}>`);
      } else if (mark === 'a') {
        // Un enlace sin dirección segura (por ejemplo «javascript:») o dentro de otro enlace se descarta: queda su texto.
        const h = /\shref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(part);
        const url = h ? safeUrl(h[1] ?? h[2] ?? h[3] ?? '') : null;
        if (!url || stack.includes('a')) continue;
        stack.push('a');
        out.push(`<a href="${escapeAttr(url)}">`);
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
    result = result.replace(/<(b|i|s|code)><\/\1>/g, '').replace(/<a href="[^"]*"><\/a>/g, '');
  }
  return result;
}

/** Texto visible (sin etiquetas, con los caracteres ya sin escapar). */
export const plain = (html: string): string => decode(html.replace(/<[^>]*>/g, ''));

/** Texto con formato a Markdown: **negrita**, *cursiva*, ~~tachado~~, `código` y [enlaces](dirección). */
export function inlineToMarkdown(html: string): string {
  const open = { b: '**', i: '*', s: '~~', code: '`' };
  const withLinks = html.replace(/<a href="([^"]*)">([\s\S]*?)<\/a>/g, (_m, u: string, t: string) => `[${t}](${decode(u)})`);
  return decode(withLinks.replace(/<(\/?)(b|i|s|code)>/g, (_m, _c, tag: Mark) => open[tag]).replace(/<[^>]*>/g, ''));
}

/** Texto plano (del DOM o de un pegado) a la forma que guarda un bloque de código. */
export const codeText = (raw: string): string => escapeHtml(raw.replace(/\r\n?/g, '\n').slice(0, 20000));

// ── Bloques ──────────────────────────────────────────────────────────────────

let counter = 0;
export function newId(): string {
  const c = globalThis.crypto;
  return c?.randomUUID ? c.randomUUID() : `b${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export const emptyRows = (rows: number, cols: number): string[][] => Array.from({ length: rows }, () => Array<string>(cols).fill(''));

export function newBlock(type: BlockType = 'p', text = ''): Block {
  switch (type) {
    case 'todo':
      return { id: newId(), type, text, done: false };
    case 'callout':
      return { id: newId(), type, text, icon: DEFAULT_CALLOUT_ICON };
    case 'table':
      return { id: newId(), type, text: '', rows: emptyRows(3, 3) };
    default:
      return { id: newId(), type, text: hasText(type) ? text : '' };
  }
}

const iconOk = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 16;

function parseRows(raw: unknown): string[][] {
  let rows: string[][] = [];
  if (Array.isArray(raw)) {
    for (const r of raw.slice(0, MAX_ROWS)) {
      if (Array.isArray(r)) rows.push(r.slice(0, MAX_COLS).map((c) => (typeof c === 'string' ? sanitizeInline(c.slice(0, MAX_CELL)) : '')));
    }
  }
  const cols = Math.max(1, ...rows.map((r) => r.length));
  rows = rows.map((r) => [...r, ...Array<string>(cols - r.length).fill('')]);
  return rows.length ? rows : emptyRows(2, 2);
}

/** Ruta de un archivo del almacenamiento: letras, números y . _ - / (sin «..»), no vacía. */
const validPath = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 200 && /^[\w\-./]+$/.test(v) && !v.includes('..');
/** Dirección de una imagen externa: solo http o https. */
const validImageUrl = (v: unknown): v is string => typeof v === 'string' && /^https?:\/\/[^\s<>"']+$/i.test(v) && v.length <= 2000;

/** Un bloque limpio de un tipo ya validado, a partir de datos sueltos. */
function build(id: string, type: BlockType, o: Record<string, unknown>): Block {
  const t = typeof o['text'] === 'string' ? o['text'] : '';
  switch (type) {
    case 'hr':
    case 'toc':
      return { id, type, text: '' };
    case 'table':
      return { id, type, text: '', rows: parseRows(o['rows']) };
    case 'page':
      return { id, type, text: '', ref: String(o['ref']).slice(0, 64) };
    case 'image': {
      const img: Block = { id, type, text: sanitizeInline(t) };
      if (validPath(o['path'])) img.path = o['path'];
      else if (validImageUrl(o['url'])) img.url = o['url'];
      return img;
    }
    case 'todo':
      return { id, type, text: sanitizeInline(t), done: o['done'] === true };
    case 'code':
      return { id, type, text: escapeHtml(plain(t)) };
    case 'callout':
      return { id, type, text: sanitizeInline(t), icon: iconOk(o['icon']) ? o['icon'] : DEFAULT_CALLOUT_ICON };
    default:
      return { id, type, text: sanitizeInline(t) };
  }
}

/** Lo que llega de la base de datos puede venir mal formado: se queda solo con lo válido, y siempre hay un bloque. */
export function parseBlocks(raw: unknown): Block[] {
  const out: Block[] = [];
  if (Array.isArray(raw)) {
    for (const r of raw) {
      if (!r || typeof r !== 'object') continue;
      const o = r as Record<string, unknown>;
      let type = BLOCK_TYPES.includes(o['type'] as BlockType) ? (o['type'] as BlockType) : 'p';
      if (type === 'page' && (typeof o['ref'] !== 'string' || !o['ref'])) type = 'p';
      if (type === 'image' && !validPath(o['path']) && !validImageUrl(o['url'])) type = 'p';
      const id = typeof o['id'] === 'string' && o['id'] && !out.some((b) => b.id === o['id']) ? (o['id'] as string) : newId();
      out.push(build(id, type, o));
    }
  }
  return out.length ? out : [newBlock()];
}

/** Forma que se guarda (sin campos de más). */
export function serializeBlocks(blocks: Block[]): Block[] {
  return blocks.map((b) => build(b.id, b.type, b as unknown as Record<string, unknown>));
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

/** Cambia el tipo de un bloque conservando su texto (los bloques sin texto lo pierden; el código pasa a texto plano). */
export function setType(blocks: Block[], index: number, type: BlockType): Block[] {
  return blocks.map((b, i) => {
    if (i !== index) return b;
    const base = hasText(b.type) ? b.text : '';
    const text = !hasText(type) ? '' : type === 'code' ? escapeHtml(plain(base)) : base;
    const next: Block = { id: b.id, type, text };
    if (type === 'todo') next.done = !!b.done;
    if (type === 'callout') next.icon = b.icon ?? DEFAULT_CALLOUT_ICON;
    if (type === 'table') next.rows = b.rows ?? emptyRows(3, 3);
    return next;
  });
}

/**
 * Enter: el bloque `index` queda con `before` y el resto (`after`) pasa a un bloque nuevo. Una lista vacía se
 * convierte en párrafo en lugar de partirse.
 */
export function splitWith(blocks: Block[], index: number, before: string, after: string): Edit | null {
  const b = blocks[index];
  if (!b || !hasText(b.type) || blocks.length >= MAX_BLOCKS) return null;
  if (isList(b.type) && plain(before + after) === '') {
    return { blocks: setType(blocks, index, 'p'), caret: { index, pos: 0 } };
  }
  const head: Block = { ...b, text: before };
  const tail = newBlock(isList(b.type) ? b.type : 'p', after);
  return { blocks: [...blocks.slice(0, index), head, tail, ...blocks.slice(index + 1)], caret: { index: index + 1, pos: 0 } };
}

/**
 * Retroceso con el cursor al inicio: un bloque especial vuelve a párrafo; un párrafo se une con el anterior, borra un
 * separador anterior o, estando vacío tras una tabla, subpágina o índice, se quita sin tocar a ese bloque.
 */
export function backspaceAtStart(blocks: Block[], index: number): Edit | null {
  const b = blocks[index];
  if (!b || !hasText(b.type)) return null;
  if (b.type !== 'p') return { blocks: setType(blocks, index, 'p'), caret: { index, pos: 0 } };
  if (index === 0) return null;
  const prev = blocks[index - 1];
  if (prev.type === 'hr') {
    return { blocks: [...blocks.slice(0, index - 1), ...blocks.slice(index)], caret: { index: index - 1, pos: 0 } };
  }
  if (!hasText(prev.type)) {
    // Tabla, subpágina o índice: no se borran con Retroceso; solo se quita el párrafo vacío que les sigue.
    return plain(b.text) === '' ? { blocks: [...blocks.slice(0, index), ...blocks.slice(index + 1)], caret: { index: index - 1, pos: 0 } } : null;
  }
  const merged: Block = { ...prev, text: prev.type === 'code' ? prev.text + escapeHtml(plain(b.text)) : sanitizeInline(prev.text + b.text) };
  return { blocks: [...blocks.slice(0, index - 1), merged, ...blocks.slice(index + 1)], caret: { index: index - 1, pos: plain(prev.text).length } };
}

/**
 * Pegar texto con saltos de línea: `before`/`after` son lo que había antes y después de lo pegado. La primera línea
 * se une con `before` y cada línea siguiente es un bloque; lo que quedaba después va al final del último.
 */
export function pasteLines(blocks: Block[], index: number, before: string, after: string, lines: string[]): Edit | null {
  const b = blocks[index];
  if (!b || !hasText(b.type) || lines.length < 2) return null;
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

/** Quita un bloque (queda siempre al menos uno). */
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

// ── Tablas ───────────────────────────────────────────────────────────────────

export function tableSetCell(rows: string[][], r: number, c: number, html: string): string[][] {
  return rows.map((row, i) => (i === r ? row.map((cell, j) => (j === c ? html : cell)) : row));
}

/** Inserta una fila vacía antes de `at` (`rows.length` = al final). */
export function tableAddRow(rows: string[][], at: number): string[][] {
  if (rows.length >= MAX_ROWS) return rows;
  const cols = rows[0]?.length ?? 1;
  const i = Math.min(Math.max(at, 0), rows.length);
  return [...rows.slice(0, i), Array<string>(cols).fill(''), ...rows.slice(i)];
}

/** Inserta una columna vacía antes de `at`. */
export function tableAddCol(rows: string[][], at: number): string[][] {
  if ((rows[0]?.length ?? 0) >= MAX_COLS) return rows;
  return rows.map((row) => {
    const i = Math.min(Math.max(at, 0), row.length);
    return [...row.slice(0, i), '', ...row.slice(i)];
  });
}

export function tableDelRow(rows: string[][], r: number): string[][] {
  return rows.length <= 1 ? rows : rows.filter((_, i) => i !== r);
}

export function tableDelCol(rows: string[][], c: number): string[][] {
  return (rows[0]?.length ?? 0) <= 1 ? rows : rows.map((row) => row.filter((_, j) => j !== c));
}

export const tableHasContent = (rows: string[][]): boolean => rows.some((r) => r.some((c) => plain(c).trim() !== ''));

// ── Índice ───────────────────────────────────────────────────────────────────

export interface Heading {
  id: string;
  level: 1 | 2;
  text: string;
}

/** Los títulos con texto, en orden (lo que muestra un bloque «Índice»). */
export function headings(blocks: Block[]): Heading[] {
  const out: Heading[] = [];
  for (const b of blocks) {
    if (b.type !== 'h1' && b.type !== 'h2') continue;
    const text = plain(b.text).trim();
    if (text) out.push({ id: b.id, level: b.type === 'h1' ? 1 : 2, text });
  }
  return out;
}

// ── Texto de la nota ─────────────────────────────────────────────────────────

/** El texto visible de un bloque (en una tabla, el de todas sus celdas). */
function blockText(b: Block): string {
  if (b.type === 'table') return (b.rows ?? []).flat().map(plain).join(' ');
  if (b.type === 'image') return plain(b.text);
  return hasText(b.type) ? plain(b.text) : '';
}

/** Primeras palabras de la nota para la lista: el texto de los primeros bloques, en una línea y sin formato. */
export function preview(blocks: Block[], max = 140): string {
  let out = '';
  for (const b of blocks) {
    const t = blockText(b).replace(/\s+/g, ' ').trim();
    if (!t) continue;
    out += (out ? ' · ' : '') + t;
    if (out.length >= max) break;
  }
  return out.length > max ? out.slice(0, max - 1).trimEnd() + '…' : out;
}

/** Todo el texto de la nota (título y bloques) en minúsculas, para buscar. */
export function searchText(title: string, blocks: Block[]): string {
  return (title + ' ' + blocks.map(blockText).join(' ')).toLowerCase();
}

/** Cómo escribir los bloques que apuntan a algo fuera de ellos (subpáginas e imágenes) y el estilo de las tareas. */
export interface MarkdownOptions {
  /** Dirección (relativa) del archivo de una subpágina; null si no se incluye. */
  pageHref?: (id: string) => string | null;
  /** Dirección (relativa o web) de la imagen de un bloque; null si no se pudo incluir. */
  imageSrc?: (b: Block) => string | null;
  /** Tareas como «- [ ] texto» (GitHub, Obsidian…) en lugar de «[ ] texto». */
  gfm?: boolean;
}

/** Cada bloque como su texto en Markdown (una cadena por bloque). `pageTitle` da el nombre de una subpágina por su id. */
export function blockLines(blocks: Block[], pageTitle: (id: string) => string = () => 'Subpágina', opts: MarkdownOptions = {}): string[] {
  return blocks.map((b, i) => {
    const t = hasText(b.type) ? inlineToMarkdown(b.text) : '';
    switch (b.type) {
      case 'h1': return `# ${t}`;
      case 'h2': return `## ${t}`;
      case 'ul': return `- ${t}`;
      case 'ol': return `${listNumber(blocks, i)}. ${t}`;
      case 'todo': return `${opts.gfm ? '- ' : ''}${b.done ? '[x]' : '[ ]'} ${t}`;
      case 'quote': return `> ${t}`;
      case 'callout': return `> ${b.icon ?? DEFAULT_CALLOUT_ICON} ${t}`;
      case 'code': return '```\n' + plain(b.text) + '\n```';
      case 'page': {
        const title = pageTitle(b.ref ?? '');
        const href = opts.pageHref?.(b.ref ?? '') ?? null;
        return href ? `[${title}](${href})` : `[${title}]`;
      }
      case 'image': {
        const src = opts.imageSrc ? opts.imageSrc(b) : (b.url ?? null);
        return `![${plain(b.text)}](${src ?? 'imagen'})`;
      }
      case 'toc': return headings(blocks).map((h) => `${h.level === 2 ? '  ' : ''}- ${h.text}`).join('\n');
      case 'table': {
        const rows = (b.rows ?? []).map((r) => '| ' + r.map((c) => inlineToMarkdown(c).replace(/\|/g, '\\|')).join(' | ') + ' |');
        if (!rows.length) return '';
        const sep = '| ' + (b.rows?.[0] ?? []).map(() => '---').join(' | ') + ' |';
        return [rows[0], sep, ...rows.slice(1)].join('\n');
      }
      case 'hr': return '---';
      default: return t;
    }
  });
}

/** La nota como texto con marcas de Markdown (para copiarla). */
export function toPlainText(title: string, blocks: Block[], pageTitle: (id: string) => string = () => 'Subpágina', opts: MarkdownOptions = {}): string {
  return [title.trim(), ...blockLines(blocks, pageTitle, opts)].filter((l, i) => i > 0 || l).join('\n');
}

/** Los bloques como un documento Markdown: una línea en blanco entre bloques, salvo entre elementos seguidos de una misma lista. */
export function blocksToMarkdown(blocks: Block[], pageTitle?: (id: string) => string, opts: MarkdownOptions = {}): string {
  const lines = blockLines(blocks, pageTitle, { gfm: true, ...opts });
  let out = '';
  lines.forEach((line, i) => {
    if (i > 0) {
      const prev = blocks[i - 1].type;
      out += isList(prev) && prev === blocks[i].type ? '\n' : '\n\n';
    }
    out += line;
  });
  return out;
}

/** ¿Dos versiones de la nota son iguales? (para no guardar sin cambios). */
export function sameContent(a: { title: string; blocks: Block[]; icon?: string }, b: { title: string; blocks: Block[]; icon?: string }): boolean {
  return a.title === b.title && (a.icon ?? '') === (b.icon ?? '') && JSON.stringify(serializeBlocks(a.blocks)) === JSON.stringify(serializeBlocks(b.blocks));
}
