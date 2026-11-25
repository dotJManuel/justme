import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Icon } from '../icons/icon';
import { Button } from '../ui/button';
import { Option, Select } from '../ui/fields';
import { Input } from '../ui/input';
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
 * Lista de notas: las fijadas arriba (en el orden que se les dio) y debajo las demás, ordenadas como se elija (recientes, mi
 * orden, título o creación). Con buscador y «⋯» para acomodar, mover o eliminar cada una.
 */
@Component({
  selector: 'app-notas-page',
  imports: [Button, EmptyState, ErrorState, Icon, Input, NgTemplateOutlet, NoteActions, RouterLink, Select, Skeleton, Sortable],
  template: `
    <div class="page">
      <header>
        <button type="button" class="tool treebtn" aria-label="Abrir el árbol de notas" (click)="nav.drawerOpen.set(true)"><app-icon name="menu" [size]="20" /></button>
        <h1>Notas</h1>
        <span class="grow"></span>
        @if (notas.loaded() && notas.notes().length > 1) {
          <button uiBtn small [variant]="reordering() ? 'primary' : 'secondary'" type="button" (click)="toggleReorder()">
            @if (reordering()) {
              <app-icon name="check" [size]="16" [stroke]="2.4" />Listo
            } @else {
              <app-icon name="sort" [size]="16" />Ordenar
            }
          </button>
        }
        @if (!reordering()) {
          <button uiBtn small type="button" [disabled]="busy()" (click)="create()"><app-icon name="plus" [size]="16" />Nueva nota</button>
        }
      </header>

      @if (failed()) {
        <ui-error-state message="No se pudieron cargar tus notas" detail="Revisa tu conexión e intenta de nuevo." (retry)="load()" />
      } @else if (!notas.loaded()) {
        <div class="panel" aria-busy="true" aria-label="Cargando notas">
          <ui-skeleton height="72px" radius="0" /><ui-skeleton height="72px" radius="0" /><ui-skeleton height="72px" radius="0" />
        </div>
      } @else if (!notas.notes().length) {
        <div class="panel">
          <ui-empty-state icon="file-text" title="Aún no hay notas" text="Escribe ideas, listas o pendientes. Se guardan solas.">
            <button uiBtn small type="button" [disabled]="busy()" (click)="create()"><app-icon name="plus" [size]="16" />Nueva nota</button>
          </ui-empty-state>
        </div>
      } @else {
        @if (reordering()) {
          <p class="hint" role="status">
            Arrastra <app-icon name="grip" [size]="16" [stroke]="2.6" /> para mover una nota, o usa las flechas. Se guarda sola.
          </p>
          @if (pins().length) {
            <h2 class="sec">Fijadas</h2>
            <ul class="panel" aria-label="Orden de las notas fijadas" [appSortable]="pinIds()" (reordered)="reorderPins($event)">
              @for (n of pins(); track n.id; let i = $index; let c = $count) {
                <ng-container [ngTemplateOutlet]="sortRow" [ngTemplateOutletContext]="{ $implicit: n, index: i, count: c, pinned: true }" />
              }
            </ul>
            @if (shown().length) {
              <h2 class="sec">Otras notas</h2>
            }
          }
          <ul class="panel" aria-label="Orden de las notas" [appSortable]="shownIds()" (reordered)="reorderOthers($event)">
            @for (n of shown(); track n.id; let i = $index; let c = $count) {
              <ng-container [ngTemplateOutlet]="sortRow" [ngTemplateOutletContext]="{ $implicit: n, index: i, count: c, pinned: false }" />
            }
          </ul>
        } @else {
          <div class="controls">
            @if (notas.notes().length > 4) {
              <ui-input label="Buscar" type="search" placeholder="Título o contenido" [(value)]="query" autocomplete="off" />
            }
            <ui-select label="Ordenar por" [options]="sortOptions" [value]="sort()" (valueChange)="setSort($event)" />
          </div>

          @if (showPins()) {
            <h2 class="sec">Fijadas</h2>
            <ul class="panel" aria-label="Notas fijadas">
              @for (n of pins(); track n.id) {
                <ng-container [ngTemplateOutlet]="row" [ngTemplateOutletContext]="{ $implicit: n }" />
              }
            </ul>
            @if (shown().length) {
              <h2 class="sec">Otras notas</h2>
            }
          }
          <ul class="panel" aria-label="Notas">
            @for (n of shown(); track n.id) {
              <ng-container [ngTemplateOutlet]="row" [ngTemplateOutletContext]="{ $implicit: n }" />
            } @empty {
              @if (!showPins()) {
                <li><ui-empty-state icon="search" title="Sin resultados" text="Ninguna nota coincide con tu búsqueda." /></li>
              }
            }
          </ul>

        }
      }
    </div>

    <ng-template #row let-n>
      <li class="item">
        <a class="row" [routerLink]="['/notas', n.id]">
          <span class="ico">
            @if (n.icon) {
              <span class="emo">{{ n.icon }}</span>
            } @else {
              <app-icon name="file-text" [size]="18" />
            }
          </span>
          <span class="lt">
            <span class="ln">{{ n.title.trim() || 'Sin título' }}</span>
            <span class="ls">{{ snippet(n) || 'Nota vacía' }}</span>
            <span class="when">
              {{ when(n.updatedAt) }}
              @if (subCount(n); as k) {
                · {{ k }} subpágina{{ k === 1 ? '' : 's' }}
              }
              @if (query().trim() && n.parentId) {
                · en {{ parentName(n) }}
              }
              @if (notas.lockedByOther(n)) {
                · <app-icon name="lock" [size]="12" /> Se está editando en otro lugar
              }
            </span>
          </span>
        </a>
        <button
          type="button" class="act pin" [class.on]="n.pinOrder !== null" [attr.aria-pressed]="n.pinOrder !== null"
          [attr.aria-label]="(n.pinOrder !== null ? 'Quitar de fijadas: ' : 'Fijar: ') + (n.title.trim() || 'nota sin título')" (click)="togglePin(n)"
        ><app-icon name="pin" [size]="18" /></button>
        <button type="button" class="act" [attr.aria-label]="'Más opciones de ' + (n.title.trim() || 'nota sin título')" (click)="actionsFor.set(n.id)"><app-icon name="more" [size]="18" /></button>
      </li>
    </ng-template>

    <ng-template #sortRow let-n let-i="index" let-count="count" let-pinned="pinned">
      <li class="item sortitem" [attr.data-sort-id]="n.id">
        <button
          type="button" class="grip" data-sort-handle
          [attr.aria-label]="'Mover ' + (n.title.trim() || 'nota sin título') + ': arrastra, o usa las flechas arriba y abajo del teclado'"
        ><app-icon name="grip" [size]="20" [stroke]="2.6" /></button>
        <span class="row static">
          <span class="ico">
            @if (n.icon) {
              <span class="emo">{{ n.icon }}</span>
            } @else {
              <app-icon name="file-text" [size]="18" />
            }
          </span>
          <span class="lt"><span class="ln">{{ n.title.trim() || 'Sin título' }}</span></span>
        </span>
        <button type="button" class="act big" [disabled]="i === 0" [attr.aria-label]="'Subir ' + (n.title.trim() || 'nota sin título')" (click)="step(n.id, -1, pinned)"><app-icon name="arrow-up" [size]="20" /></button>
        <button type="button" class="act big" [disabled]="i === count - 1" [attr.aria-label]="'Bajar ' + (n.title.trim() || 'nota sin título')" (click)="step(n.id, 1, pinned)"><app-icon name="arrow-down" [size]="20" /></button>
      </li>
    </ng-template>

    <app-note-actions [(noteId)]="actionsFor" />
  `,
  styles: `
    :host { display: block; }
    .page { display: flex; flex-direction: column; gap: var(--sp-4); max-width: 720px; margin: 0 auto; padding: var(--sp-5) var(--sp-4) var(--sp-6); }
    header { display: flex; align-items: center; gap: var(--sp-2); }
    .grow { flex: 1; }
    h1 { font-size: 28px; line-height: 36px; font-weight: 700; letter-spacing: -0.02em; }
    .tool { display: grid; place-items: center; width: var(--touch); height: var(--touch); margin-left: -8px; border: 0; border-radius: var(--rf-2); background: none; color: var(--tx2); cursor: pointer; }
    .tool:hover { background: var(--s2); color: var(--tx); }
    @media (min-width: 1024px) { .treebtn { display: none; } }
    .controls { display: grid; grid-template-columns: 1fr; gap: var(--sp-3); }
    @media (min-width: 560px) { .controls:has(ui-input) { grid-template-columns: 1fr 200px; } }
    .sec { margin-bottom: -8px; padding: 0 4px; font-size: 13px; line-height: 16px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: var(--tx3); }
    .panel { display: flex; flex-direction: column; margin: 0; padding: 0; list-style: none; border-radius: var(--rf-3); background: var(--sf); box-shadow: var(--sh1), inset 0 0 0 1px var(--bd); overflow: hidden; }
    .item { display: flex; align-items: center; }
    .item + .item { border-top: 1px solid var(--bd); }
    .row { display: flex; align-items: center; gap: 12px; flex: 1; min-width: 0; min-height: 72px; padding: 12px 4px 12px 16px; color: inherit; text-decoration: none; }
    .row:hover { background: var(--s2); }
    .ico { display: grid; place-items: center; flex: none; width: 36px; height: 36px; border-radius: 8px; background: var(--s2); color: var(--tx2); }
    .emo { font-size: 20px; line-height: 1; }
    .lt { display: flex; flex-direction: column; flex: 1; min-width: 0; }
    .ln { font-size: 15px; line-height: 20px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .ls { font-size: 13px; line-height: 18px; color: var(--tx2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .when { font-size: 12px; line-height: 16px; color: var(--tx3); }
    .act { display: grid; place-items: center; flex: none; width: 40px; height: var(--touch); border: 0; border-radius: var(--rf-2); background: none; color: var(--tx3); cursor: pointer; }
    .act:last-child { margin-right: 4px; }
    .act:hover { background: var(--s2); color: var(--tx); }
    .pin.on { background: var(--acs); color: var(--ac); }
    .hint { display: flex; align-items: center; flex-wrap: wrap; gap: 4px; padding: 10px 14px; border-radius: var(--rf-3); background: var(--acs); color: var(--ac); font-size: 14px; line-height: 20px; }

    /* Modo ordenar */
    .panel { position: relative; }
    .sortitem { position: relative; background: var(--sf); touch-action: manipulation; }
    .sortitem.dragging { border-radius: var(--rf-2); }
    .grip {
      display: grid; place-items: center; flex: none; width: 48px; align-self: stretch; min-height: 64px; margin: 0; padding: 0; border: 0; background: none; color: var(--tx3);
      cursor: grab; touch-action: none; -webkit-user-select: none; user-select: none;
    }
    .grip:hover, .grip:focus-visible { background: var(--s2); color: var(--tx); }
    .sorting .grip { cursor: grabbing; }
    .row.static { cursor: default; padding-left: 4px; min-height: 64px; }
    .row.static:hover { background: none; }
    .act.big { width: 44px; height: 48px; }
    .act:disabled { opacity: 0.35; cursor: default; }
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
  /** Modo «Ordenar»: asas para arrastrar y flechas en cada fila. */
  protected readonly reordering = signal(false);
  private changed = false;

  protected readonly sortOptions: Option[] = SORT_MODES.map((m) => ({ value: m.value, label: m.label }));
  protected readonly sort = signal<SortMode>(readSort());

  protected readonly pins = computed(() => pinnedNotes(this.notas.notes()));
  protected readonly searching = computed(() => this.query().trim() !== '');
  protected readonly showPins = computed(() => !this.searching() && this.pins().length > 0);

  /** Las notas de abajo: buscando, todas las que coincidan; si no, las del nivel principal en el orden elegido (sin las fijadas, que van arriba). */
  protected readonly shown = computed(() => {
    const q = this.query().trim().toLowerCase();
    const all = this.notas.notes();
    if (q) return all.filter((n) => searchText(n.title, n.blocks).includes(q));
    // Ordenando, las notas se ven en «Mi orden»: es el único orden que se puede acomodar a mano.
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

  protected toggleReorder() {
    if (this.reordering()) {
      this.reordering.set(false);
      // Si se acomodaron notas, la lista pasa a «Mi orden» para que se vea justo como quedó.
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

  /** Reordena las notas de abajo sin mover las fijadas (que no se ven ahí pero ocupan su lugar en el orden manual). */
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

  protected setSort(value: string) {
    if (SORT_MODES.some((m) => m.value === value)) this.sort.set(value as SortMode);
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
