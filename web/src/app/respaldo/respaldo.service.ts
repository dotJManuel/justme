import { Injectable, inject, signal } from '@angular/core';
import { todoSheets } from '../finanzas/export-gastos';
import { FinanzasService } from '../finanzas/finanzas.service';
import { buildXlsx, zip } from '../finanzas/xlsx';
import { parseBlocks } from '../notas/notas.blocks';
import { SupabaseService } from '../supabase.service';
import { ExportNote, Row, daysRows, noteMarkdown, planImages, planNoteFiles, readme, toCsv } from './respaldo.build';

const KEY = 'justme.respaldo.ultimo';
const BUCKET = 'note-images';
const PAGE = 1000;

/** Las tablas de la base de datos que se respaldan (y por cuál columna se ordenan, si la tienen). */
const TABLAS: { nombre: string; orden?: string }[] = [
  { nombre: 'settings' },
  { nombre: 'habits', orden: 'position' },
  { nombre: 'mission_groups', orden: 'position' },
  { nombre: 'days', orden: 'date' },
  { nombre: 'badges', orden: 'position' },
  { nombre: 'links', orden: 'position' },
  { nombre: 'fin_settings' },
  { nombre: 'fin_cards', orden: 'id' },
  { nombre: 'fin_concepts', orden: 'id' },
  { nombre: 'fin_people', orden: 'id' },
  { nombre: 'fin_expenses', orden: 'id' },
  { nombre: 'fin_cuts', orden: 'id' },
  { nombre: 'fin_debts', orden: 'id' },
  { nombre: 'fin_family', orden: 'id' },
  { nombre: 'fin_audit', orden: 'id' },
  { nombre: 'notes', orden: 'created_at' },
];

export interface Resumen {
  nombre: string;
  bytes: number;
  notas: number;
  imagenes: number;
  imagenesFallidas: number;
  /** Lo que no se pudo leer (el respaldo se entrega igual, con un aviso en el LEEME). */
  omitidas: string[];
}

export type Avance = (texto: string, porcentaje: number) => void;

const dos = (n: number) => String(n).padStart(2, '0');
const fecha = (d: Date) => `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;

/**
 * Respaldo completo: lee de Supabase todo lo tuyo y lo empaqueta en un ZIP con formatos abiertos (JSON, CSV, Excel y Markdown)
 * que se pueden abrir sin la app. No modifica nada.
 */
@Injectable({ providedIn: 'root' })
export class RespaldoService {
  private readonly client = inject(SupabaseService).client;
  private readonly fin = inject(FinanzasService);

  /** Cuándo se descargó el último respaldo desde este dispositivo (ms desde 1970), o null. */
  readonly ultimo = signal<number | null>(leer());

  /** Arma el respaldo. `avance` informa qué se está haciendo y cuánto falta. */
  async crear(avance: Avance): Promise<{ blob: Blob; resumen: Resumen }> {
    const ahora = new Date();
    const omitidas: string[] = [];

    // 1) Las tablas
    const tablas: Record<string, Row[]> = {};
    for (let i = 0; i < TABLAS.length; i++) {
      const t = TABLAS[i];
      avance(`Leyendo tus datos… (${i + 1} de ${TABLAS.length})`, 2 + (i / TABLAS.length) * 40);
      try {
        tablas[t.nombre] = await this.leerTabla(t.nombre, t.orden);
      } catch {
        tablas[t.nombre] = [];
        omitidas.push(t.nombre);
      }
    }

    // 2) Las finanzas en Excel (con las mismas hojas que «Exportar finanzas a Excel»)
    avance('Armando el Excel de finanzas…', 44);
    const archivos: { name: string; data: Uint8Array }[] = [];
    const enc = new TextEncoder();
    const texto = (name: string, contenido: string) => archivos.push({ name, data: enc.encode(contenido) });
    try {
      await this.fin.load();
      archivos.push({ name: 'finanzas.xlsx', data: buildXlsx(todoSheets(this.fin)) });
    } catch {
      omitidas.push('finanzas.xlsx');
    }

    // 3) Rutina y enlaces en CSV
    const grupos = new Map(tablas['mission_groups'].map((g) => [String(g['id']), String(g['name'])]));
    const misiones = new Map(tablas['habits'].map((h) => [String(h['key']), String(h['name'])]));
    texto(
      'rutina/misiones.csv',
      toCsv(
        tablas['habits'].map((h) => ({ clave: h['key'], nombre: h['name'], horario: h['when_text'], grupo: grupos.get(String(h['group_id'])) ?? '', activa: h['active'], orden: h['position'] })),
        ['clave', 'nombre', 'horario', 'grupo', 'activa', 'orden'].map((k) => ({ key: k, label: k })),
      ),
    );
    texto('rutina/dias.csv', toCsv(daysRows(tablas['days'], misiones), ['fecha', 'clave', 'mision', 'hora'].map((k) => ({ key: k, label: k }))));
    texto(
      'rutina/insignias.csv',
      toCsv(
        tablas['badges'].map((b) => ({ nombre: b['name'], tipo: b['kind'], mision: b['habit_key'], meta: b['targets'] ?? b['target'], activa: b['active'], orden: b['position'] })),
        ['nombre', 'tipo', 'mision', 'meta', 'activa', 'orden'].map((k) => ({ key: k, label: k })),
      ),
    );
    texto(
      'enlaces.csv',
      toCsv(tablas['links'].map((l) => ({ titulo: l['title'], url: l['url'], nota: l['note'] })), ['titulo', 'url', 'nota'].map((k) => ({ key: k, label: k }))),
    );

    // 4) Notas en Markdown y sus imágenes
    const notas: ExportNote[] = tablas['notes'].map((r) => ({
      id: String(r['id']),
      title: String(r['title'] ?? ''),
      icon: String(r['icon'] ?? ''),
      parentId: (r['parent_id'] as string | null) ?? null,
      sortOrder: Number(r['sort_order'] ?? 0),
      createdAt: String(r['created_at'] ?? ''),
      blocks: parseBlocks(r['content']),
    }));
    const rutas = planNoteFiles(notas);
    const titulos = new Map(notas.map((n) => [n.id, n.title.trim()]));
    const imagenes = planImages(notas);
    const guardadas = new Map<string, string>();
    let fallidas = 0;
    await this.descargarImagenes(imagenes, async (img, bytes) => {
      if (bytes) {
        guardadas.set(img.path, img.file);
        archivos.push({ name: img.file, data: bytes });
      } else {
        fallidas++;
      }
    }, (hechas) => avance(`Descargando imágenes… (${hechas} de ${imagenes.length})`, 48 + (imagenes.length ? (hechas / imagenes.length) * 42 : 42)));
    for (const n of notas) texto(rutas.get(n.id) ?? `notas/${n.id}.md`, noteMarkdown(n, rutas, titulos, guardadas));

    // 5) La copia fiel y el LEEME
    avance('Empaquetando…', 93);
    const datos = {
      app: 'JustMe',
      version: 1,
      creado: ahora.toISOString(),
      tablas,
      imagenes: imagenes.map((i) => ({ archivo: guardadas.get(i.path) ?? null, rutaOriginal: i.path })),
      omitidas,
    };
    texto('datos.json', JSON.stringify(datos, null, 1));
    texto('LEEME.txt', readme({ creado: ahora, notas: notas.length, imagenes: guardadas.size, imagenesFallidas: fallidas, omitidas }));
    // El LEEME va primero en el ZIP.
    archivos.unshift(archivos.pop() as { name: string; data: Uint8Array });

    const bytes = zip(archivos);
    const nombre = `justme-respaldo-${fecha(ahora)}.zip`;
    const blob = new Blob([bytes as BlobPart], { type: 'application/zip' });
    guardar(ahora.getTime());
    this.ultimo.set(ahora.getTime());
    avance('Listo', 100);
    return { blob, resumen: { nombre, bytes: bytes.length, notas: notas.length, imagenes: guardadas.size, imagenesFallidas: fallidas, omitidas } };
  }

  /** Descarga el ZIP en el dispositivo. */
  descargar(blob: Blob, nombre: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  /** Todas las filas de una tabla (de a 1000), sin el id de usuario ni los datos del bloqueo de edición. */
  private async leerTabla(nombre: string, orden?: string): Promise<Row[]> {
    const filas: Row[] = [];
    for (let desde = 0; ; desde += PAGE) {
      let res = await (orden ? this.client.from(nombre).select('*').order(orden) : this.client.from(nombre).select('*')).range(desde, desde + PAGE - 1);
      // Si la columna de orden no existe, se lee sin orden.
      if (res.error && orden) res = await this.client.from(nombre).select('*').range(desde, desde + PAGE - 1);
      if (res.error) throw res.error;
      const datos = (res.data ?? []) as Row[];
      for (const f of datos) {
        delete f['user_id'];
        if (nombre === 'notes') {
          delete f['lock_holder'];
          delete f['lock_until'];
        }
      }
      filas.push(...datos);
      if (datos.length < PAGE) break;
    }
    return filas;
  }

  /** Baja las imágenes de a pocas a la vez; `alTerminar` recibe los bytes (o null si falló). */
  private async descargarImagenes(
    imagenes: { path: string; file: string }[],
    alTerminar: (img: { path: string; file: string }, bytes: Uint8Array | null) => Promise<void>,
    avance: (hechas: number) => void,
  ) {
    let siguiente = 0;
    let hechas = 0;
    const trabajador = async () => {
      while (siguiente < imagenes.length) {
        const img = imagenes[siguiente++];
        let bytes: Uint8Array | null = null;
        try {
          const { data, error } = await this.client.storage.from(BUCKET).download(img.path);
          if (!error && data) bytes = new Uint8Array(await data.arrayBuffer());
        } catch {
          bytes = null;
        }
        await alTerminar(img, bytes);
        avance(++hechas);
      }
    };
    await Promise.all(Array.from({ length: Math.min(4, imagenes.length) }, trabajador));
  }
}

function leer(): number | null {
  try {
    const v = Number(localStorage.getItem(KEY));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

function guardar(ms: number) {
  try {
    localStorage.setItem(KEY, String(ms));
  } catch {
    /* sin almacenamiento: solo no se recuerda la fecha */
  }
}
