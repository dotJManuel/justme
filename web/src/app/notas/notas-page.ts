import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Icon } from '../icons/icon';
import { BottomSheet } from '../ui/bottom-sheet';
import { Button } from '../ui/button';
import { EmptyState, ErrorState, Skeleton } from '../ui/states';
import { ToastService } from '../ui/toast';
import { NoteActions } from './notas-actions';
import { preview, searchText } from './notas.blocks';
import { NotasNav } from './notas.nav';
import { Note, NotasService } from './notas.service';
import { Sortable } from './notas.sortable';
import { SORT_MODES, SortMode, mergeOrder, pinnedNotes, shift, sortRoots } from './notas.tree';

const SAVE_ERROR = 'No se pudo completar. Revisa tu conexión e intenta de nuevo.';
const SORT_KEY = 'justme.notas.sort';

function readSort(): SortMode {
  try {
    const v = localStorage.getItem(SORT_KEY);
    return SORT_MODES.some((m) => m.value === v) ? (v as SortMode) : 'recientes';
  } catch {
    return 'recientes';
  }
}

/**
 * Lista de docs: los fijados arriba (en el orden que se les dio) y debajo los demás, ordenados como se elija (recientes, mi
 * orden, título o creación). Casi todo son íconos: ordenar, acomodar, nuevo, fijar y «⋯» (mover o eliminar).
 */
@Component({
  selector: 'app-notas-page',
  imports: [BottomSheet, Button, EmptyState, ErrorState, Icon, NgTemplateOutlet, NoteActions, RouterLink, Skeleton, Sortable],
  template: `
    <div class="page">
      <header>
        <button type="button" class="ib treebtn" aria-label="Abrir el árbol de docs" (click)="nav.drawerOpen.set(true)"><app-icon name="menu" [size]="22" /></button>
        <h1>Docs</h1>
        <span class="grow"></span>
        @if (notas.loaded() && notas.notes().length > 1) {
          @if (!reordering()) {
            <button type="button" class="ib" aria-label="Ordenar por" (click)="sortOpen.set(true)"><app-icon name="list-sort" [size]="22" /></button>
          }
          <button
            type="button" class="ib" [class.on]="reordering()" [attr.aria-pressed]="reordering()"
            [attr.aria-label]="reordering() ? 'Terminar de acomodar' : 'Acomodar a mano'" (click)="toggleReorder()"
          ><app-icon [name]="reordering() ? 'check' : 'sort'" [size]="22" [stroke]="reordering() ? 2.4 : 1.8" /></button>
        }
        @if (!reordering()) {
          <button type="button" class="ib add" aria-label="Nuevo doc" [disabled]="busy()" (click)="create()"><app-icon name="plus" [size]="22" [stroke]="2.4" /></button>
        }
      </header>

      @if (failed()) {
        <ui-error-state message="No se pudieron cargar tus docs" detail="Revisa tu conexión e intenta de nuevo." (retry)="load()" />
      } @else if (!notas.loaded()) {
        <div class="panel" aria-busy="true" aria-label="Cargando">
          <ui-skeleton height="68px" radius="0" /><ui-skeleton height="68px" radius="0" /><ui-skeleton height="68px" radius="0" />
        </div>
      } @else if (!notas.notes().length) {
        <div class="panel">
          <ui-empty-state icon="file-text" title="Aún no hay docs" text="Escribe ideas, listas o pendientes. Se guardan solos.">
            <button uiBtn small type="button" aria-label="Nuevo doc" [disabled]="busy()" (click)="create()"><app-icon name="plus" [size]="18" [stroke]="2.4" /></button>
          </ui-empty-state>
        </div>
      } @else {
        @if (reordering()) {
          @if (pins().length) {
            <div class="sec" role="img" aria-label="Fijados"><app-icon name="pin" [size]="15" [stroke]="2" /><i></i></div>
            <ul class="panel" aria-label="Orden de los docs fijados" [appSortable]="pinIds()" (reordered)="reorderPins($event)">
              @for (n of pins(); track n.id; let i = $index; let c = $count) {
                <ng-container [ngTemplateOutlet]="sortRow" [ngTemplateOutletContext]="{ $implicit: n, index: i, count: c, pinned: true }" />
              }
            </ul>
            @if (shown().length) {
              <div class="sec" role="img" aria-label="Otros docs"><app-icon name="list" [size]="15" [stroke]="2" /><i></i></div>
            }
          }
          <ul class="panel" aria-label="Orden de los docs" [appSortable]="shownIds()" (reordered)="reorderOthers($event)">
            @for (n of shown(); track n.id; let i = $index; let c = $count) {
              <ng-container [ngTemplateOutlet]="sortRow" [ngTemplateOutletContext]="{ $implicit: n, index: i, count: c, pinned: false }" />
            }
          </ul>
        } @else {
          @if (notas.notes().length > 4) {
            <label class="search">
              <app-icon name="search" [size]="18" />
              <span class="sr-only">Buscar docs</span>
              <input type="search" placeholder="Buscar" autocomplete="off" [value]="query()" (input)="query.set($any($event.target).value)" />
            </label>
          }
          @if (showPins()) {
            <div class="sec" role="img" aria-label="Fijados"><app-icon name="pin" [size]="15" [stroke]="2" /><i></i></div>
            <ul class="panel" aria-label="Docs fijados">
              @for (n of pins(); track n.id) {
                <ng-container [ngTemplateOutlet]="row" [ngTemplateOutletContext]="{ $implicit: n }" />
              }
            </ul>
            @if (shown().length) {
              <div class="sec" role="img" aria-label="Otros docs"><app-icon name="list" [size]="15" [stroke]="2" /><i></i></div>
            }
          }
          <ul class="panel" aria-label="Docs">
            @for (n of shown(); track n.id) {
              <ng-container [ngTemplateOutlet]="row" [ngTemplateOutletContext]="{ $implicit: n }" />
            } @empty {
              @if (!showPins()) {
                <li><ui-empty-state icon="search" title="Sin resultados" text="Ningún doc coincide con tu búsqueda." /></li>
              }
            }
          </ul>
        }
      }
    </div>

    <ng-template #row let-n>
      <li class="item">
        <a class="row" [routerLink]="['/notas', n.id]">
          <span class="tile">
            @if (n.icon) {
              <span class="emo">{{ n.icon }}</span>
            } @else {
              <app-icon name="file-text" [size]="20" />
            }
          </span>
          <span class="lt">
            <span class="ln">{{ n.title.trim() || 'Sin título' }}</span>
            @if (snippet(n); as s) {
              <span class="ls">{{ s }}</span>
            }
            <span class="meta">
              <span>{{ when(n.updatedAt) }}</span>
              @if (subCount(n); as k) {
                <span class="mi" [attr.aria-label]="k + (k === 1 ? ' subpágina' : ' subpáginas')"><app-icon name="folder" [size]="13" [stroke]="2" />{{ k }}</span>
              }
              @if (query().trim() && n.parentId) {
                <span class="mi" [attr.aria-label]="'En ' + parentName(n)"><app-icon name="folder" [size]="13" [stroke]="2" />{{ parentName(n) }}</span>
              }
              @if (notas.lockedByOther(n)) {
                <app-icon name="lock" [size]="13" [stroke]="2" aria-label="Se está editando en otro lugar" />
              }
            </span>
          </span>
        </a>
        <button
          type="button" class="act pin" [class.on]="n.pinOrder !== null" [attr.aria-pressed]="n.pinOrder !== null"
          [attr.aria-label]="(n.pinOrder !== null ? 'Quitar de fijados: ' : 'Fijar: ') + (n.title.trim() || 'doc sin título')" (click)="togglePin(n)"
        ><app-icon name="pin" [size]="19" /></button>
        <button type="button" class="act" [attr.aria-label]="'Más opciones de ' + (n.title.trim() || 'doc sin título')" (click)="actionsFor.set(n.id)"><app-icon name="more" [size]="19" /></button>
      </li>
    </ng-template>

    <ng-template #sortRow let-n let-i="index" let-count="count" let-pinned="pinned">
      <li class="item sortitem" [attr.data-sort-id]="n.id">
        <button
          type="button" class="grip" data-sort-handle
          [attr.aria-label]="'Mover ' + (n.title.trim() || 'doc sin título') + ': arrastra, o usa las flechas arriba y abajo del teclado'"
        ><app-icon name="grip" [size]="20" [stroke]="2.6" /></button>
        <span class="row static">
          <span class="tile">
            @if (n.icon) {
              <span class="emo">{{ n.icon }}</span>
            } @else {
              <app-icon name="file-text" [size]="20" />
            }
          </span>
          <span class="lt"><span class="ln">{{ n.title.trim() || 'Sin título' }}</span></span>
        </span>
        <button type="button" class="act" [disabled]="i === 0" [attr.aria-label]="'Subir ' + (n.title.trim() || 'doc sin título')" (click)="step(n.id, -1, pinned)"><app-icon name="arrow-up" [size]="20" /></button>
        <button type="button" class="act" [disabled]="i === count - 1" [attr.aria-label]="'Bajar ' + (n.title.trim() || 'doc sin título')" (click)="step(n.id, 1, pinned)"><app-icon name="arrow-down" [size]="20" /></button>
      </li>
    </ng-template>

    <ui-bottom-sheet title="Ordenar por" [(open)]="sortOpen">
      <div class="opts" role="radiogroup" aria-label="Ordenar por">
        @for (m of sortModes; track m.value) {
          <button type="button" role="radio" [attr.aria-checked]="sort() === m.value" (click)="pickSort(m.value)">
            {{ m.label }}
            @if (sort() === m.value) {
              <app-icon class="chk" name="check" [size]="18" [stroke]="2.4" />
            }
          </button>
        }
      </div>
    </ui-bottom-sheet>

    <app-note-actions [(noteId)]="actionsFor" />
  `,
  styles: `
    :host { display: block; }
    .page { display: flex; flex-direction: column; gap: var(--sp-4); max-width: 720px; margin: 0 auto; padding: var(--sp-4) var(--sp-4) var(--sp-6); }
    header { display: flex; align-items: center; gap: 2px; min-height: 48px; }
    .grow { flex: 1; }
    h1 { font-size: 28px; line-height: 36px; font-weight: 700; letter-spacing: -0.02em; }
    /* Botones de solo ícono: todos del mismo tamaño y centrados. */
    .ib { display: grid; place-items: center; flex: none; width: var(--touch); height: var(--touch); padding: 0; border: 0; border-radius: var(--rf-3); background: none; color: var(--tx2); cursor: pointer; }
    .ib:hover:not(:disabled) { background: var(--s2); color: var(--tx); }
    .ib.on { background: var(--acs); color: var(--ac); }
    .ib.add { margin-left: 4px; background: var(--ac); color: var(--onac); }
    .ib.add:hover:not(:disabled) { background: var(--ach); color: var(--onac); }
    .treebtn { margin-left: -8px; margin-right: 2px; }
    @media (min-width: 1024px) { .treebtn { display: none; } }
    .search {
      display: flex; align-items: center; gap: 10px; height: var(--touch); padding: 0 14px; border-radius: var(--rf-3); background: var(--sf);
      box-shadow: inset 0 0 0 1px var(--bd); color: var(--tx3);
    }
    .search:focus-within { box-shadow: inset 0 0 0 1px var(--ac); }
    .search input { flex: 1; min-width: 0; height: 100%; padding: 0; border: 0; outline: 0; background: none; color: var(--tx); font: inherit; font-size: 15px; }
    .search input::placeholder { color: var(--tx3); }
    .sec { display: flex; align-items: center; gap: 10px; margin: 2px 4px -6px; color: var(--tx3); }
    .sec i { flex: 1; height: 1px; background: var(--bd); }
    .panel { position: relative; display: flex; flex-direction: column; margin: 0; padding: 0; list-style: none; border-radius: var(--rf-3); background: var(--sf); box-shadow: var(--sh1), inset 0 0 0 1px var(--bd); overflow: hidden; }
    .item { display: flex; align-items: center; background: var(--sf); }
    .item + .item { border-top: 1px solid var(--bd); }
    .row { display: flex; align-items: center; gap: 12px; flex: 1; min-width: 0; min-height: 68px; padding: 10px 4px 10px 14px; color: inherit; text-decoration: none; }
    .row:hover { background: var(--s2); }
    .tile { display: grid; place-items: center; flex: none; width: 40px; height: 40px; border-radius: 10px; background: var(--s2); color: var(--tx2); }
    .emo { font-size: 21px; line-height: 1; }
    .lt { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
    .ln { font-size: 15px; line-height: 20px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .ls { font-size: 13px; line-height: 18px; color: var(--tx2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .meta { display: flex; align-items: center; gap: 10px; min-width: 0; font-size: 12px; line-height: 16px; color: var(--tx3); }
    .mi { display: inline-flex; align-items: center; gap: 4px; min-width: 0; max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .act { display: grid; place-items: center; flex: none; width: 40px; height: var(--touch); border: 0; border-radius: var(--rf-2); background: none; color: var(--tx3); cursor: pointer; }
    .act:last-child { margin-right: 4px; }
    .act:hover:not(:disabled) { background: var(--s2); color: var(--tx); }
    .act:disabled { opacity: 0.35; cursor: default; }
    .pin.on { background: var(--acs); color: var(--ac); }

    /* Acomodar a mano */
    .sortitem { position: relative; touch-action: manipulation; }
    .sortitem.dragging { border-radius: var(--rf-2); }
    .grip {
      display: grid; place-items: center; flex: none; width: 48px; align-self: stretch; min-height: 64px; margin: 0; padding: 0; border: 0; background: none; color: var(--tx3);
      cursor: grab; touch-action: none; -webkit-user-select: none; user-select: none;
    }
    .grip:hover, .grip:focus-visible { background: var(--s2); color: var(--tx); }
    .sorting .grip { cursor: grabbing; }
    .row.static { cursor: default; padding-left: 4px; min-height: 64px; }
    .row.static:hover { background: none; }

    /* Hoja de «Ordenar por» */
    .opts { display: flex; flex-direction: column; }
    .opts button {
      display: flex; align-items: center; justify-content: space-between; gap: 12px; width: 100%; min-height: var(--touch); padding: 0 14px; border: 0; border-radius: var(--rf-2);
      background: none; color: var(--tx); font: inherit; font-size: 15px; text-align: left; cursor: pointer;
    }
    .opts button:hover { background: var(--s2); }
    .opts button[aria-checked='true'] { font-weight: 600; }
    .chk { color: var(--ac); }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotasPage implements OnInit {
  protected readonly notas = inject(NotasService);
  protected readonly nav = inject(NotasNav);
  private readonly router = inject(Router);
  private readonly toasts = inject(ToastService);

  protected readonly failed = signal(false);
  protected readonly busy = signal(false);
  protected readonly query = signal('');
  protected readonly actionsFor = signal<string | null>(null);
  protected readonly sortOpen = signal(false);
  /** Modo «Acomodar a mano»: asas para arrastrar y flechas en cada fila. */
  protected readonly reordering = signal(false);
  private changed = false;

  protected readonly sortModes = SORT_MODES;
  protected readonly sort = signal<SortMode>(readSort());

  protected readonly pins = computed(() => pinnedNotes(this.notas.notes()));
  protected readonly searching = computed(() => this.query().trim() !== '');
  protected readonly showPins = computed(() => !this.searching() && this.pins().length > 0);

  /** Los de abajo: buscando, todos los que coincidan; si no, los del nivel principal en el orden elegido (sin los fijados, que van arriba). */
  protected readonly shown = computed(() => {
    const q = this.query().trim().toLowerCase();
    const all = this.notas.notes();
    if (q) return all.filter((n) => searchText(n.title, n.blocks).includes(q));
    // Acomodando, se ven en «Mi orden»: es el único orden que se puede acomodar a mano.
    return sortRoots(all, this.reordering() ? 'manual' : this.sort()).filter((n) => n.pinOrder === null);
  });

  protected readonly pinIds = computed(() => this.pins().map((n) => n.id));
  protected readonly shownIds = computed(() => this.shown().map((n) => n.id));

  constructor() {
    effect(() => {
      const v = this.sort();
      try {
        localStorage.setItem(SORT_KEY, v);
      } catch {
        /* se recuerda solo mientras dure la sesión */
      }
    });
  }

  ngOnInit() {
    this.load();
  }

  protected load() {
    this.failed.set(false);
    this.notas.load().catch(() => this.failed.set(true));
  }

  protected pickSort(value: SortMode) {
    this.sort.set(value);
    this.sortOpen.set(false);
  }

  protected toggleReorder() {
    if (this.reordering()) {
      this.reordering.set(false);
      // Si se acomodaron docs, la lista pasa a «Mi orden» para que se vea justo como quedó.
      if (this.changed && this.sort() !== 'manual') {
        this.sort.set('manual');
        this.toasts.show({ message: 'Orden guardado · se muestran en «Mi orden»' });
      }
      this.changed = false;
      return;
    }
    this.query.set('');
    this.reordering.set(true);
  }

  protected async reorderPins(ids: string[]) {
    try {
      this.changed = true;
      await this.notas.setPins(ids);
    } catch {
      this.toasts.error(SAVE_ERROR);
    }
  }

  /** Reordena los de abajo sin mover los fijados (que no se ven ahí pero ocupan su lugar en el orden manual). */
  protected async reorderOthers(ids: string[]) {
    const full = sortRoots(this.notas.notes(), 'manual').map((n) => n.id);
    try {
      this.changed = true;
      await this.notas.reorder(mergeOrder(full, this.shownIds(), ids));
    } catch {
      this.toasts.error(SAVE_ERROR);
    }
  }

  /** Las flechas de cada fila: un lugar arriba o abajo. */
  protected step(id: string, dir: -1 | 1, pinned: boolean) {
    if (pinned) void this.reorderPins(shift(this.pinIds(), id, dir));
    else void this.reorderOthers(shift(this.shownIds(), id, dir));
  }

  protected snippet(n: Note): string {
    return preview(n.blocks);
  }

  protected subCount(n: Note): number {
    return this.notas.children(n.id).length;
  }

  protected parentName(n: Note): string {
    return this.notas.byId(n.parentId)?.title.trim() || 'Sin título';
  }

  protected when(iso: string): string {
    const d = new Date(iso);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) return `Hoy, ${d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false })}`;
    return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
  }

  protected async togglePin(n: Note) {
    try {
      await this.notas.togglePin(n.id);
    } catch {
      this.toasts.error(SAVE_ERROR);
    }
  }

  protected async create() {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      const note = await this.notas.create();
      await this.router.navigate(['/notas', note.id]);
    } catch {
      this.toasts.error(SAVE_ERROR);
    } finally {
      this.busy.set(false);
    }
  }
}
