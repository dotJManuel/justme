import {
  ApplicationRef,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  Directive,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  model,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { Icon } from '../icons/icon';
import { normalizeUrl } from '../perfil/links.service';
import { BottomSheet } from '../ui/bottom-sheet';
import { Button } from '../ui/button';
import { ConfirmDialog } from '../ui/confirm-dialog';
import { Input } from '../ui/input';
import { ToastService } from '../ui/toast';
import { EmojiPicker } from './emoji-picker';
import {
  Block,
  BlockType,
  Caret,
  Edit,
  Mark,
  applyShortcut,
  backspaceAtStart,
  escapeHtml,
  hasText,
  headings,
  listNumber,
  moveBlock,
  newBlock,
  newId,
  pasteLines,
  plain,
  removeBlock,
  safeUrl,
  sanitizeInline,
  setType,
  splitWith,
  tableAddCol,
  tableAddRow,
  tableDelCol,
  tableDelRow,
  tableHasContent,
  tableSetCell,
} from './notas.blocks';
import { ImageError, prepareImage } from './notas.images';
import { Sortable } from './notas.sortable';
import { NotasService } from './notas.service';

/**
 * Pinta el HTML (ya limpio) de un bloque dentro de un elemento editable. Mientras se escribe, el DOM manda y el
 * modelo lo sigue; solo se reescribe el contenido cuando el modelo cambió por otro lado (atajo, unión, cargar).
 * Así el cursor no salta.
 */
@Directive({ selector: '[appRich]' })
export class Rich {
  readonly appRich = input.required<string>();
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  constructor() {
    effect(() => {
      const html = this.appRich();
      if (sanitizeInline(this.el.innerHTML) !== html) this.el.innerHTML = html;
    });
  }
}

interface MenuItem {
  type: BlockType | 'emoji';
  label: string;
  hint: string;
  glyph: string;
  words: string;
}

const MENU: MenuItem[] = [
  { type: 'p', label: 'Texto', hint: 'Un párrafo normal', glyph: 'T', words: 'texto parrafo' },
  { type: 'h1', label: 'Título 1', hint: 'Encabezado grande', glyph: 'H1', words: 'titulo 1 encabezado h1' },
  { type: 'h2', label: 'Título 2', hint: 'Encabezado mediano', glyph: 'H2', words: 'titulo 2 encabezado h2' },
  { type: 'ul', label: 'Lista con viñetas', hint: 'Una lista simple', glyph: '•', words: 'lista viñetas bullets' },
  { type: 'ol', label: 'Lista numerada', hint: 'Una lista con números', glyph: '1.', words: 'lista numerada numeros' },
  { type: 'todo', label: 'Tareas', hint: 'Una lista para ir marcando', glyph: '☑', words: 'tareas todo pendientes checklist' },
  { type: 'quote', label: 'Cita', hint: 'Resalta una frase', glyph: '❝', words: 'cita quote' },
  { type: 'callout', label: 'Llamada', hint: 'Una idea destacada con emoji', glyph: '💡', words: 'llamada callout aviso nota destacada' },
  { type: 'table', label: 'Tabla', hint: 'Filas y columnas', glyph: '▦', words: 'tabla table filas columnas celdas' },
  { type: 'code', label: 'Código', hint: 'Texto con letra monoespaciada', glyph: '</>', words: 'codigo code bloque programacion' },
  { type: 'page', label: 'Subpágina', hint: 'Una nota dentro de esta', glyph: '📄', words: 'subpagina pagina nota hija documento' },
  { type: 'image', label: 'Imagen', hint: 'Subir una imagen o pegar un enlace', glyph: '🖼️', words: 'imagen foto fotografia picture' },
  { type: 'toc', label: 'Índice', hint: 'Lista de los títulos de la nota', glyph: '☰', words: 'indice tabla de contenido toc titulos' },
  { type: 'emoji', label: 'Emoji', hint: 'Insertar un emoji', glyph: '😀', words: 'emoji emoticono carita' },
  { type: 'hr', label: 'Separador', hint: 'Una línea divisoria', glyph: '—', words: 'separador linea divisor' },
];

interface FormatBar {
  x: number;
  y: number;
  on: Record<Mark, boolean>;
  /** Dirección del enlace que contiene la selección (null si no hay). */
  link: string | null;
  /** Cursor sin texto seleccionado dentro de un enlace: la barra solo ofrece abrir, editar o quitar el enlace. */
  collapsed: boolean;
}

const FORMATS: { mark: Mark; label: string; glyph: string; key: string }[] = [
  { mark: 'b', label: 'Negrita', glyph: 'B', key: 'Ctrl+B' },
  { mark: 'i', label: 'Cursiva', glyph: 'I', key: 'Ctrl+I' },
  { mark: 's', label: 'Tachado', glyph: 'S', key: 'Ctrl+Mayús+X' },
  { mark: 'code', label: 'Código', glyph: '</>', key: 'Ctrl+E' },
];

/** Dónde se inserta (o qué ícono cambia) el emoji que se elija. */
interface EmojiTarget {
  mode: 'insert' | 'icon';
  id: string;
  /** "fila,columna" si es una celda de tabla. */
  cell: string | null;
  pos: number;
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** HTML limpio de un fragmento del DOM. */
function fragmentHtml(frag: DocumentFragment): string {
  const d = document.createElement('div');
  d.appendChild(frag);
  return sanitizeInline(d.innerHTML);
}

/** Cuántos caracteres visibles hay desde el inicio de `el` hasta ese punto del DOM. */
function offsetIn(el: HTMLElement, node: Node, offset: number): number {
  const r = document.createRange();
  r.selectNodeContents(el);
  r.setEnd(node, offset);
  return r.toString().length;
}

/** Pone el cursor tras `pos` caracteres visibles de `el`. */
function placeCaret(el: HTMLElement, pos: number) {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let left = pos;
  let node = walker.nextNode();
  const range = document.createRange();
  while (node) {
    const len = node.textContent?.length ?? 0;
    if (left <= len) {
      range.setStart(node, left);
      break;
    }
    left -= len;
    node = walker.nextNode();
  }
  if (!node) {
    range.selectNodeContents(el);
    range.collapse(false);
  } else {
    range.collapse(true);
  }
  const sel = getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
}

const isLinkKey = (e: KeyboardEvent): boolean => (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k';

const markOf = (e: KeyboardEvent): Mark | null => {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return null;
  const key = e.key.toLowerCase();
  return key === 'b' ? 'b' : key === 'i' ? 'i' : key === 'e' ? 'code' : key === 'x' && e.shiftKey ? 's' : null;
};

/**
 * Editor de bloques con formato en línea. Cada bloque es una línea editable. «/» al inicio de un bloque vacío abre el
 * menú de tipos (texto, títulos, listas, tareas, cita, llamada, tabla, código, subpágina, índice, emoji); «# », «- »,
 * «1. », «[] » y «> » funcionan como en Markdown; Enter parte el bloque, Retroceso al inicio lo une con el anterior y
 * Alt + ↑/↓ lo mueve. Al seleccionar texto aparece una barra (o Ctrl+B, Ctrl+I, Ctrl+Mayús+X, Ctrl+E) para negrita,
 * cursiva, tachado, código y emoji. Con `readonly` se puede leer y seleccionar, pero no cambiar nada.
 */
@Component({
  selector: 'app-block-editor',
  imports: [BottomSheet, Button, ConfirmDialog, EmojiPicker, Icon, Input, RouterLink, Rich, Sortable],
  template: `
    <div class="blocks" [appSortable]="blockIds()" (reordered)="onReorder($event)">
    @for (b of blocks(); track b.id; let i = $index) {
      <div class="blk t-{{ b.type }}" [class.rich]="isRich(b)" [class.only]="blocks().length === 1 && !b.text" [attr.data-sort-id]="b.id">
        @switch (b.type) {
          @case ('hr') {
            <hr />
            @if (!readonly()) {
              <button type="button" class="rm" aria-label="Quitar separador" (click)="drop(i)"><app-icon name="x" [size]="14" /></button>
            }
          }
          @case ('toc') {
            <nav class="toc" aria-label="Índice de la nota">
              <span class="toch">Índice</span>
              @for (h of toc(); track h.id) {
                <button type="button" class="toci" [class.l2]="h.level === 2" (click)="goTo(h.id)">{{ h.text }}</button>
              } @empty {
                <span class="none">Agrega títulos a la nota y aparecerán aquí.</span>
              }
            </nav>
            @if (!readonly()) {
              <button type="button" class="rm" aria-label="Quitar índice" (click)="drop(i)"><app-icon name="x" [size]="14" /></button>
            }
          }
          @case ('page') {
            <a class="pg" [routerLink]="['/notas', b.ref]">
              <span class="pgi" aria-hidden="true">{{ pageIcon(b.ref) }}</span>
              <span class="pgt"><b>{{ pageTitle(b.ref) }}</b><span>Subpágina</span></span>
              <app-icon name="chevron-right" [size]="16" />
            </a>
            @if (!readonly()) {
              <button type="button" class="rm" aria-label="Quitar subpágina" (click)="askDrop(i)"><app-icon name="x" [size]="14" /></button>
            }
          }
          @case ('image') {
            <figure class="img">
              @if (imgSrc(b); as src) {
                <a class="imga" [href]="src" target="_blank" rel="noopener noreferrer"><img [src]="src" [alt]="imgAlt(b)" loading="lazy" (error)="onImgError(b)" /></a>
              } @else {
                <div class="imgph" role="img" [attr.aria-label]="imgFailed(b) ? 'No se pudo cargar la imagen' : 'Cargando imagen'">{{ imgFailed(b) ? 'No se pudo cargar la imagen' : 'Cargando imagen…' }}</div>
              }
              <figcaption
                class="rt cap" [class.empty]="!b.text" [appRich]="b.text" [attr.data-id]="b.id" role="textbox" aria-multiline="false"
                [attr.contenteditable]="readonly() ? 'false' : 'true'" [attr.aria-readonly]="readonly()" [attr.data-ph]="readonly() ? '' : 'Agrega una descripción'"
                aria-label="Descripción de la imagen" spellcheck="true"
                (input)="onCaption(i, $event)" (keydown)="onCaptionKey(i, $event)" (paste)="onCellPaste($event)" (drop)="$event.preventDefault()"
              ></figcaption>
            </figure>
            @if (!readonly()) {
              <button type="button" class="rm" aria-label="Quitar imagen" (click)="drop(i)"><app-icon name="x" [size]="14" /></button>
            }
          }
          @case ('table') {
            <div class="tblw" (focusin)="onTableFocus(b.id, $event)" (focusout)="onTableBlur($event)">
              <div class="scroll">
                <table>
                  @for (row of b.rows; track $index; let r = $index) {
                    <tr [class.head]="r === 0">
                      @for (cell of row; track $index; let c = $index) {
                        <td>
                          <div
                            class="rt cell" [appRich]="cell" [attr.data-id]="b.id" [attr.data-cell]="r + ',' + c" role="textbox" aria-multiline="false"
                            [attr.contenteditable]="readonly() ? 'false' : 'true'" [attr.aria-readonly]="readonly()" spellcheck="true"
                            [attr.aria-label]="(r === 0 ? 'Encabezado, columna ' : 'Fila ' + (r + 1) + ', columna ') + (c + 1)"
                            (input)="onCell(i, r, c, $event)" (keydown)="onCellKey(i, r, c, $event)" (paste)="onCellPaste($event)" (drop)="$event.preventDefault()"
                          ></div>
                        </td>
                      }
                    </tr>
                  }
                </table>
              </div>
              @if (!readonly() && tblFocus()?.id === b.id) {
                <div class="tbar" role="toolbar" aria-label="Opciones de la tabla">
                  <button type="button" (mousedown)="$event.preventDefault()" (click)="tableAct(i, 'row+')">+ Fila</button>
                  <button type="button" (mousedown)="$event.preventDefault()" (click)="tableAct(i, 'col+')">+ Columna</button>
                  <button type="button" (mousedown)="$event.preventDefault()" (click)="tableAct(i, 'row-')">− Fila</button>
                  <button type="button" (mousedown)="$event.preventDefault()" (click)="tableAct(i, 'col-')">− Columna</button>
                  <button type="button" class="danger" (mousedown)="$event.preventDefault()" (click)="askDrop(i)">Quitar tabla</button>
                </div>
              }
            </div>
          }
          @default {
            @switch (b.type) {
              @case ('ul') {
                <span class="mark" aria-hidden="true">•</span>
              }
              @case ('ol') {
                <span class="mark num" aria-hidden="true">{{ number(i) }}.</span>
              }
              @case ('todo') {
                <button
                  type="button" class="box" role="checkbox" [class.on]="b.done" [attr.aria-checked]="!!b.done" [disabled]="readonly()"
                  aria-label="Tarea hecha" (click)="toggle(i)"
                >
                  @if (b.done) {
                    <app-icon name="check" [size]="14" [stroke]="2.6" />
                  }
                </button>
              }
              @case ('callout') {
                <button type="button" class="cicon" [disabled]="readonly()" aria-label="Cambiar el emoji de la llamada" (click)="pickIcon(b.id)">{{ b.icon }}</button>
              }
            }
            <div
              class="rt" [class.empty]="!b.text" [class.done]="b.type === 'todo' && b.done" [appRich]="b.text" [attr.data-id]="b.id"
              role="textbox" aria-multiline="false" [attr.contenteditable]="readonly() ? 'false' : 'true'" [attr.aria-readonly]="readonly()"
              [attr.data-ph]="placeholder(b)" [attr.aria-label]="label(b)" spellcheck="true"
              [attr.aria-expanded]="menuFor() === b.id" [attr.aria-controls]="menuFor() === b.id ? 'slash-menu' : null"
              (input)="onInput(i, $event)" (keydown)="onKey(i, $event)" (paste)="onPaste(i, $event)" (drop)="onDrop(i, $event)" (dragover)="$event.preventDefault()"
            ></div>
            @if (menuFor() === b.id && menuItems().length) {
              <ul class="menu" id="slash-menu" role="listbox" aria-label="Tipo de bloque">
                @for (m of menuItems(); track m.type; let k = $index) {
                  <li role="option" [attr.aria-selected]="k === menuIndex()" [class.on]="k === menuIndex()" (mousedown)="$event.preventDefault(); pick(i, m)" (mouseenter)="menuIndex.set(k)">
                    <span class="gl" aria-hidden="true">{{ m.glyph }}</span>
                    <span class="mt"><b>{{ m.label }}</b><span>{{ m.hint }}</span></span>
                  </li>
                }
              </ul>
            }
          }
        }
        @if (!readonly() && blocks().length > 1) {
          <button
            type="button" class="drag" data-sort-handle
            [attr.aria-label]="'Mover ' + label(b) + ': arrastra, o usa las flechas arriba y abajo del teclado'" title="Arrastra para mover este bloque"
          ><app-icon name="grip" [size]="18" [stroke]="2.6" /></button>
        }
      </div>
    }
    </div>
    @if (!readonly()) {
      <button type="button" class="tail" aria-label="Agregar un párrafo al final" (click)="appendParagraph()"></button>
    }
    @if (bar(); as f) {
      <div class="bar" role="toolbar" aria-label="Formato del texto" [style.left.px]="f.x" [style.top.px]="f.y">
        @if (f.collapsed && f.link) {
          <span class="lkt" [attr.title]="f.link">{{ shortUrl(f.link) }}</span>
          <button type="button" class="fb txt" (mousedown)="$event.preventDefault()" (click)="openLink(f.link)">Abrir</button>
          <button type="button" class="fb txt" (mousedown)="$event.preventDefault()" (click)="openLinkDialog()">Editar</button>
          <button type="button" class="fb txt" (mousedown)="$event.preventDefault()" (click)="removeLink()">Quitar</button>
        } @else {
          @for (m of formats; track m.mark) {
            <button
              type="button" class="fb f-{{ m.mark }}" [class.on]="f.on[m.mark]" [attr.aria-pressed]="f.on[m.mark]" [attr.aria-label]="m.label + ' (' + m.key + ')'"
              [attr.title]="m.label + ' (' + m.key + ')'" (mousedown)="$event.preventDefault()" (click)="format(m.mark)"
            >{{ m.glyph }}</button>
          }
          <button
            type="button" class="fb" [class.on]="!!f.link" [attr.aria-pressed]="!!f.link" aria-label="Enlace (Ctrl+K)" title="Enlace (Ctrl+K)"
            (mousedown)="$event.preventDefault()" (click)="openLinkDialog()"
          ><app-icon name="link" [size]="16" /></button>
          <button type="button" class="fb" aria-label="Insertar emoji" title="Insertar emoji" (mousedown)="$event.preventDefault()" (click)="insertEmojiAtSelection()">😀</button>
        }
      </div>
    }

    <ui-bottom-sheet title="Enlace" [(open)]="linkOpen">
      <form class="sheetform" (submit)="$event.preventDefault(); applyLink()" novalidate>
        <ui-input label="Dirección" type="url" inputmode="url" placeholder="ejemplo.com" [(value)]="linkUrl" [error]="linkError()" autocomplete="off" />
        <button uiBtn block type="submit">Aplicar enlace</button>
      </form>
    </ui-bottom-sheet>

    <ui-bottom-sheet title="Agregar imagen" [(open)]="imgOpen">
      <div class="sheetform">
        <label class="filebtn">
          <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" (change)="onFilePicked($event)" />
          <app-icon name="download" [size]="18" /> Subir desde este dispositivo
        </label>
        <p class="or">o pega la dirección de una imagen</p>
        <form class="sheetform" (submit)="$event.preventDefault(); addImageUrl()" novalidate>
          <ui-input label="Enlace de la imagen" type="url" inputmode="url" placeholder="https://…" [(value)]="imgUrl" [error]="imgError()" autocomplete="off" />
          <button uiBtn block variant="secondary" type="submit">Insertar</button>
        </form>
      </div>
    </ui-bottom-sheet>

    <app-emoji-picker [(open)]="emojiOpen" [clearable]="false" (picked)="onEmoji($event)" />
    <ui-confirm-dialog
      [(open)]="dropOpen" [title]="dropTitle()" [message]="dropMessage()" confirmLabel="Eliminar" [busy]="busy()" (confirmed)="confirmDrop()"
    />
  `,
  styles: `
    :host { display: block; }
    .blk { position: relative; display: flex; align-items: flex-start; gap: 8px; }
    .rt {
      display: block; flex: 1 1 0; min-width: 0; min-height: 32px; padding: 3px 2px; border-radius: 4px; outline: none;
      color: var(--tx); font-size: 16px; line-height: 26px; white-space: pre-wrap; overflow-wrap: anywhere; word-break: break-word;
    }
    .rt:read-only, .rt[contenteditable='false'] { cursor: text; }
    .rt.empty::before { content: attr(data-ph); color: var(--tx3); pointer-events: none; }
    .t-p .rt.empty::before { opacity: 0; }
    .t-p .rt.empty:focus::before, .only .rt.empty::before { opacity: 1; }
    /* Las marcas de formato (negrita, enlaces, código…) se insertan en el DOM sin pasar por Angular: sus estilos viven en styles.css (.rt). */
    .t-h1 { margin-top: 18px; }
    .t-h1 .rt { min-height: 42px; font-size: 28px; line-height: 36px; font-weight: 700; letter-spacing: -0.02em; }
    .t-h2 { margin-top: 12px; }
    .t-h2 .rt { min-height: 36px; font-size: 21px; line-height: 30px; font-weight: 650; letter-spacing: -0.01em; }
    .t-quote { padding-left: 14px; box-shadow: inset 3px 0 0 var(--bd2); }
    .t-quote .rt { color: var(--tx2); font-style: italic; }
    .t-callout { align-items: flex-start; gap: 10px; margin: 6px 0; padding: 10px 12px; border-radius: 10px; background: var(--s2); box-shadow: inset 0 0 0 1px var(--bd); }
    .cicon { flex: none; width: 32px; height: 32px; margin-top: 2px; padding: 0; border: 0; border-radius: 8px; background: none; font-size: 22px; line-height: 1; cursor: pointer; }
    .cicon:hover:not(:disabled) { background: var(--s3); }
    .cicon:disabled { cursor: default; }
    .t-code { margin: 4px 0; }
    .t-code .rt {
      padding: 10px 12px; border-radius: 8px; background: var(--s2); box-shadow: inset 0 0 0 1px var(--bd); font-size: 14px; line-height: 22px; tab-size: 2;
      font-family: ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace;
    }
    .mark { flex: none; width: 22px; padding-top: 3px; text-align: center; line-height: 26px; color: var(--tx2); font-weight: 700; }
    .mark.num { font-variant-numeric: tabular-nums; font-weight: 500; text-align: right; width: 24px; }
    .box {
      display: grid; place-items: center; flex: none; width: 20px; height: 20px; margin: 5px 2px 0 1px; padding: 0; border: 1.5px solid var(--bd2);
      border-radius: 5px; background: var(--sf); color: var(--onac); cursor: pointer;
    }
    .box.on { border-color: var(--ac); background: var(--ac); }
    .box:disabled { cursor: default; opacity: 0.7; }
    .rt.done { color: var(--tx3); text-decoration: line-through; }
    hr { flex: 1; margin: 12px 0; border: 0; border-top: 1px solid var(--bd2); }
    /* Asa para mover un bloque. En escritorio vive en el margen izquierdo y aparece al pasar el puntero; en pantallas angostas
       (sin margen) va a la derecha de cada bloque. */
    .blocks { position: relative; }
    .drag {
      position: absolute; left: -28px; top: 4px; display: grid; place-items: center; width: 24px; height: 28px; margin: 0; padding: 0; border: 0; border-radius: 6px;
      background: none; color: var(--tx3); cursor: grab; touch-action: none; -webkit-user-select: none; user-select: none; opacity: 0;
    }
    .blk:hover > .drag, .blk:focus-within > .drag, .drag:focus-visible { opacity: 1; }
    .drag:hover { background: var(--s2); color: var(--tx); }
    .blocks.sorting { -webkit-user-select: none; user-select: none; }
    .blocks.sorting .drag { cursor: grabbing; }
    .blk.dragging { border-radius: var(--rf-2); }
    @media (max-width: 1023.98px) {
      /* Sin margen lateral: el asa va a la derecha, en un espacio reservado. Siempre visible en subpáginas, imágenes, tablas…; en los
         párrafos y títulos aparece al tocarlos (así no hay un asa en cada línea). */
      .blk { padding-right: 28px; }
      .drag { left: auto; right: -2px; width: 30px; top: 2px; height: 32px; }
      .blk.rich > .drag, .blk:focus-within > .drag { opacity: 1; }
    }
    .rm { display: grid; place-items: center; flex: none; width: 28px; height: 28px; margin-top: 5px; border: 0; border-radius: 6px; background: none; color: var(--tx3); cursor: pointer; opacity: 0; }
    .blk:hover .rm, .rm:focus-visible { opacity: 1; }
    .rm:hover { background: var(--s2); color: var(--tx); }
    @media (hover: none) { .rm { opacity: 1; } }
    .tail { display: block; width: 100%; min-height: 96px; padding: 0; border: 0; background: none; cursor: text; }

    /* Tabla */
    .tblw { flex: 1; min-width: 0; margin: 6px 0; }
    .scroll { overflow-x: auto; border-radius: 8px; box-shadow: inset 0 0 0 1px var(--bd2); }
    table { width: 100%; min-width: 100%; border-collapse: collapse; table-layout: fixed; }
    td { min-width: 110px; padding: 0; border: 1px solid var(--bd2); vertical-align: top; }
    tr:first-child td { border-top: 0; }
    tr:last-child td { border-bottom: 0; }
    td:first-child { border-left: 0; }
    td:last-child { border-right: 0; }
    td .rt { min-height: 38px; padding: 6px 10px; border-radius: 0; font-size: 15px; line-height: 24px; }
    td .rt:focus { background: var(--acs); }
    tr.head td { background: var(--s2); }
    tr.head .rt { font-weight: 650; }
    .tbar { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
    .tbar button {
      min-height: 36px; padding: 0 12px; border: 0; border-radius: 8px; background: var(--s2); color: var(--tx); font: inherit; font-size: 13px; font-weight: 600; cursor: pointer;
    }
    .tbar button:hover { background: var(--s3); }
    .tbar .danger { color: var(--rd); }

    /* Subpágina */
    .pg {
      display: flex; align-items: center; gap: 12px; flex: 1; min-width: 0; min-height: 52px; margin: 4px 0; padding: 8px 14px; border-radius: 10px;
      background: var(--sf); color: var(--tx); text-decoration: none; box-shadow: inset 0 0 0 1px var(--bd2);
    }
    .pg:hover { background: var(--s2); }
    .pgi { display: grid; place-items: center; flex: none; width: 34px; height: 34px; border-radius: 8px; background: var(--s2); font-size: 20px; }
    .pgt { display: flex; flex-direction: column; flex: 1; min-width: 0; }
    .pgt b { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 15px; line-height: 20px; font-weight: 600; }
    .pgt span { font-size: 12px; line-height: 16px; color: var(--tx2); }

    /* Índice */
    .toc { display: flex; flex-direction: column; flex: 1; min-width: 0; gap: 2px; margin: 6px 0; padding: 10px 12px; border-radius: 10px; background: var(--s2); box-shadow: inset 0 0 0 1px var(--bd); }
    .toch { font-size: 12px; line-height: 16px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--tx3); }
    .toci { min-height: 32px; padding: 0 6px; border: 0; border-radius: 6px; background: none; color: var(--ac); font: inherit; font-size: 15px; text-align: left; cursor: pointer; }
    .toci.l2 { padding-left: 22px; font-size: 14px; }
    .toci:hover { background: var(--acs); }
    .none { font-size: 14px; color: var(--tx2); }


    /* Imagen */
    .img { flex: 1; min-width: 0; margin: 8px 0; }
    .imga { display: block; }
    .img img { display: block; max-width: 100%; max-height: 520px; margin: 0 auto; border-radius: 10px; background: var(--s2); }
    .imgph { display: grid; place-items: center; min-height: 140px; border-radius: 10px; background: var(--s2); color: var(--tx2); font-size: 14px; }
    .cap { min-height: 28px; padding: 6px 2px 0; font-size: 13px; line-height: 20px; color: var(--tx2); text-align: center; }
    .sheetform { display: flex; flex-direction: column; gap: 14px; }
    .filebtn {
      position: relative; display: flex; align-items: center; justify-content: center; gap: 8px; min-height: var(--touch); padding: 0 18px; border-radius: var(--rf-2);
      background: var(--ac); color: var(--onac); font-size: 15px; font-weight: 600; cursor: pointer;
    }
    .filebtn:hover { background: var(--ach); }
    .filebtn:focus-within { box-shadow: var(--focus); }
    .filebtn input { position: absolute; width: 1px; height: 1px; opacity: 0; overflow: hidden; }
    .or { text-align: center; color: var(--tx2); font-size: 13px; }

    .menu {
      position: absolute; z-index: 20; top: 100%; left: 0; margin: 4px 0 0; padding: 6px; list-style: none; width: min(320px, 100%);
      max-height: 320px; overflow-y: auto; border-radius: var(--rf-3); background: var(--sf); box-shadow: var(--sh2), inset 0 0 0 1px var(--bd);
    }
    .menu li { display: flex; align-items: center; gap: 12px; min-height: var(--touch); padding: 6px 8px; border-radius: 8px; cursor: pointer; }
    .menu li.on { background: var(--acs); }
    .gl { display: grid; place-items: center; flex: none; width: 32px; height: 32px; border-radius: 8px; background: var(--s2); color: var(--tx2); font-size: 14px; font-weight: 700; }
    .mt { display: flex; flex-direction: column; min-width: 0; }
    .mt b { font-size: 14px; line-height: 20px; font-weight: 600; }
    .mt span { font-size: 12px; line-height: 16px; color: var(--tx2); }
    .bar {
      position: fixed; z-index: 30; display: flex; gap: 2px; padding: 4px; border-radius: var(--rf-3); background: var(--sf);
      box-shadow: var(--sh2), inset 0 0 0 1px var(--bd2); transform: translate(-50%, calc(-100% - 8px));
    }
    .fb {
      display: grid; place-items: center; min-width: var(--touch); height: 36px; padding: 0 6px; border: 0; border-radius: 8px; background: none;
      color: var(--tx); font: inherit; font-size: 15px; font-weight: 700; cursor: pointer;
    }
    .fb:hover { background: var(--s2); }
    .fb.on { background: var(--acs); color: var(--ac); }
    .f-i { font-style: italic; font-weight: 600; }
    .f-s { text-decoration: line-through; }
    .f-code { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 13px; }
    .fb.txt { padding: 0 12px; font-size: 13px; font-weight: 600; }
    .lkt { align-self: center; max-width: 170px; padding: 0 8px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; color: var(--tx2); }
  `,
  host: { '(click)': 'onHostClick($event)' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BlockEditor {
  readonly blocks = model.required<Block[]>();
  readonly readonly = input(false);
  /** La nota que se está editando (las subpáginas se crean dentro de ella). */
  readonly noteId = input('');

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly injector = inject(Injector);
  private readonly app = inject(ApplicationRef);
  private readonly notas = inject(NotasService);
  private readonly toasts = inject(ToastService);

  protected readonly formats = FORMATS;
  /** Barra de formato sobre la selección (null si no hay texto seleccionado). */
  protected readonly bar = signal<FormatBar | null>(null);

  /** Bloque que tiene abierto el menú «/», y cuál opción está resaltada. */
  protected readonly menuFor = signal<string | null>(null);
  protected readonly menuIndex = signal(0);
  private readonly menuFilter = signal('');
  protected readonly menuItems = computed(() => {
    const f = norm(this.menuFilter());
    return f ? MENU.filter((m) => norm(m.label + ' ' + m.words).includes(f)) : MENU;
  });

  /** Los ids de los bloques, en orden (para arrastrarlos). */
  protected readonly blockIds = computed(() => this.blocks().map((b) => b.id));

  /** Bloques que no son un párrafo de texto: en el celular son los que muestran el asa de arrastre. */
  protected isRich(b: Block): boolean {
    return b.type !== 'p' && b.type !== 'h1' && b.type !== 'h2' && b.type !== 'ul' && b.type !== 'ol' && b.type !== 'todo' && b.type !== 'quote';
  }

  /** Se soltó un bloque en otro lugar: la lista toma el nuevo orden (los ids que ya no existan se ignoran). */
  protected onReorder(ids: string[]) {
    if (this.readonly()) return;
    const byId = new Map(this.blocks().map((b) => [b.id, b]));
    const next = ids.flatMap((id) => (byId.has(id) ? [byId.get(id) as Block] : []));
    if (next.length === this.blocks().length) this.blocks.set(next);
  }

  /** Los títulos de la nota (los que lista un bloque «Índice»). */
  protected readonly toc = computed(() => headings(this.blocks()));

  /** La celda de tabla donde está el cursor (para mostrar sus opciones). */
  protected readonly tblFocus = signal<{ id: string; r: number; c: number } | null>(null);

  protected readonly emojiOpen = signal(false);
  private emojiTarget: EmojiTarget | null = null;

  // Enlaces
  protected readonly linkOpen = signal(false);
  protected readonly linkUrl = signal('');
  protected readonly linkError = signal('');
  private linkTarget: { el: HTMLElement; range: Range; anchor: HTMLElement | null } | null = null;

  // Imágenes
  protected readonly imgOpen = signal(false);
  protected readonly imgUrl = signal('');
  protected readonly imgError = signal('');
  private imageTarget: string | null = null;
  /** Imágenes cuya dirección ya se renovó una vez (si vuelve a fallar, se muestra el aviso). */
  private readonly imgRetried = new Set<string>();
  private readonly imgFailedIds = signal<Set<string>>(new Set());

  /** Bloque por quitar (una subpágina o una tabla con contenido piden confirmación). */
  protected readonly dropOpen = signal(false);
  private dropIndex = -1;
  protected readonly busy = signal(false);
  protected readonly dropTitle = signal('');
  protected readonly dropMessage = signal('');

  constructor() {
    // Las imágenes subidas son privadas: se piden direcciones temporales para las que aparecen en la nota.
    effect(() => {
      const paths = this.blocks().flatMap((b) => (b.type === 'image' && b.path ? [b.path] : []));
      untracked(() => {
        if (paths.length) void this.notas.ensureImageUrls(paths).catch(() => undefined);
      });
    });

    const update = () => this.updateBar();
    document.addEventListener('selectionchange', update);
    window.addEventListener('scroll', update, { passive: true, capture: true });
    window.addEventListener('resize', update, { passive: true });
    inject(DestroyRef).onDestroy(() => {
      document.removeEventListener('selectionchange', update);
      window.removeEventListener('scroll', update, { capture: true });
      window.removeEventListener('resize', update);
    });
  }

  protected number(i: number) {
    return listNumber(this.blocks(), i);
  }

  protected label(b: Block): string {
    const names: Record<BlockType, string> = {
      p: 'Texto', h1: 'Título 1', h2: 'Título 2', ul: 'Elemento de lista', ol: 'Elemento numerado', todo: 'Tarea', quote: 'Cita',
      callout: 'Llamada', code: 'Código', table: 'Tabla', page: 'Subpágina', image: 'Imagen', toc: 'Índice', hr: 'Separador',
    };
    return names[b.type];
  }

  protected placeholder(b: Block): string {
    if (this.readonly()) return '';
    const hints: Partial<Record<BlockType, string>> = {
      p: 'Escribe algo, o «/» para elegir un bloque', h1: 'Título 1', h2: 'Título 2', ul: 'Elemento', ol: 'Elemento', todo: 'Tarea', quote: 'Cita',
      callout: 'Escribe una nota destacada', code: 'Código',
    };
    return hints[b.type] ?? '';
  }

  protected pageTitle(ref: string | undefined): string {
    const n = this.notas.byId(ref);
    return n ? n.title.trim() || 'Sin título' : this.notas.loaded() ? 'Subpágina no encontrada' : 'Subpágina';
  }

  protected pageIcon(ref: string | undefined): string {
    return this.notas.byId(ref)?.icon || '📄';
  }

  // ── Escritura ──────────────────────────────────────────────────────────────

  /** Lo que hay en el DOM de un bloque de texto, ya en la forma que guarda el modelo (el código, texto plano). */
  private domText(b: Block, el: HTMLElement): string {
    return b.type === 'code' ? escapeHtml(el.textContent ?? '') : sanitizeInline(el.innerHTML);
  }

  protected onInput(i: number, e: Event) {
    if (this.readonly()) return;
    const el = e.currentTarget as HTMLElement;
    const b = this.blocks()[i];
    let html = this.domText(b, el);
    let type = b.type;

    if (b.type === 'p') {
      const caret = this.selectionIn(el);
      const sc = caret ? applyShortcut(html, caret.start) : null;
      if (sc) {
        type = sc.type;
        html = sc.text;
      }
    }
    this.replace(i, (cur) => {
      const next: Block = { ...cur, type, text: html };
      if (type === 'todo') next.done = !!cur.done;
      return next;
    });
    if (type !== b.type) this.focusAt({ index: i, pos: 0 });

    // El menú «/» se abre con una barra al inicio de un párrafo, y se filtra con lo que siga.
    const text = plain(html);
    if (type === 'p' && /^\/[^\s]*$/.test(text)) {
      this.menuFor.set(b.id);
      this.menuFilter.set(text.slice(1));
      this.menuIndex.set(0);
    } else {
      this.closeMenu();
    }
  }

  protected onKey(i: number, e: KeyboardEvent) {
    if (this.readonly() || e.isComposing) return;
    const el = e.currentTarget as HTMLElement;
    const b = this.blocks()[i];

    if (isLinkKey(e)) {
      e.preventDefault();
      this.openLinkDialog();
      return;
    }
    const mark = markOf(e);
    if (mark && b.type !== 'code') {
      e.preventDefault();
      this.format(mark);
      return;
    }

    if (this.menuFor() === b.id) {
      const items = this.menuItems();
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const n = items.length || 1;
        this.menuIndex.update((k) => (k + (e.key === 'ArrowDown' ? 1 : -1) + n) % n);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const item = items[this.menuIndex()];
        if (item) this.pick(i, item);
        else this.closeMenu();
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        this.closeMenu();
        return;
      }
    }

    if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      const dir = e.key === 'ArrowUp' ? -1 : 1;
      const moved = moveBlock(this.blocks(), i, dir);
      if (moved) {
        const pos = this.selectionIn(el)?.start ?? 0;
        this.blocks.set(moved);
        this.focusAt({ index: i + dir, pos });
      }
      return;
    }

    // Código: Enter escribe un salto de línea; Mayús o Ctrl + Enter sale a un párrafo nuevo; Tab escribe dos espacios.
    if (b.type === 'code') {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (e.shiftKey || e.ctrlKey || e.metaKey) {
          const list = this.blocks();
          this.commit({ blocks: [...list.slice(0, i + 1), newBlock(), ...list.slice(i + 1)], caret: { index: i + 1, pos: 0 } });
        } else {
          document.execCommand('insertText', false, '\n');
        }
        return;
      }
      if (e.key === 'Tab' && !e.shiftKey) {
        e.preventDefault();
        document.execCommand('insertText', false, '  ');
        return;
      }
    }

    if (e.key === 'Enter') {
      e.preventDefault(); // Mayús + Enter también parte el bloque: no hay saltos de línea dentro de un bloque
      const halves = this.halves(el);
      if (!halves) return;
      const current = this.syncText(i, this.domText(b, el));
      // «---» + Enter en un párrafo lo vuelve separador.
      if (b.type === 'p' && plain(halves.before + halves.after).trim() === '---') {
        const list = setType(current, i, 'hr');
        this.commit({ blocks: i === list.length - 1 ? [...list, newBlock()] : list, caret: { index: i + 1, pos: 0 } });
        return;
      }
      const edit = splitWith(current, i, halves.before, halves.after);
      if (edit) this.commit(edit);
      return;
    }

    if (e.key === 'Backspace') {
      const sel = this.selectionIn(el);
      if (sel && sel.start === 0 && sel.end === 0) {
        const edit = backspaceAtStart(this.syncText(i, this.domText(b, el)), i);
        if (edit) {
          e.preventDefault();
          this.commit(edit);
        }
      }
      return;
    }

    if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !e.shiftKey) {
      const up = e.key === 'ArrowUp';
      if (this.onEdge(el, up) && this.moveFocus(i, up ? -1 : 1, up ? 'end' : 'start')) e.preventDefault();
    }
  }

  protected onPaste(i: number, e: ClipboardEvent) {
    e.preventDefault(); // siempre texto plano: lo pegado no trae formato ajeno
    if (this.readonly()) return;
    const image = Array.from(e.clipboardData?.files ?? []).find((f) => f.type.startsWith('image/'));
    if (image) {
      const id = this.blocks()[i]?.id ?? null;
      void this.addImageFile(image, id, this.isEmptyParagraph(id));
      return;
    }
    const text = (e.clipboardData?.getData('text/plain') ?? '').replace(/\r\n?/g, '\n');
    if (!text) return;
    const b = this.blocks()[i];
    // Una dirección web pegada sobre texto seleccionado lo convierte en enlace (como en Notion o Docs).
    const sel = getSelection();
    if (sel && !sel.isCollapsed && !text.includes('\n') && b?.type !== 'code' && /^https?:\/\//i.test(text.trim())) {
      const url = safeUrl(text);
      if (url) {
        document.execCommand('createLink', false, url);
        const el = this.activeBlockEl();
        if (el) this.syncBlock(el);
        return;
      }
    }
    const lines = text.split('\n');
    if (lines.length < 2 || b?.type === 'code') {
      document.execCommand('insertText', false, text);
      return;
    }
    const el = e.currentTarget as HTMLElement;
    const halves = this.halves(el);
    if (!halves) return;
    const edit = pasteLines(this.syncText(i, this.domText(b, el)), i, halves.before, halves.after, lines);
    if (edit) this.commit(edit);
  }

  /** Soltar un archivo de imagen sobre un bloque lo agrega como imagen; cualquier otra cosa se ignora. */
  protected onDrop(i: number, e: DragEvent) {
    e.preventDefault();
    if (this.readonly()) return;
    const image = Array.from(e.dataTransfer?.files ?? []).find((f) => f.type.startsWith('image/'));
    if (!image) return;
    const id = this.blocks()[i]?.id ?? null;
    void this.addImageFile(image, id, this.isEmptyParagraph(id));
  }

  protected toggle(i: number) {
    if (this.readonly()) return;
    this.replace(i, (b) => ({ ...b, done: !b.done }));
  }

  protected drop(i: number) {
    if (this.readonly()) return;
    const b = this.blocks()[i];
    // Una imagen subida se borra también del almacenamiento (si falla, solo queda un archivo sin usar).
    if (b?.type === 'image' && b.path) void this.notas.deleteImage(b.path);
    this.blocks.set(removeBlock(this.blocks(), i));
  }

  protected appendParagraph() {
    const list = this.blocks();
    const last = list[list.length - 1];
    // Si el último bloque ya es un párrafo vacío, solo se le da el foco.
    if (last && last.type === 'p' && !last.text) {
      this.focusAt({ index: list.length - 1, pos: 0 });
      return;
    }
    this.commit({ blocks: [...list, newBlock()], caret: { index: list.length, pos: 0 } });
  }

  // ── Imágenes ───────────────────────────────────────────────────────────────

  protected imgSrc(b: Block): string | null {
    if (this.imgFailedIds().has(b.id)) return null;
    return b.url ?? (b.path ? (this.notas.imageUrls()[b.path]?.url ?? null) : null);
  }

  protected imgFailed(b: Block): boolean {
    return this.imgFailedIds().has(b.id);
  }

  protected imgAlt(b: Block): string {
    return plain(b.text) || 'Imagen de la nota';
  }

  /** Una imagen no cargó: si es subida, se pide una dirección nueva una vez (la anterior pudo vencer); si no, se avisa. */
  protected onImgError(b: Block) {
    if (b.path && !this.imgRetried.has(b.id)) {
      this.imgRetried.add(b.id);
      void this.notas.ensureImageUrls([b.path], true).catch(() => this.markFailed(b.id));
      return;
    }
    this.markFailed(b.id);
  }

  private markFailed(id: string) {
    this.imgFailedIds.update((s) => new Set(s).add(id));
  }

  protected onCaption(i: number, e: Event) {
    if (this.readonly()) return;
    const html = sanitizeInline((e.currentTarget as HTMLElement).innerHTML);
    this.replace(i, (b) => ({ ...b, text: html }));
  }

  /** Enter en el pie de foto sigue en un párrafo nuevo debajo de la imagen. */
  protected onCaptionKey(i: number, e: KeyboardEvent) {
    if (this.readonly() || e.isComposing) return;
    if (isLinkKey(e)) {
      e.preventDefault();
      this.openLinkDialog();
      return;
    }
    const mark = markOf(e);
    if (mark) {
      e.preventDefault();
      this.format(mark);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const list = this.blocks();
      this.commit({ blocks: [...list.slice(0, i + 1), newBlock(), ...list.slice(i + 1)], caret: { index: i + 1, pos: 0 } });
      return;
    }
    if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !e.shiftKey && this.onEdge(e.currentTarget as HTMLElement, e.key === 'ArrowUp')) {
      if (this.moveFocus(i, e.key === 'ArrowUp' ? -1 : 1, e.key === 'ArrowUp' ? 'end' : 'start')) e.preventDefault();
    }
  }

  private isEmptyParagraph(id: string | null): boolean {
    const b = this.blocks().find((x) => x.id === id);
    return !!b && b.type === 'p' && !plain(b.text).trim();
  }

  /** Abre la hoja para agregar una imagen en lugar del bloque indicado (el párrafo donde se escribió «/imagen»). */
  protected openImageSheet(blockId: string) {
    this.imageTarget = blockId;
    this.imgUrl.set('');
    this.imgError.set('');
    this.imgOpen.set(true);
  }

  protected onFilePicked(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.imgOpen.set(false);
    void this.addImageFile(file, this.imageTarget, this.isEmptyParagraph(this.imageTarget));
  }

  protected addImageUrl() {
    const url = normalizeUrl(this.imgUrl());
    if (!url) {
      this.imgError.set('Escribe una dirección web válida, por ejemplo https://ejemplo.com/foto.jpg');
      return;
    }
    this.imgOpen.set(false);
    this.insertImage(this.imageTarget, this.isEmptyParagraph(this.imageTarget), { url });
  }

  /** Reduce, sube y agrega una imagen. Con `replace`, ocupa el lugar del párrafo vacío indicado; si no, va debajo del bloque. */
  protected async addImageFile(file: File, targetId: string | null, replace: boolean) {
    const note = this.noteId();
    if (!note || this.readonly()) return;
    const waiting = this.toasts.show({ message: 'Subiendo imagen…', duration: 30_000 });
    try {
      const img = await prepareImage(file);
      const path = await this.notas.uploadImage(note, img.blob, img.ext, img.type);
      this.insertImage(targetId, replace, { path });
      this.toasts.show({ message: 'Imagen agregada' });
    } catch (e) {
      this.toasts.error(e instanceof ImageError ? e.message : 'No se pudo subir la imagen. Revisa tu conexión e intenta de nuevo.');
    } finally {
      this.toasts.dismiss(waiting);
    }
  }

  private insertImage(targetId: string | null, replace: boolean, fields: { path?: string; url?: string }) {
    const list = this.blocks();
    const k = targetId ? list.findIndex((b) => b.id === targetId) : -1;
    const block: Block = { id: newId(), type: 'image', text: '', ...fields };
    let next: Block[];
    if (k < 0) next = [...list, block];
    else if (replace) next = list.map((b, j) => (j === k ? block : b));
    else next = [...list.slice(0, k + 1), block, ...list.slice(k + 1)];
    // Si la imagen queda al final, se deja un párrafo debajo para seguir escribiendo.
    if (next.indexOf(block) === next.length - 1) next.push(newBlock());
    this.blocks.set(next);
  }

  // ── Enlaces ────────────────────────────────────────────────────────────────

  protected shortUrl(u: string): string {
    return u.replace(/^https?:\/\//i, '').replace(/^mailto:/i, '').replace(/\/$/, '').slice(0, 40);
  }

  protected openLink(href: string) {
    window.open(href, '_blank', 'noopener,noreferrer');
  }

  /** Al tocar un enlace: se abre en otra pestaña si la nota es de solo lectura o con Ctrl/Cmd; editando, solo se coloca el cursor. */
  protected onHostClick(e: MouseEvent) {
    const a = (e.target as HTMLElement | null)?.closest?.('.rt a[href]') as HTMLAnchorElement | null;
    if (!a || !this.host.contains(a)) return;
    if (this.readonly() || e.ctrlKey || e.metaKey) {
      e.preventDefault();
      this.openLink(a.href);
    }
  }

  /** Abre la hoja para poner, cambiar o escribir un enlace donde está la selección. */
  protected openLinkDialog() {
    if (this.readonly()) return;
    const el = this.activeBlockEl();
    const sel = getSelection();
    if (!el || !sel || !sel.rangeCount || el.closest('.t-code')) return;
    const range = sel.getRangeAt(0).cloneRange();
    const anchor = this.closestMark(range.commonAncestorContainer, 'a', el);
    if (anchor) range.selectNodeContents(anchor);
    const text = range.toString().trim();
    this.linkTarget = { el, range, anchor };
    this.linkUrl.set(anchor ? (anchor.getAttribute('href') ?? '') : /^https?:\/\//i.test(text) ? text : '');
    this.linkError.set('');
    this.linkOpen.set(true);
  }

  protected applyLink() {
    const t = this.linkTarget;
    if (!t) return;
    const raw = this.linkUrl().trim();
    const url = /^mailto:/i.test(raw) ? safeUrl(raw) : normalizeUrl(raw);
    if (!url) {
      this.linkError.set('Escribe una dirección web válida, por ejemplo ejemplo.com');
      return;
    }
    this.linkOpen.set(false);
    this.linkTarget = null;
    // El diálogo devuelve el foco al cerrarse: se espera un instante para restaurar la selección.
    setTimeout(() => {
      const { el, range, anchor } = t;
      if (!el.isConnected) return;
      el.focus();
      if (anchor?.isConnected) {
        anchor.setAttribute('href', url);
      } else {
        const sel = getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
        if (range.collapsed) document.execCommand('insertHTML', false, '<a href="' + escapeHtml(url).replace(/"/g, '&quot;') + '">' + escapeHtml(url) + '</a>');
        else document.execCommand('createLink', false, url);
      }
      this.syncBlock(el);
      this.updateBar();
    }, 30);
  }

  protected removeLink() {
    if (this.readonly()) return;
    const el = this.activeBlockEl();
    const sel = getSelection();
    if (!el || !sel || !sel.rangeCount) return;
    const a = this.closestMark(sel.getRangeAt(0).commonAncestorContainer, 'a', el);
    if (!a) return;
    const r = document.createRange();
    r.selectNodeContents(a);
    sel.removeAllRanges();
    sel.addRange(r);
    document.execCommand('unlink');
    this.syncBlock(el);
    this.updateBar();
  }

  // ── Tablas ─────────────────────────────────────────────────────────────────

  private cellEl(id: string, r: number, c: number): HTMLElement | null {
    return this.host.querySelector<HTMLElement>('.rt[data-id="' + CSS.escape(id) + '"][data-cell="' + r + ',' + c + '"]');
  }

  /** Pone el cursor en una celda (pinta primero, igual que `focusAt`). */
  private focusCell(id: string, r: number, c: number, where: 'start' | 'end' = 'end') {
    const apply = (): boolean => {
      const el = this.cellEl(id, r, c);
      if (!el) return false;
      el.focus();
      placeCaret(el, where === 'end' ? (el.textContent?.length ?? 0) : 0);
      return true;
    };
    try {
      this.app.tick();
    } catch {
      /* se hace en el siguiente ciclo */
    }
    if (!apply()) afterNextRender(() => void apply(), { injector: this.injector });
  }

  private setRows(i: number, fn: (rows: string[][]) => string[][]) {
    this.blocks.update((l) => l.map((b, k) => (k === i && b.rows ? { ...b, rows: fn(b.rows) } : b)));
  }

  protected onCell(i: number, r: number, c: number, e: Event) {
    if (this.readonly()) return;
    const html = sanitizeInline((e.currentTarget as HTMLElement).innerHTML);
    this.setRows(i, (rows) => tableSetCell(rows, r, c, html));
  }

  protected onCellPaste(e: ClipboardEvent) {
    e.preventDefault();
    if (this.readonly()) return;
    const text = (e.clipboardData?.getData('text/plain') ?? '').replace(/\s*\n+\s*/g, ' ');
    if (text) document.execCommand('insertText', false, text);
  }

  protected onCellKey(i: number, r: number, c: number, e: KeyboardEvent) {
    if (this.readonly() || e.isComposing) return;
    const b = this.blocks()[i];
    const rows = b?.rows;
    if (!b || !rows) return;
    const el = e.currentTarget as HTMLElement;
    const last = { r: rows.length - 1, c: (rows[0]?.length ?? 1) - 1 };

    if (isLinkKey(e)) {
      e.preventDefault();
      this.openLinkDialog();
      return;
    }
    const mark = markOf(e);
    if (mark) {
      e.preventDefault();
      this.format(mark);
      return;
    }

    if (e.key === 'Tab') {
      e.preventDefault();
      if (e.shiftKey) {
        if (r === 0 && c === 0) this.moveFocus(i, -1, 'end');
        else if (c > 0) this.focusCell(b.id, r, c - 1);
        else this.focusCell(b.id, r - 1, last.c);
      } else if (c < last.c) {
        this.focusCell(b.id, r, c + 1);
      } else if (r < last.r) {
        this.focusCell(b.id, r + 1, 0);
      } else {
        // Última celda: Tab agrega una fila (como en una hoja de cálculo).
        this.setRows(i, (x) => tableAddRow(x, x.length));
        this.focusCell(b.id, last.r + 1, 0);
      }
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      if (r < last.r) this.focusCell(b.id, r + 1, c);
      else {
        this.setRows(i, (x) => tableAddRow(x, x.length));
        this.focusCell(b.id, last.r + 1, c);
      }
      return;
    }

    if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !e.shiftKey && !e.altKey) {
      const up = e.key === 'ArrowUp';
      if (!this.onEdge(el, up)) return;
      e.preventDefault();
      if (up && r > 0) this.focusCell(b.id, r - 1, c);
      else if (!up && r < last.r) this.focusCell(b.id, r + 1, c);
      else this.moveFocus(i, up ? -1 : 1, up ? 'end' : 'start');
    }
  }

  protected onTableFocus(id: string, e: FocusEvent) {
    const cell = (e.target as HTMLElement | null)?.closest<HTMLElement>('.rt')?.dataset['cell'];
    if (!cell) return;
    const [r, c] = cell.split(',').map(Number);
    const cur = this.tblFocus();
    if (!cur || cur.id !== id || cur.r !== r || cur.c !== c) this.tblFocus.set({ id, r, c });
  }

  protected onTableBlur(e: FocusEvent) {
    const wrap = e.currentTarget as HTMLElement;
    if (!wrap.contains(e.relatedTarget as Node | null)) this.tblFocus.set(null);
  }

  protected tableAct(i: number, act: 'row+' | 'col+' | 'row-' | 'col-') {
    const f = this.tblFocus();
    const b = this.blocks()[i];
    if (this.readonly() || !f || !b || f.id !== b.id) return;
    const { r, c } = f;
    if (act === 'row+') {
      this.setRows(i, (x) => tableAddRow(x, r + 1));
      this.focusCell(b.id, r + 1, c);
    } else if (act === 'col+') {
      this.setRows(i, (x) => tableAddCol(x, c + 1));
      this.focusCell(b.id, r, c + 1);
    } else if (act === 'row-') {
      this.setRows(i, (x) => tableDelRow(x, r));
      this.focusCell(b.id, Math.max(0, Math.min(r, (b.rows?.length ?? 1) - 2)), c);
    } else {
      this.setRows(i, (x) => tableDelCol(x, c));
      this.focusCell(b.id, r, Math.max(0, Math.min(c, (b.rows?.[0]?.length ?? 1) - 2)));
    }
  }

  // ── Quitar bloques con contenido (con confirmación) ────────────────────────

  /** Quitar una tabla o una subpágina: si se pierde algo, antes se pregunta. */
  protected askDrop(i: number) {
    const b = this.blocks()[i];
    if (!b || this.readonly()) return;
    if (b.type === 'table' && !tableHasContent(b.rows ?? [])) return this.drop(i);
    this.dropIndex = i;
    if (b.type === 'page') {
      this.dropTitle.set(`¿Eliminar la subpágina «${this.pageTitle(b.ref)}»?`);
      this.dropMessage.set('Se elimina para siempre, con todo lo que contiene. No se puede recuperar.');
    } else {
      this.dropTitle.set('¿Eliminar la tabla?');
      this.dropMessage.set('Se pierde lo que escribiste en ella. No se puede recuperar.');
    }
    this.dropOpen.set(true);
  }

  protected async confirmDrop() {
    const i = this.dropIndex;
    const b = this.blocks()[i];
    if (!b) return void this.dropOpen.set(false);
    this.busy.set(true);
    try {
      if (b.type === 'page' && b.ref && this.notas.byId(b.ref)) await this.notas.remove(b.ref);
      // Por si la lista cambió mientras se esperaba: se busca el bloque por su id.
      const k = this.blocks().findIndex((x) => x.id === b.id);
      if (k >= 0) this.drop(k);
    } catch {
      this.toasts.error('No se pudo eliminar. Revisa tu conexión e intenta de nuevo.');
    } finally {
      this.busy.set(false);
      this.dropOpen.set(false);
    }
  }

  // ── Índice ─────────────────────────────────────────────────────────────────

  protected goTo(id: string) {
    const el = this.host.querySelector<HTMLElement>('.rt[data-id="' + CSS.escape(id) + '"]');
    if (!el) return;
    const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'center' });
    if (!this.readonly()) el.focus({ preventScroll: true });
  }

  // ── Emoji ──────────────────────────────────────────────────────────────────

  /** Abre el selector para cambiar el emoji de una llamada. */
  protected pickIcon(id: string) {
    if (this.readonly()) return;
    this.emojiTarget = { mode: 'icon', id, cell: null, pos: 0 };
    this.emojiOpen.set(true);
  }

  /** Abre el selector para insertar un emoji donde está el cursor (o al final de lo seleccionado). */
  protected insertEmojiAtSelection() {
    const el = this.activeBlockEl();
    if (!el || this.readonly()) return;
    const sel = this.selectionIn(el);
    this.emojiTarget = { mode: 'insert', id: el.dataset['id'] ?? '', cell: el.dataset['cell'] ?? null, pos: sel?.end ?? 0 };
    this.emojiOpen.set(true);
  }

  protected onEmoji(emoji: string) {
    const t = this.emojiTarget;
    this.emojiTarget = null;
    if (!t || !emoji || this.readonly()) return;
    if (t.mode === 'icon') {
      this.blocks.update((l) => l.map((b) => (b.id === t.id ? { ...b, icon: emoji } : b)));
      return;
    }
    // El diálogo devuelve el foco al cerrarse: se espera un instante para ponerlo en su sitio.
    setTimeout(() => {
      const el = t.cell
        ? this.cellEl(t.id, Number(t.cell.split(',')[0]), Number(t.cell.split(',')[1]))
        : this.host.querySelector<HTMLElement>('.rt[data-id="' + CSS.escape(t.id) + '"]');
      if (!el) return;
      el.focus();
      placeCaret(el, t.pos);
      document.execCommand('insertText', false, emoji);
    }, 30);
  }

  // ── Formato ────────────────────────────────────────────────────────────────

  /** Aplica o quita negrita, cursiva, tachado o código a la selección del bloque que se está editando. */
  protected format(mark: Mark) {
    if (this.readonly()) return;
    const el = this.activeBlockEl();
    const sel = getSelection();
    if (!el || !sel || !sel.rangeCount || el.closest('.t-code')) return;
    if (mark === 'code') this.toggleCode(el, sel);
    else document.execCommand(mark === 'b' ? 'bold' : mark === 'i' ? 'italic' : 'strikeThrough');
    this.syncBlock(el);
    this.updateBar();
  }

  private toggleCode(el: HTMLElement, sel: Selection) {
    const range = sel.getRangeAt(0);
    const existing = this.closestMark(range.commonAncestorContainer, 'code', el);
    if (existing) {
      // Ya es código: se quita la etiqueta y se deja el texto.
      const parent = existing.parentNode;
      if (!parent) return;
      const first = existing.firstChild;
      const last = existing.lastChild;
      while (existing.firstChild) parent.insertBefore(existing.firstChild, existing);
      parent.removeChild(existing);
      if (first && last) {
        const r = document.createRange();
        r.setStartBefore(first);
        r.setEndAfter(last);
        sel.removeAllRanges();
        sel.addRange(r);
      }
      return;
    }
    if (range.collapsed) return;
    const code = document.createElement('code');
    code.appendChild(range.extractContents());
    range.insertNode(code);
    const r = document.createRange();
    r.selectNodeContents(code);
    sel.removeAllRanges();
    sel.addRange(r);
  }

  private closestMark(node: Node | null, tag: string, root: HTMLElement): HTMLElement | null {
    for (let n: Node | null = node; n && n !== root; n = n.parentNode) {
      if (n.nodeType === 1 && (n as HTMLElement).tagName.toLowerCase() === tag) return n as HTMLElement;
    }
    return null;
  }

  /**
   * Muestra la barra sobre la selección (solo si es de este editor y se puede editar). Con texto seleccionado ofrece formato,
   * enlace y emoji; con el cursor dentro de un enlace, abrirlo, editarlo o quitarlo.
   */
  private updateBar() {
    const el = this.activeBlockEl();
    const sel = getSelection();
    if (this.readonly() || !el || el.closest('.t-code') || !sel || !sel.rangeCount) {
      if (this.bar()) this.bar.set(null);
      return;
    }
    const range = sel.getRangeAt(0);
    const anchor = this.closestMark(range.commonAncestorContainer, 'a', el);
    const link = anchor?.getAttribute('href') ?? null;
    let rect: DOMRect;
    if (sel.isCollapsed) {
      if (!anchor) {
        if (this.bar()) this.bar.set(null);
        return;
      }
      rect = anchor.getBoundingClientRect();
    } else {
      rect = range.getBoundingClientRect();
    }
    if (!rect.width && !rect.height) {
      if (this.bar()) this.bar.set(null);
      return;
    }
    const collapsed = sel.isCollapsed;
    const half = collapsed ? 160 : 150;
    const x = Math.min(Math.max(rect.left + rect.width / 2, half), window.innerWidth - half);
    const y = Math.max(rect.top, 56);
    const state = (cmd: string) => {
      try {
        return document.queryCommandState(cmd);
      } catch {
        return false;
      }
    };
    const next: FormatBar = {
      x,
      y,
      link,
      collapsed,
      on: { b: state('bold'), i: state('italic'), s: state('strikeThrough'), code: !!this.closestMark(range.commonAncestorContainer, 'code', el) },
    };
    const cur = this.bar();
    if (
      !cur || cur.x !== next.x || cur.y !== next.y || cur.link !== next.link || cur.collapsed !== next.collapsed ||
      (['b', 'i', 's', 'code'] as Mark[]).some((m) => cur.on[m] !== next.on[m])
    ) {
      this.bar.set(next);
    }
  }

  /** El bloque (o la celda) editable que contiene la selección (null si está en otra parte de la página). */
  private activeBlockEl(): HTMLElement | null {
    const sel = getSelection();
    const node = sel?.anchorNode;
    if (!node) return null;
    const start = node.nodeType === 1 ? (node as HTMLElement) : node.parentElement;
    const el = start?.closest<HTMLElement>('.rt') ?? null;
    return el && this.host.contains(el) ? el : null;
  }

  /** Pasa al modelo lo que hay en el DOM del bloque o celda (tras un formato que no dispara `input`). */
  private syncBlock(el: HTMLElement) {
    const id = el.dataset['id'];
    const i = this.blocks().findIndex((b) => b.id === id);
    if (i < 0) return;
    const html = sanitizeInline(el.innerHTML);
    const cell = el.dataset['cell'];
    if (cell) {
      const [r, c] = cell.split(',').map(Number);
      this.setRows(i, (rows) => tableSetCell(rows, r, c, html));
    } else if (this.blocks()[i].text !== html) {
      this.replace(i, (b) => ({ ...b, text: html }));
    }
  }

  // ── Menú «/» ───────────────────────────────────────────────────────────────

  protected pick(i: number, item: MenuItem) {
    this.closeMenu();
    const list = this.blocks();
    const b = list[i];
    if (!b) return;
    // La barra y el filtro que se escribieron se quitan: el bloque queda vacío con su nuevo tipo.
    const cleared = list.map((x, k) => (k === i ? { ...x, text: '' } : x));
    const withTrailing = (next: Block[]) => (i === next.length - 1 ? [...next, newBlock()] : next);

    switch (item.type) {
      case 'emoji':
        this.blocks.set(cleared);
        this.emojiTarget = { mode: 'insert', id: b.id, cell: null, pos: 0 };
        this.emojiOpen.set(true);
        return;
      case 'hr':
        this.commit({ blocks: withTrailing(setType(cleared, i, 'hr')), caret: { index: i + 1, pos: 0 } });
        return;
      case 'toc':
        this.commit({ blocks: withTrailing(setType(cleared, i, 'toc')), caret: { index: i + 1, pos: 0 } });
        return;
      case 'table':
        // El foco va a la primera celda; si la tabla es lo último, queda un párrafo debajo para seguir escribiendo.
        this.commit({ blocks: withTrailing(setType(cleared, i, 'table')), caret: { index: i, pos: 0 } });
        return;
      case 'page':
        void this.createSubpage(b.id);
        return;
      case 'image':
        this.blocks.set(cleared);
        this.openImageSheet(b.id);
        return;
      default:
        this.commit({ blocks: setType(cleared, i, item.type), caret: { index: i, pos: 0 } });
    }
  }

  /** Crea una subpágina (una nota hija de la actual) y deja en su lugar un bloque que la enlaza. */
  private async createSubpage(blockId: string) {
    const parent = this.noteId();
    if (!parent) return;
    this.blocks.update((l) => l.map((b) => (b.id === blockId ? { ...b, text: '' } : b)));
    try {
      const child = await this.notas.create(parent);
      const list = this.blocks();
      const k = list.findIndex((b) => b.id === blockId);
      if (k < 0) {
        // El bloque ya no está: la subpágina recién creada no tendría enlace, así que no se deja huérfana.
        await this.notas.remove(child.id).catch(() => undefined);
        return;
      }
      const next = list.map((b, j) => (j === k ? ({ id: b.id, type: 'page', text: '', ref: child.id } as Block) : b));
      this.blocks.set(k === next.length - 1 ? [...next, newBlock()] : next);
      this.toasts.show({ message: 'Subpágina creada' });
    } catch {
      this.toasts.error('No se pudo crear la subpágina. Revisa tu conexión e intenta de nuevo.');
    }
  }

  private closeMenu() {
    if (this.menuFor() !== null) this.menuFor.set(null);
  }

  // ── Ayudas de selección ────────────────────────────────────────────────────

  /** Inicio y fin de la selección dentro de `el`, en caracteres visibles (null si la selección está fuera). */
  private selectionIn(el: HTMLElement): { start: number; end: number } | null {
    const sel = getSelection();
    if (!sel || !sel.rangeCount) return null;
    const r = sel.getRangeAt(0);
    if (!el.contains(r.startContainer) || !el.contains(r.endContainer)) return null;
    return { start: offsetIn(el, r.startContainer, r.startOffset), end: offsetIn(el, r.endContainer, r.endOffset) };
  }

  /** El HTML antes y después del cursor (si había texto seleccionado, se descarta). */
  private halves(el: HTMLElement): { before: string; after: string } | null {
    const sel = getSelection();
    if (!sel || !sel.rangeCount) return null;
    const range = sel.getRangeAt(0);
    if (!el.contains(range.startContainer) || !el.contains(range.endContainer)) return null;
    if (!range.collapsed) range.deleteContents();
    const before = document.createRange();
    before.selectNodeContents(el);
    before.setEnd(range.startContainer, range.startOffset);
    const after = document.createRange();
    after.selectNodeContents(el);
    after.setStart(range.endContainer, range.endOffset);
    return { before: fragmentHtml(before.cloneContents()), after: fragmentHtml(after.cloneContents()) };
  }

  /** ¿El cursor está en la primera (o última) línea visible del bloque? Ahí las flechas pasan al bloque vecino. */
  private onEdge(el: HTMLElement, up: boolean): boolean {
    const sel = getSelection();
    if (!sel || !sel.rangeCount || !sel.isCollapsed) return false;
    const range = sel.getRangeAt(0);
    const box = el.getBoundingClientRect();
    const line = parseFloat(getComputedStyle(el).lineHeight) || 26;
    const rect = range.getClientRects()[0] ?? range.startContainer.parentElement?.getBoundingClientRect() ?? box;
    return up ? rect.top - box.top < line - 2 : box.bottom - rect.bottom < line - 2;
  }

  /** El DOM puede ir un paso adelante de la señal: se iguala antes de operar sobre los bloques. */
  private syncText(i: number, html: string): Block[] {
    const list = this.blocks();
    return list[i] && list[i].text !== html ? list.map((b, k) => (k === i ? { ...b, text: html } : b)) : list;
  }

  private replace(i: number, fn: (b: Block) => Block) {
    this.blocks.update((l) => l.map((b, k) => (k === i ? fn(b) : b)));
  }

  private commit(edit: Edit) {
    this.closeMenu();
    this.blocks.set(edit.blocks);
    this.focusAt(edit.caret);
  }

  private blockEl(id: string): HTMLElement | null {
    return this.host.querySelector<HTMLElement>('.rt[data-id="' + CSS.escape(id) + '"]');
  }

  /**
   * Pone el cursor en el bloque indicado (en una tabla, su primera celda). Pinta primero, en el acto: si el foco
   * esperara al siguiente ciclo de Angular, las teclas que llegan justo después de un Enter caerían en el bloque anterior.
   */
  private focusAt(caret: Caret) {
    const apply = (): boolean => {
      const target = this.blocks()[caret.index];
      const el = target && this.blockEl(target.id);
      if (!el) return false;
      el.focus();
      placeCaret(el, caret.pos);
      return true;
    };
    try {
      this.app.tick();
    } catch {
      /* si no se puede pintar ahora, se hace en el siguiente ciclo */
    }
    if (!apply()) afterNextRender(() => void apply(), { injector: this.injector });
  }

  /** Pasa el cursor al bloque de arriba o de abajo que tenga texto editable (en una tabla, su celda más cercana). */
  private moveFocus(i: number, dir: -1 | 1, where: 'start' | 'end'): boolean {
    const list = this.blocks();
    for (let k = i + dir; k >= 0 && k < list.length; k += dir) {
      if (!hasText(list[k].type) && list[k].type !== 'table' && list[k].type !== 'image') continue;
      const els = this.host.querySelectorAll<HTMLElement>('.rt[data-id="' + CSS.escape(list[k].id) + '"]');
      if (!els.length) continue;
      const el = dir === 1 ? els[0] : els[els.length - 1];
      el.focus();
      placeCaret(el, where === 'end' ? (el.textContent?.length ?? 0) : 0);
      return true;
    }
    return false;
  }
}
