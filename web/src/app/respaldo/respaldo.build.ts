/**
 * Piezas puras del respaldo completo (sin Angular ni red): CSV, carpetas y Markdown de las notas, y el LEEME. El servicio
 * reúne los datos y arma el ZIP con esto.
 */
import { Block, blocksToMarkdown } from '../notas/notas.blocks';

export type Row = Record<string, unknown>;

// ── CSV ──────────────────────────────────────────────────────────────────────

export interface Col {
  key: string;
  label: string;
}

/**
 * CSV que abre bien en Excel y Hojas de cálculo: comas, comillas dobles, saltos de línea CRLF y BOM UTF-8 (para los acentos).
 * Un valor que empieza con «=», «+», «-» o «@» se antecede con un apóstrofo para que ninguna hoja lo ejecute como fórmula.
 */
export function toCsv(rows: Row[], columns: Col[]): string {
  const cell = (v: unknown): string => {
    let s = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
    if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+([.,]\d+)?$/.test(s)) s = `'${s}`;
    return /[",\r\n]/.test(s) || /^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [columns.map((c) => cell(c.label)).join(','), ...rows.map((r) => columns.map((c) => cell(r[c.key])).join(','))];
  return '﻿' + lines.join('\r\n') + '\r\n';
}

// ── Nombres de archivo ───────────────────────────────────────────────────────

/** Un nombre que cualquier sistema acepta (sin \ / : * ? " < > |, sin puntos ni espacios al final), de hasta 80 caracteres. */
export function fileName(raw: string): string {
  const s = raw.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').replace(/^[.\s]+|[.\s]+$/g, '').slice(0, 80).trim();
  return s || 'Sin título';
}

/** Un nombre que aún no esté en `used` (agrega « (2)», « (3)»… sin distinguir mayúsculas) y lo anota. */
export function uniqueName(used: Set<string>, raw: string): string {
  const base = fileName(raw);
  let name = base;
  for (let i = 2; used.has(name.toLowerCase()); i++) name = `${base} (${i})`;
  used.add(name.toLowerCase());
  return name;
}

/** La dirección de `to` vista desde la carpeta del archivo `from` (ambos con «/»), lista para un enlace de Markdown. */
export function relativeLink(from: string, to: string): string {
  const a = from.split('/').slice(0, -1);
  const b = to.split('/');
  let i = 0;
  while (i < a.length && i < b.length - 1 && a[i] === b[i]) i++;
  const rel = [...Array<string>(a.length - i).fill('..'), ...b.slice(i)].join('/');
  return encodeURI(rel).replace(/\(/g, '%28').replace(/\)/g, '%29');
}

// ── Notas ────────────────────────────────────────────────────────────────────

export interface ExportNote {
  id: string;
  title: string;
  icon: string;
  parentId: string | null;
  sortOrder: number;
  createdAt: string;
  blocks: Block[];
}

const bySort = (a: ExportNote, b: ExportNote) => a.sortOrder - b.sortOrder || (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0);

/**
 * El lugar de cada nota en el ZIP, como en Notion: `notas/Título.md` y, si tiene subpáginas, una carpeta `notas/Título/` con
 * las suyas. Los nombres repetidos llevan « (2)». Una nota cuyo padre no existe sube al nivel principal.
 */
export function planNoteFiles(notes: ExportNote[]): Map<string, string> {
  const ids = new Set(notes.map((n) => n.id));
  const byParent = new Map<string | null, ExportNote[]>();
  for (const n of notes) {
    const key = n.parentId && ids.has(n.parentId) ? n.parentId : null;
    const list = byParent.get(key);
    if (list) list.push(n);
    else byParent.set(key, [n]);
  }
  const out = new Map<string, string>();
  const walk = (parent: string | null, dir: string, seen: Set<string>) => {
    const used = new Set<string>();
    for (const n of (byParent.get(parent) ?? []).sort(bySort)) {
      if (seen.has(n.id)) continue; // por si los datos traen un ciclo
      const name = uniqueName(used, n.title);
      out.set(n.id, `${dir}/${name}.md`);
      walk(n.id, `${dir}/${name}`, new Set(seen).add(n.id));
    }
  };
  walk(null, 'notas', new Set());
  return out;
}

export interface ImagePlan {
  /** Ruta en el almacenamiento privado. */
  path: string;
  /** Dónde queda en el ZIP. */
  file: string;
}

/** Las imágenes subidas de las notas y dónde irán en el ZIP (`imagenes/<id de la nota>/<archivo>`). */
export function planImages(notes: ExportNote[]): ImagePlan[] {
  const out: ImagePlan[] = [];
  const used = new Set<string>();
  for (const n of notes) {
    for (const b of n.blocks) {
      if (b.type !== 'image' || !b.path) continue;
      const base = b.path.split('/').pop() || 'imagen';
      let file = `imagenes/${n.id}/${base}`;
      for (let i = 2; used.has(file); i++) file = `imagenes/${n.id}/${i}-${base}`;
      used.add(file);
      out.push({ path: b.path, file });
    }
  }
  return out;
}

/**
 * La nota como archivo Markdown: su título (con su emoji) y sus bloques. Las subpáginas e imágenes son enlaces relativos que
 * funcionan abriendo el ZIP descomprimido; una imagen que no se pudo incluir queda como `imagen-no-incluida`.
 */
export function noteMarkdown(note: ExportNote, files: Map<string, string>, titles: Map<string, string>, images: Map<string, string>): string {
  const here = files.get(note.id) ?? 'notas/x.md';
  const title = `# ${note.icon ? note.icon + ' ' : ''}${note.title.trim() || 'Sin título'}`;
  const body = blocksToMarkdown(
    note.blocks,
    (id) => titles.get(id) || 'Subpágina',
    {
      pageHref: (id) => {
        const to = files.get(id);
        return to ? relativeLink(here, to) : null;
      },
      imageSrc: (b) => {
        if (b.url) return b.url;
        const file = b.path ? images.get(b.path) : undefined;
        return file ? relativeLink(here, file) : 'imagen-no-incluida';
      },
    },
  );
  const text = body.trim(); // sin líneas en blanco de más al final (por ejemplo, de un párrafo vacío)
  return text ? `${title}\n\n${text}\n` : `${title}\n`;
}

// ── Rutina ───────────────────────────────────────────────────────────────────

/** Las misiones marcadas de cada día, una fila por marca (fecha, misión y hora si la hay). */
export function daysRows(days: Row[], missionNames: Map<string, string>): Row[] {
  const out: Row[] = [];
  const sorted = [...days].sort((a, b) => String(a['date']).localeCompare(String(b['date'])));
  for (const d of sorted) {
    const marks = (d['habits'] && typeof d['habits'] === 'object' ? d['habits'] : {}) as Record<string, unknown>;
    for (const [key, v] of Object.entries(marks)) {
      if (!v) continue;
      out.push({ fecha: d['date'], clave: key, mision: missionNames.get(key) ?? key, hora: typeof v === 'string' ? v : '' });
    }
  }
  return out;
}

// ── LEEME ────────────────────────────────────────────────────────────────────

export interface ReadmeInfo {
  creado: Date;
  notas: number;
  imagenes: number;
  imagenesFallidas: number;
  omitidas: string[];
}

export function readme(i: ReadmeInfo): string {
  const fecha = i.creado.toLocaleString('es-MX', { dateStyle: 'long', timeStyle: 'short' });
  const lines = [
    'RESPALDO DE JUSTME',
    `Creado el ${fecha}`,
    '',
    'QUÉ HAY EN ESTA CARPETA',
    '',
    '  datos.json            Todo tu contenido, completo y ordenado (la copia fiel; sirve para restaurar o migrar).',
    '  finanzas.xlsx         Tus finanzas en Excel: gastos por tarjeta, cortes, lo que te deben y dinero con familia.',
    '  rutina/               misiones.csv, dias.csv (cada misión marcada), insignias.csv.',
    '  enlaces.csv           Tus enlaces de Configuración.',
    `  notas/                ${i.notas} doc(s) en Markdown (.md), una por archivo. Las subpáginas van en carpetas, como en Notion.`,
    `  imagenes/             ${i.imagenes} imagen(es) de tus notas; los .md las enlazan con rutas relativas.`,
    '',
    'CÓMO ABRIRLO',
    '',
    '  - Los .csv y el .xlsx se abren con Excel, Hojas de cálculo de Google o LibreOffice.',
    '  - Los .md se abren con cualquier editor de texto, y se importan tal cual en Notion, Obsidian, Joplin, etc.',
    '    Descomprime el ZIP completo antes de abrir las notas, para que las imágenes y subpáginas se vean.',
    '  - datos.json es texto: se abre con cualquier editor y lo entiende cualquier programa.',
    '',
    'RECOMENDACIÓN',
    '',
    '  Guarda este archivo en tu nube (Drive, OneDrive…) y descarga uno nuevo cada mes.',
  ];
  if (i.imagenesFallidas) lines.push('', `AVISO: ${i.imagenesFallidas} imagen(es) no se pudieron descargar; en las notas figuran como «imagen-no-incluida».`);
  if (i.omitidas.length) lines.push('', `AVISO: no se pudo leer: ${i.omitidas.join(', ')}. Vuelve a intentarlo.`);
  return lines.join('\r\n') + '\r\n';
}
