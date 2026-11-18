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
} from '@angular/core';
import { Icon } from '../icons/icon';
import {
  Block,
  BlockType,
  Caret,
  Edit,
  Mark,
  applyShortcut,
  backspaceAtStart,
  listNumber,
  moveBlock,
  newBlock,
  pasteLines,
  plain,
  removeBlock,
  sanitizeInline,
  setType,
  splitWith,
} from './notas.blocks';

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
  type: BlockType;
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
  { type: 'hr', label: 'Separador', hint: 'Una línea divisoria', glyph: '—', words: 'separador linea divisor' },
];

interface FormatBar {
  x: number;
  y: number;
  on: Record<Mark, boolean>;
}

const FORMATS: { mark: Mark; label: string; glyph: string; key: string }[] = [
  { mark: 'b', label: 'Negrita', glyph: 'B', key: 'Ctrl+B' },
  { mark: 'i', label: 'Cursiva', glyph: 'I', key: 'Ctrl+I' },
  { mark: 's', label: 'Tachado', glyph: 'S', key: 'Ctrl+Mayús+X' },
  { mark: 'code', label: 'Código', glyph: '</>', key: 'Ctrl+E' },
];

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

/**
 * Editor de bloques con formato en línea. Cada bloque es una línea editable. «/» al inicio de un bloque vacío abre el
 * menú de tipos; «# », «- », «1. », «[] » y «> » funcionan como en Markdown; Enter parte el bloque, Retroceso al inicio
 * lo une con el anterior y Alt + ↑/↓ lo mueve. Al seleccionar texto aparece una barra (o Ctrl+B, Ctrl+I, Ctrl+Mayús+X,
 * Ctrl+E) para negrita, cursiva, tachado y código. Con `readonly` se puede leer y seleccionar, pero no cambiar nada.
 */
@Component({
  selector: 'app-block-editor',
  imports: [Icon, Rich],
  template: `
    @for (b of blocks(); track b.id; let i = $index) {
      <div class="blk t-{{ b.type }}" [class.only]="blocks().length === 1 && !b.text">
        @if (b.type === 'hr') {
          <hr />
          @if (!readonly()) {
            <button type="button" class="rm" aria-label="Quitar separador" (click)="drop(i)"><app-icon name="x" [size]="14" /></button>
          }
        } @else {
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
          }
          <div
            class="rt" [class.empty]="!b.text" [class.done]="b.type === 'todo' && b.done" [appRich]="b.text" [attr.data-id]="b.id"
            role="textbox" aria-multiline="false" [attr.contenteditable]="readonly() ? 'false' : 'true'" [attr.aria-readonly]="readonly()"
            [attr.data-ph]="placeholder(b)" [attr.aria-label]="label(b)" spellcheck="true"
            [attr.aria-expanded]="menuFor() === b.id" [attr.aria-controls]="menuFor() === b.id ? 'slash-menu' : null"
            (input)="onInput(i, $event)" (keydown)="onKey(i, $event)" (paste)="onPaste(i, $event)" (drop)="$event.preventDefault()"
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
      </div>
    }
    @if (!readonly()) {
      <button type="button" class="tail" aria-label="Agregar un párrafo al final" (click)="appendParagraph()"></button>
    }
    @if (bar(); as f) {
      <div class="bar" role="toolbar" aria-label="Formato del texto" [style.left.px]="f.x" [style.top.px]="f.y">
        @for (m of formats; track m.mark) {
          <button
            type="button" class="fb f-{{ m.mark }}" [class.on]="f.on[m.mark]" [attr.aria-pressed]="f.on[m.mark]" [attr.aria-label]="m.label + ' (' + m.key + ')'"
            [attr.title]="m.label + ' (' + m.key + ')'" (mousedown)="$event.preventDefault()" (click)="format(m.mark)"
          >{{ m.glyph }}</button>
        }
      </div>
    }
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
    .rt :where(b) { font-weight: 700; }
    .rt :where(i) { font-style: italic; }
    .rt :where(s) { text-decoration: line-through; }
    .rt :where(code) {
      padding: 1px 5px; border-radius: 4px; background: var(--s2); box-shadow: inset 0 0 0 1px var(--bd);
      font-family: ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace; font-size: 0.9em;
    }
    .t-h1 { margin-top: 18px; }
    .t-h1 .rt { min-height: 42px; font-size: 28px; line-height: 36px; font-weight: 700; letter-spacing: -0.02em; }
    .t-h2 { margin-top: 12px; }
    .t-h2 .rt { min-height: 36px; font-size: 21px; line-height: 30px; font-weight: 650; letter-spacing: -0.01em; }
    .t-quote { padding-left: 14px; box-shadow: inset 3px 0 0 var(--bd2); }
    .t-quote .rt { color: var(--tx2); font-style: italic; }
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
    .rm { display: grid; place-items: center; width: 28px; height: 28px; margin-top: 5px; border: 0; border-radius: 6px; background: none; color: var(--tx3); cursor: pointer; opacity: 0; }
    .blk:hover .rm, .rm:focus-visible { opacity: 1; }
    .rm:hover { background: var(--s2); color: var(--tx); }
    @media (hover: none) { .rm { opacity: 1; } }
    .tail { display: block; width: 100%; min-height: 96px; padding: 0; border: 0; background: none; cursor: text; }
    .menu {
      position: absolute; z-index: 20; top: 100%; left: 0; margin: 4px 0 0; padding: 6px; list-style: none; width: min(320px, 100%);
      max-height: 280px; overflow-y: auto; border-radius: var(--rf-3); background: var(--sf); box-shadow: var(--sh2), inset 0 0 0 1px var(--bd);
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
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BlockEditor {
  readonly blocks = model.required<Block[]>();
  readonly readonly = input(false);

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly injector = inject(Injector);
  private readonly app = inject(ApplicationRef);

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

  constructor() {
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
    return { p: 'Texto', h1: 'Título 1', h2: 'Título 2', ul: 'Elemento de lista', ol: 'Elemento numerado', todo: 'Tarea', quote: 'Cita', hr: 'Separador' }[b.type];
  }

  protected placeholder(b: Block): string {
    if (this.readonly()) return '';
    return { p: 'Escribe algo, o «/» para elegir un bloque', h1: 'Título 1', h2: 'Título 2', ul: 'Elemento', ol: 'Elemento', todo: 'Tarea', quote: 'Cita', hr: '' }[b.type];
  }

  // ── Escritura ──────────────────────────────────────────────────────────────

  protected onInput(i: number, e: Event) {
    if (this.readonly()) return;
    const el = e.currentTarget as HTMLElement;
    const b = this.blocks()[i];
    let html = sanitizeInline(el.innerHTML);
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
    const mod = e.ctrlKey || e.metaKey;

    if (mod && !e.altKey) {
      const key = e.key.toLowerCase();
      const mark: Mark | null = key === 'b' ? 'b' : key === 'i' ? 'i' : key === 'e' ? 'code' : key === 'x' && e.shiftKey ? 's' : null;
      if (mark) {
        e.preventDefault();
        this.format(mark);
        return;
      }
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

    if (e.key === 'Enter') {
      e.preventDefault(); // Mayús + Enter también parte el bloque: no hay saltos de línea dentro de un bloque
      const halves = this.halves(el);
      if (!halves) return;
      const current = this.syncText(i, sanitizeInline(el.innerHTML));
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
        const edit = backspaceAtStart(this.syncText(i, sanitizeInline(el.innerHTML)), i);
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
    const text = (e.clipboardData?.getData('text/plain') ?? '').replace(/\r\n?/g, '\n');
    if (!text) return;
    const lines = text.split('\n');
    if (lines.length < 2) {
      document.execCommand('insertText', false, text);
      return;
    }
    const el = e.currentTarget as HTMLElement;
    const halves = this.halves(el);
    if (!halves) return;
    const edit = pasteLines(this.syncText(i, sanitizeInline(el.innerHTML)), i, halves.before, halves.after, lines);
    if (edit) this.commit(edit);
  }

  protected toggle(i: number) {
    if (this.readonly()) return;
    this.replace(i, (b) => ({ ...b, done: !b.done }));
  }

  protected drop(i: number) {
    if (this.readonly()) return;
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

  // ── Formato ────────────────────────────────────────────────────────────────

  /** Aplica o quita negrita, cursiva, tachado o código a la selección del bloque que se está editando. */
  protected format(mark: Mark) {
    if (this.readonly()) return;
    const el = this.activeBlockEl();
    const sel = getSelection();
    if (!el || !sel || !sel.rangeCount) return;
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

  /** Muestra la barra sobre la selección (solo si es de este editor, tiene texto y se puede editar). */
  private updateBar() {
    const el = this.activeBlockEl();
    const sel = getSelection();
    if (this.readonly() || !el || !sel || sel.isCollapsed || !sel.rangeCount) {
      if (this.bar()) this.bar.set(null);
      return;
    }
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    if (!rect.width && !rect.height) {
      if (this.bar()) this.bar.set(null);
      return;
    }
    const half = 92;
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
      on: { b: state('bold'), i: state('italic'), s: state('strikeThrough'), code: !!this.closestMark(range.commonAncestorContainer, 'code', el) },
    };
    const cur = this.bar();
    if (!cur || cur.x !== next.x || cur.y !== next.y || (['b', 'i', 's', 'code'] as Mark[]).some((m) => cur.on[m] !== next.on[m])) this.bar.set(next);
  }

  /** El bloque editable que contiene la selección (null si está en otra parte de la página). */
  private activeBlockEl(): HTMLElement | null {
    const sel = getSelection();
    const node = sel?.anchorNode;
    if (!node) return null;
    const start = node.nodeType === 1 ? (node as HTMLElement) : node.parentElement;
    const el = start?.closest<HTMLElement>('.rt') ?? null;
    return el && this.host.contains(el) ? el : null;
  }

  /** Pasa al modelo lo que hay en el DOM del bloque (tras un formato que no dispara `input`). */
  private syncBlock(el: HTMLElement) {
    const id = el.dataset['id'];
    const i = this.blocks().findIndex((b) => b.id === id);
    if (i < 0) return;
    const html = sanitizeInline(el.innerHTML);
    if (this.blocks()[i].text !== html) this.replace(i, (b) => ({ ...b, text: html }));
  }

  // ── Menú «/» ───────────────────────────────────────────────────────────────

  protected pick(i: number, item: MenuItem) {
    this.closeMenu();
    const list = this.blocks();
    if (item.type === 'hr') {
      const next = setType(list, i, 'hr');
      this.commit({ blocks: i === next.length - 1 ? [...next, newBlock()] : next, caret: { index: i + 1, pos: 0 } });
      return;
    }
    // La barra y el filtro que se escribieron se quitan: el bloque queda vacío con su nuevo tipo.
    this.commit({ blocks: setType(list.map((b, k) => (k === i ? { ...b, text: '' } : b)), i, item.type), caret: { index: i, pos: 0 } });
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
   * Pone el cursor en el bloque indicado. Pinta primero, en el acto: si el foco esperara al siguiente ciclo de
   * Angular, las teclas que llegan justo después de un Enter caerían en el bloque anterior.
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

  /** Pasa el cursor al bloque de arriba o de abajo que tenga texto editable; false si no hay. */
  private moveFocus(i: number, dir: -1 | 1, where: 'start' | 'end'): boolean {
    const list = this.blocks();
    for (let k = i + dir; k >= 0 && k < list.length; k += dir) {
      if (list[k].type === 'hr') continue;
      const el = this.blockEl(list[k].id);
      if (!el) return false;
      el.focus();
      placeCaret(el, where === 'end' ? plain(list[k].text).length : 0);
      return true;
    }
    return false;
  }
}
