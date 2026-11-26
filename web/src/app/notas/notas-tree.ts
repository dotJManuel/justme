import { ChangeDetectionStrategy, Component, OnInit, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter, map } from 'rxjs';
import { Icon } from '../icons/icon';
import { ToastService } from '../ui/toast';
import { NoteActions } from './notas-actions';
import { NotasNav } from './notas.nav';
import { Note, NotasService } from './notas.service';
import { DropZone, ancestorIds, childrenOf, dropZone, isInside, pinnedNotes, placeNear, visibleRows } from './notas.tree';

interface DropHint {
  id: string;
  zone: DropZone;
}

/**
 * Las notas como árbol: las fijadas arriba y debajo todas, con sus subpáginas que se despliegan y se contraen. Arrastrar una
 * nota sobre otra la mete dentro (agrupar); arrastrarla entre dos, la acomoda; arrastrarla a «Fijadas», la fija en ese lugar.
 * En el celular, o para cualquier cambio con teclado, el botón «⋯» de cada fila abre las mismas acciones.
 */
@Component({
  selector: 'app-notes-tree',
  imports: [Icon, NoteActions, RouterLink],
  template: `
    <div class="head">
      <h2>Docs</h2>
      <span class="grow"></span>
      <button type="button" class="tool" aria-label="Nuevo doc" (click)="create()"><app-icon name="plus" [size]="18" /></button>
      @if (collapsible()) {
        <button type="button" class="tool" aria-label="Ocultar el árbol de docs" (click)="collapse.emit()"><app-icon name="sidebar" [size]="18" /></button>
      }
    </div>

    @if (!notas.loaded()) {
      <p class="hint" aria-busy="true">Cargando…</p>
    } @else {
      @if (pins().length) {
        <div class="sec" role="img" aria-label="Fijados"><app-icon name="pin" [size]="14" [stroke]="2" /><i></i></div>
        <ul class="tree" role="list" aria-label="Docs fijados" (dragover)="$event.preventDefault()">
          @for (n of pins(); track n.id) {
            <li
              class="row" [class.on]="n.id === activeId()" [class.before]="hint()?.id === n.id && hint()?.zone === 'before'" [class.after]="hint()?.id === n.id && hint()?.zone === 'after'"
              draggable="true" (dragstart)="dragStart($event, n)" (dragend)="clearDrag()" (dragover)="dragOver($event, n, 'pins')" (dragleave)="hint.set(null)" (drop)="drop($event, n, 'pins')"
            >
              <span class="sp"></span>
              <a class="ttl" [routerLink]="['/notas', n.id]" [attr.aria-current]="n.id === activeId() ? 'page' : null" (click)="go()">
                <span class="emo" aria-hidden="true">{{ n.icon || '📄' }}</span><span class="name">{{ n.title.trim() || 'Sin título' }}</span>
              </a>
              <button type="button" class="more" [attr.aria-label]="'Opciones de ' + (n.title.trim() || 'doc sin título')" (click)="actionsFor.set(n.id)"><app-icon name="more" [size]="16" /></button>
            </li>
          }
        </ul>
      }

      <div class="sec" role="img" [attr.aria-label]="pins().length ? 'Todos los docs' : 'Mis docs'"><app-icon name="list" [size]="14" [stroke]="2" /><i></i></div>
      <ul class="tree" role="tree" aria-label="Todos los docs">
        @for (r of rows(); track r.note.id) {
          <li
            class="row" role="treeitem" [attr.aria-level]="r.depth + 1" [attr.aria-expanded]="r.hasChildren ? r.expanded : null" [class.on]="r.note.id === activeId()"
            [class.before]="hint()?.id === r.note.id && hint()?.zone === 'before'" [class.after]="hint()?.id === r.note.id && hint()?.zone === 'after'" [class.inside]="hint()?.id === r.note.id && hint()?.zone === 'inside'"
            draggable="true" (dragstart)="dragStart($event, r.note)" (dragend)="clearDrag()" (dragover)="dragOver($event, r.note, 'tree')" (dragleave)="hint.set(null)" (drop)="drop($event, r.note, 'tree')"
          >
            <span class="indent" [style.width.px]="r.depth * 16"></span>
            @if (r.hasChildren) {
              <button type="button" class="chev" [attr.aria-label]="(r.expanded ? 'Contraer ' : 'Expandir ') + (r.note.title.trim() || 'doc sin título')" (click)="nav.toggle(r.note.id)">
                <app-icon [name]="r.expanded ? 'chevron-down' : 'chevron-right'" [size]="14" />
              </button>
            } @else {
              <span class="sp"></span>
            }
            <a class="ttl" [routerLink]="['/notas', r.note.id]" [attr.aria-current]="r.note.id === activeId() ? 'page' : null" (click)="go()">
              <span class="emo" aria-hidden="true">{{ r.note.icon || '📄' }}</span><span class="name">{{ r.note.title.trim() || 'Sin título' }}</span>
            </a>
            <button type="button" class="more" [attr.aria-label]="'Opciones de ' + (r.note.title.trim() || 'doc sin título')" (click)="actionsFor.set(r.note.id)"><app-icon name="more" [size]="16" /></button>
          </li>
        } @empty {
          <li class="hint">Aún no hay notas.</li>
        }
      </ul>
    }

    <app-note-actions [(noteId)]="actionsFor" />
  `,
  styles: `
    :host { display: block; }
    .head { display: flex; align-items: center; gap: 2px; padding: 4px 4px 8px 12px; }
    h2 { font-size: 18px; line-height: 28px; font-weight: 700; letter-spacing: -0.01em; }
    .grow { flex: 1; }
    .tool { display: grid; place-items: center; width: 36px; height: 36px; border: 0; border-radius: 8px; background: none; color: var(--tx2); cursor: pointer; }
    .tool:hover { background: var(--s2); color: var(--tx); }
    .sec { display: flex; align-items: center; gap: 8px; padding: 12px 12px 4px; color: var(--tx3); }
    .sec i { flex: 1; height: 1px; background: var(--bd); }
    .tree { display: flex; flex-direction: column; gap: 1px; margin: 0; padding: 0; list-style: none; }
    .row { position: relative; display: flex; align-items: center; min-height: 36px; padding-right: 2px; border-radius: 8px; }
    .row:hover { background: var(--s2); }
    .row.on { background: var(--acs); }
    .row.on .name { color: var(--ac); font-weight: 600; }
    .row.before::before, .row.after::after { content: ''; position: absolute; left: 8px; right: 8px; height: 2px; border-radius: 1px; background: var(--ac); }
    .row.before::before { top: -1px; }
    .row.after::after { bottom: -1px; }
    .row.inside { background: var(--acs); box-shadow: inset 0 0 0 2px var(--ac); }
    .indent { flex: none; }
    .chev, .sp { flex: none; width: 24px; height: 24px; }
    .chev { display: grid; place-items: center; border: 0; border-radius: 6px; background: none; color: var(--tx2); cursor: pointer; }
    .chev:hover { background: var(--s3); }
    .ttl { display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0; min-height: 36px; padding: 0 6px; color: var(--tx); text-decoration: none; font-size: 14px; }
    .emo { flex: none; width: 20px; text-align: center; font-size: 16px; line-height: 1; }
    .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .more { display: grid; place-items: center; flex: none; width: 32px; height: 32px; border: 0; border-radius: 6px; background: none; color: var(--tx3); cursor: pointer; opacity: 0; }
    .row:hover .more, .more:focus-visible, .row.on .more { opacity: 1; }
    .more:hover { background: var(--s3); color: var(--tx); }
    @media (hover: none) { .more { opacity: 1; } }
    .hint { padding: 12px; font-size: 13px; color: var(--tx2); }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotesTree implements OnInit {
  protected readonly notas = inject(NotasService);
  protected readonly nav = inject(NotasNav);
  private readonly router = inject(Router);
  private readonly toasts = inject(ToastService);

  /** Muestra el botón para ocultar el árbol (en el panel lateral de escritorio). */
  readonly collapsible = input(false);
  readonly collapse = output<void>();

  protected readonly actionsFor = signal<string | null>(null);
  protected readonly hint = signal<DropHint | null>(null);
  private dragging: Note | null = null;

  protected readonly pins = computed(() => pinnedNotes(this.notas.notes()));
  protected readonly rows = computed(() => visibleRows(this.notas.notes(), this.nav.expanded()));

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );
  /** La nota que se está viendo (según la dirección). */
  protected readonly activeId = computed(() => this.url().match(/^\/notas\/([^/?#]+)/)?.[1] ?? null);

  constructor() {
    // Al abrir una nota se despliegan las que la contienen, para que se vea dónde está.
    effect(() => {
      const id = this.activeId();
      const notes = this.notas.notes();
      if (!id || !notes.length) return;
      untracked(() => {
        const up = ancestorIds(notes, id);
        if (up.length) this.nav.expand(...up);
      });
    });
  }

  ngOnInit() {
    void this.notas.load().catch(() => this.toasts.error('No se pudieron cargar tus notas. Revisa tu conexión.'));
  }

  /** Al elegir una nota en el celular, se cierra la hoja del árbol. */
  protected go() {
    this.nav.drawerOpen.set(false);
  }

  protected async create() {
    try {
      const note = await this.notas.create();
      this.nav.drawerOpen.set(false);
      await this.router.navigate(['/notas', note.id]);
    } catch {
      this.toasts.error('No se pudo crear el doc. Revisa tu conexión e intenta de nuevo.');
    }
  }

  // ── Arrastrar y soltar ─────────────────────────────────────────────────────

  protected dragStart(e: DragEvent, note: Note) {
    this.dragging = note;
    e.dataTransfer?.setData('text/plain', note.id);
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  }

  protected clearDrag() {
    this.dragging = null;
    this.hint.set(null);
  }

  /** ¿Se puede soltar lo que se arrastra aquí, de esa manera? (Nunca una nota dentro de sí misma ni de sus subpáginas.) */
  private allowed(target: Note, zone: DropZone, list: 'tree' | 'pins'): boolean {
    const d = this.dragging;
    if (!d || d.id === target.id) return false;
    if (list === 'pins') return true;
    const all = this.notas.notes();
    if (zone === 'inside') return !isInside(all, target.id, d.id);
    return !target.parentId || !isInside(all, target.parentId, d.id);
  }

  protected dragOver(e: DragEvent, target: Note, list: 'tree' | 'pins') {
    if (!this.dragging) return;
    const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const zone = dropZone(e.clientY, box.top, box.height, list === 'tree');
    if (!this.allowed(target, zone, list)) {
      this.hint.set(null);
      return;
    }
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    const h = this.hint();
    if (!h || h.id !== target.id || h.zone !== zone) this.hint.set({ id: target.id, zone });
  }

  protected async drop(e: DragEvent, target: Note, list: 'tree' | 'pins') {
    e.preventDefault();
    const d = this.dragging;
    const h = this.hint();
    this.clearDrag();
    if (!d || !h || h.id !== target.id) return;
    try {
      if (list === 'pins') {
        const ids = pinnedNotes(this.notas.notes()).map((n) => n.id);
        await this.notas.setPins(placeNear(ids, d.id, target.id, h.zone === 'inside' ? 'after' : h.zone));
      } else if (h.zone === 'inside') {
        await this.notas.move(d.id, target.id);
        this.nav.expand(target.id);
      } else {
        const parent = target.parentId;
        const siblings = childrenOf(this.notas.notes(), parent).map((n) => n.id);
        const order = placeNear(siblings, d.id, target.id, h.zone);
        if (d.parentId === parent) await this.notas.reorder(order);
        else await this.notas.move(d.id, parent, order);
      }
    } catch (err) {
      this.toasts.error(err instanceof Error && err.message === 'cycle' ? 'No se puede meter un doc dentro de sí mismo ni de sus subpáginas.' : 'No se pudo mover. Revisa tu conexión e intenta de nuevo.');
    }
  }
}
