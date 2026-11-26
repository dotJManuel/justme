import { ChangeDetectionStrategy, Component, computed, effect, inject, model, signal, untracked } from '@angular/core';
import { Router } from '@angular/router';
import { Icon } from '../icons/icon';
import { BottomSheet } from '../ui/bottom-sheet';
import { ConfirmDialog } from '../ui/confirm-dialog';
import { ToastService } from '../ui/toast';
import { NotasNav } from './notas.nav';
import { NotasService } from './notas.service';
import { childrenOf, isInside, pinnedNotes, shift, visibleRows } from './notas.tree';

type Mode = 'menu' | 'move' | 'delete';

/**
 * Lo que se puede hacer con una nota: fijarla, acomodarla, crearle una subpágina, moverla dentro de otra (agrupar) o
 * eliminarla. Se abre con el id de la nota (`[(noteId)]`) y se cierra solo al terminar.
 */
@Component({
  selector: 'app-note-actions',
  imports: [BottomSheet, ConfirmDialog, Icon],
  template: `
    <ui-bottom-sheet [title]="title()" [open]="mode() === 'menu' && noteId() !== null" (openChange)="closed('menu', $event)">
      <div class="list">
        <button type="button" (click)="pin()"><app-icon name="pin" [size]="18" />{{ note()?.pinOrder !== null ? 'Quitar de fijados' : 'Fijar arriba' }}</button>
        @if (note()?.pinOrder !== null) {
          <button type="button" [disabled]="!canPinShift(-1)" (click)="pinShift(-1)"><app-icon name="arrow-up" [size]="18" />Subir entre los fijados</button>
          <button type="button" [disabled]="!canPinShift(1)" (click)="pinShift(1)"><app-icon name="arrow-down" [size]="18" />Bajar entre los fijados</button>
        }
        <button type="button" (click)="newSub()"><app-icon name="plus" [size]="18" />Nueva subpágina</button>
        <button type="button" (click)="mode.set('move')"><app-icon name="folder" [size]="18" />Mover a…</button>
        <button type="button" [disabled]="!canShift(-1)" (click)="shiftSibling(-1)"><app-icon name="arrow-up" [size]="18" />Subir en mi orden</button>
        <button type="button" [disabled]="!canShift(1)" (click)="shiftSibling(1)"><app-icon name="arrow-down" [size]="18" />Bajar en mi orden</button>
        <button type="button" class="danger" (click)="mode.set('delete')"><app-icon name="trash" [size]="18" />Eliminar</button>
      </div>
    </ui-bottom-sheet>

    <ui-bottom-sheet title="Mover a…" [open]="mode() === 'move' && noteId() !== null" (openChange)="closed('move', $event)">
      <div class="list" role="listbox" aria-label="Destino">
        <button type="button" role="option" [attr.aria-selected]="!note()?.parentId" [disabled]="!note()?.parentId" (click)="moveTo(null)">
          <app-icon name="file-text" [size]="18" />Nivel principal
          @if (!note()?.parentId) {
            <span class="here">Aquí está</span>
          }
        </button>
        @for (r of destinations(); track r.note.id) {
          <button type="button" role="option" [style.padding-left.px]="14 + r.depth * 18" [attr.aria-selected]="note()?.parentId === r.note.id" [disabled]="note()?.parentId === r.note.id" (click)="moveTo(r.note.id)">
            <span class="emo" aria-hidden="true">{{ r.note.icon || '📄' }}</span>{{ r.note.title.trim() || 'Sin título' }}
            @if (note()?.parentId === r.note.id) {
              <span class="here">Aquí está</span>
            }
          </button>
        }
      </div>
    </ui-bottom-sheet>

    <ui-confirm-dialog
      [open]="mode() === 'delete' && noteId() !== null" (openChange)="closed('delete', $event)" [title]="'¿Eliminar «' + title() + '»?'" [message]="deleteMessage()"
      confirmLabel="Eliminar" [busy]="busy()" (confirmed)="remove()"
    />
  `,
  styles: `
    .list { display: flex; flex-direction: column; }
    .list button {
      display: flex; align-items: center; gap: 12px; width: 100%; min-height: var(--touch); padding: 0 14px; border: 0; border-radius: var(--rf-2); background: none;
      color: var(--tx); font: inherit; font-size: 15px; text-align: left; cursor: pointer;
    }
    .list button:hover:not(:disabled) { background: var(--s2); }
    .list button:disabled { color: var(--tx3); cursor: default; }
    .list .danger { color: var(--rd); }
    .list .danger:hover { background: var(--rds) !important; }
    .emo { display: inline-grid; place-items: center; width: 20px; font-size: 16px; }
    .here { margin-left: auto; font-size: 12px; color: var(--tx3); }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NoteActions {
  /** La nota sobre la que se actúa; null = cerrado. */
  readonly noteId = model<string | null>(null);

  private readonly notas = inject(NotasService);
  private readonly nav = inject(NotasNav);
  private readonly router = inject(Router);
  private readonly toasts = inject(ToastService);

  protected readonly mode = signal<Mode>('menu');
  protected readonly busy = signal(false);

  protected readonly note = computed(() => this.notas.byId(this.noteId()));
  protected readonly title = computed(() => this.note()?.title.trim() || 'Sin título');

  /** Notas a donde se puede mover: todas menos esta y las que están dentro de ella, con todo el árbol desplegado. */
  protected readonly destinations = computed(() => {
    const id = this.noteId();
    if (!id) return [];
    const all = this.notas.notes();
    const ok = all.filter((n) => !isInside(all, n.id, id));
    return visibleRows(ok, new Set(ok.map((n) => n.id)));
  });

  protected readonly deleteMessage = computed(() => {
    const id = this.noteId();
    const subs = id ? this.notas.descendants(id).length : 0;
    return subs
      ? `El doc se borra para siempre, junto con sus ${subs} subpágina${subs === 1 ? '' : 's'}; no se puede recuperar.`
      : 'El doc se borra para siempre; no se puede recuperar.';
  });

  constructor() {
    // Cada vez que se abre para otra nota, empieza en el menú.
    effect(() => {
      if (this.noteId()) untracked(() => this.mode.set('menu'));
    });
  }

  /** Una hoja se cerró. Solo cuenta si era la que se estaba viendo: al pasar de una a otra la anterior también se cierra, y eso no debe cerrar todo. */
  protected closed(which: Mode, open: boolean) {
    if (!open && this.mode() === which) this.noteId.set(null);
  }

  private fail(e: unknown, fallback: string) {
    this.toasts.error(e instanceof Error && e.message === 'cycle' ? 'No se puede meter un doc dentro de sí mismo ni de sus subpáginas.' : fallback);
  }

  // ── Fijadas ────────────────────────────────────────────────────────────────

  protected async pin() {
    const id = this.noteId();
    const wasPinned = this.note()?.pinOrder !== null;
    if (!id) return;
    this.noteId.set(null);
    try {
      await this.notas.togglePin(id);
      this.toasts.show({ message: wasPinned ? 'Se quitó de los fijados' : 'Doc fijado' });
    } catch (e) {
      this.fail(e, 'No se pudo fijar. Revisa tu conexión e intenta de nuevo.');
    }
  }

  private pinIds(): string[] {
    return pinnedNotes(this.notas.notes()).map((n) => n.id);
  }

  protected canPinShift(dir: -1 | 1): boolean {
    const id = this.noteId();
    return !!id && shift(this.pinIds(), id, dir).join() !== this.pinIds().join();
  }

  protected async pinShift(dir: -1 | 1) {
    const id = this.noteId();
    if (!id) return;
    try {
      await this.notas.setPins(shift(this.pinIds(), id, dir));
    } catch (e) {
      this.fail(e, 'No se pudo cambiar el orden. Revisa tu conexión e intenta de nuevo.');
    }
  }

  // ── Orden entre hermanas ───────────────────────────────────────────────────

  private siblingIds(): string[] {
    const n = this.note();
    return n ? childrenOf(this.notas.notes(), n.parentId).map((x) => x.id) : [];
  }

  protected canShift(dir: -1 | 1): boolean {
    const id = this.noteId();
    return !!id && shift(this.siblingIds(), id, dir).join() !== this.siblingIds().join();
  }

  protected async shiftSibling(dir: -1 | 1) {
    const id = this.noteId();
    if (!id) return;
    try {
      await this.notas.reorder(shift(this.siblingIds(), id, dir));
    } catch (e) {
      this.fail(e, 'No se pudo cambiar el orden. Revisa tu conexión e intenta de nuevo.');
    }
  }

  // ── Crear dentro, mover, eliminar ──────────────────────────────────────────

  protected async newSub() {
    const id = this.noteId();
    if (!id) return;
    this.noteId.set(null);
    try {
      const child = await this.notas.create(id);
      this.nav.expand(id);
      await this.router.navigate(['/notas', child.id]);
    } catch (e) {
      this.fail(e, 'No se pudo crear la subpágina. Revisa tu conexión e intenta de nuevo.');
    }
  }

  protected async moveTo(parentId: string | null) {
    const id = this.noteId();
    if (!id) return;
    this.noteId.set(null);
    try {
      await this.notas.move(id, parentId);
      if (parentId) this.nav.expand(parentId);
      this.toasts.show({ message: parentId ? 'Doc movido' : 'Doc movido al nivel principal' });
    } catch (e) {
      this.fail(e, 'No se pudo mover. Revisa tu conexión e intenta de nuevo.');
    }
  }

  protected async remove() {
    const id = this.noteId();
    if (!id) return;
    this.busy.set(true);
    // Si se está viendo la nota (o una de sus subpáginas), al borrarla se vuelve a la lista.
    const here = this.router.url.match(/^\/notas\/([^/?#]+)/)?.[1];
    const affected = here ? isInside(this.notas.notes(), here, id) : false;
    try {
      await this.notas.remove(id);
      this.toasts.show({ message: 'Doc eliminado' });
      this.noteId.set(null);
      if (affected) await this.router.navigate(['/notas']);
    } catch {
      this.toasts.error('No se pudo eliminar. Revisa tu conexión e intenta de nuevo.');
    } finally {
      this.busy.set(false);
    }
  }
}
