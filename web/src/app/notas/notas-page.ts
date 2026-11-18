import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Icon } from '../icons/icon';
import { Button } from '../ui/button';
import { ConfirmDialog } from '../ui/confirm-dialog';
import { Input } from '../ui/input';
import { EmptyState, ErrorState, Skeleton } from '../ui/states';
import { ToastService } from '../ui/toast';
import { preview } from './notas.blocks';
import { Note, NotasService } from './notas.service';

const SAVE_ERROR = 'No se pudo completar. Revisa tu conexión e intenta de nuevo.';

/** Lista de notas: las más recientes primero, con buscador, "Nueva nota" y borrar. */
@Component({
  selector: 'app-notas-page',
  imports: [Button, ConfirmDialog, EmptyState, ErrorState, Icon, Input, RouterLink, Skeleton],
  template: `
    <div class="page">
      <header>
        <h1>Notas</h1>
        <button uiBtn small type="button" [disabled]="busy()" (click)="create()"><app-icon name="plus" [size]="16" />Nueva nota</button>
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
        @if (notas.notes().length > 4) {
          <ui-input label="Buscar" type="search" placeholder="Título o contenido" [(value)]="query" autocomplete="off" />
        }
        <ul class="panel" aria-label="Notas">
          @for (n of shown(); track n.id) {
            <li class="item">
              <a class="row" [routerLink]="['/notas', n.id]">
                <span class="ico"><app-icon name="file-text" [size]="18" /></span>
                <span class="lt">
                  <span class="ln">{{ n.title.trim() || 'Sin título' }}</span>
                  <span class="ls">{{ snippet(n) || 'Nota vacía' }}</span>
                  <span class="when">
                    {{ when(n.updatedAt) }}
                    @if (notas.lockedByOther(n)) {
                      · <app-icon name="lock" [size]="12" /> Se está editando en otro lugar
                    }
                  </span>
                </span>
                <app-icon class="chev" name="chevron-right" [size]="16" />
              </a>
              <button type="button" class="del" [attr.aria-label]="'Eliminar ' + (n.title.trim() || 'nota sin título')" (click)="ask(n)"><app-icon name="trash" [size]="18" /></button>
            </li>
          } @empty {
            <li><ui-empty-state icon="search" title="Sin resultados" text="Ninguna nota coincide con tu búsqueda." /></li>
          }
        </ul>
      }
    </div>

    <ui-confirm-dialog
      [(open)]="asking" [title]="'¿Eliminar «' + (removing()?.title?.trim() || 'Sin título') + '»?'"
      message="La nota se borra para siempre; no se puede recuperar." confirmLabel="Eliminar" [busy]="busy()" (confirmed)="remove()"
    />
  `,
  styles: `
    :host { display: block; }
    .page { display: flex; flex-direction: column; gap: var(--sp-4); max-width: 720px; margin: 0 auto; padding: var(--sp-5) var(--sp-4) var(--sp-6); }
    header { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-4); }
    h1 { font-size: 28px; line-height: 36px; font-weight: 700; letter-spacing: -0.02em; }
    .panel { display: flex; flex-direction: column; margin: 0; padding: 0; list-style: none; border-radius: var(--rf-3); background: var(--sf); box-shadow: var(--sh1), inset 0 0 0 1px var(--bd); overflow: hidden; }
    .item { display: flex; align-items: center; }
    .item + .item { border-top: 1px solid var(--bd); }
    .row { display: flex; align-items: center; gap: 12px; flex: 1; min-width: 0; min-height: 72px; padding: 12px 8px 12px 16px; color: inherit; text-decoration: none; }
    .row:hover { background: var(--s2); }
    .ico { display: grid; place-items: center; flex: none; width: 36px; height: 36px; border-radius: 8px; background: var(--s2); color: var(--tx2); }
    .lt { display: flex; flex-direction: column; flex: 1; min-width: 0; }
    .ln { font-size: 15px; line-height: 20px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .ls { font-size: 13px; line-height: 18px; color: var(--tx2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .when { font-size: 12px; line-height: 16px; color: var(--tx3); }
    .chev { color: var(--tx3); }
    .del { display: grid; place-items: center; flex: none; width: var(--touch); height: var(--touch); margin-right: 4px; border: 0; border-radius: var(--rf-2); background: none; color: var(--tx3); cursor: pointer; }
    .del:hover { background: var(--rds); color: var(--rd); }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotasPage implements OnInit {
  protected readonly notas = inject(NotasService);
  private readonly router = inject(Router);
  private readonly toasts = inject(ToastService);

  protected readonly failed = signal(false);
  protected readonly busy = signal(false);
  protected readonly asking = signal(false);
  protected readonly removing = signal<Note | null>(null);
  protected readonly query = signal('');

  protected readonly shown = computed(() => {
    const q = this.query().trim().toLowerCase();
    const all = this.notas.notes();
    return q ? all.filter((n) => (n.title + ' ' + preview(n.blocks, 4000)).toLowerCase().includes(q)) : all;
  });

  ngOnInit() {
    this.load();
  }

  protected load() {
    this.failed.set(false);
    this.notas.load().catch(() => this.failed.set(true));
  }

  protected snippet(n: Note): string {
    return preview(n.blocks);
  }

  protected when(iso: string): string {
    const d = new Date(iso);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) return `Hoy, ${d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false })}`;
    return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
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

  protected ask(n: Note) {
    this.removing.set(n);
    this.asking.set(true);
  }

  protected async remove() {
    const n = this.removing();
    if (!n) return;
    this.busy.set(true);
    try {
      await this.notas.remove(n.id);
      this.toasts.show({ message: 'Nota eliminada' });
    } catch {
      this.toasts.error(SAVE_ERROR);
    } finally {
      this.busy.set(false);
      this.asking.set(false);
    }
  }
}
