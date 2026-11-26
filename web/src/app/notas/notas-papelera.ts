import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Icon } from '../icons/icon';
import { ConfirmDialog } from '../ui/confirm-dialog';
import { EmptyState, ErrorState, Skeleton } from '../ui/states';
import { ToastService } from '../ui/toast';
import { NotasNav } from './notas.nav';
import { Note, NotasService, TRASH_DAYS } from './notas.service';
import { trashFamily, trashRoots } from './notas.tree';

const ERROR = 'No se pudo completar. Revisa tu conexión e intenta de nuevo.';

/**
 * Papelera de docs: lo que se eliminó (con sus subpáginas) se puede restaurar o borrar para siempre; a los 30 días se
 * borra solo. Solo íconos: restaurar (↺), borrar para siempre (🗑) y vaciar.
 */
@Component({
  selector: 'app-notas-papelera',
  imports: [ConfirmDialog, EmptyState, ErrorState, Icon, RouterLink, Skeleton],
  template: `
    <div class="page">
      <header>
        <button type="button" class="ib treebtn" aria-label="Abrir el árbol de docs" (click)="nav.drawerOpen.set(true)"><app-icon name="menu" [size]="22" /></button>
        <a class="ib back" routerLink="/notas" aria-label="Volver a Docs"><app-icon name="chevron-left" [size]="22" /></a>
        <h1>Papelera</h1>
        <span class="grow"></span>
        @if (roots().length) {
          <button type="button" class="ib danger" aria-label="Vaciar la papelera" (click)="emptyAsk.set(true)"><app-icon name="trash" [size]="22" /></button>
        }
      </header>

      @if (failed()) {
        <ui-error-state message="No se pudo abrir la papelera" detail="Revisa tu conexión e intenta de nuevo." (retry)="load()" />
      } @else if (!notas.trashLoaded()) {
        <div class="panel" aria-busy="true" aria-label="Cargando">
          <ui-skeleton height="68px" radius="0" /><ui-skeleton height="68px" radius="0" />
        </div>
      } @else if (!roots().length) {
        <div class="panel">
          <ui-empty-state icon="trash" title="La papelera está vacía" text="Lo que elimines se queda aquí 30 días." />
        </div>
      } @else {
        <p class="hint">Se borran solos a los {{ days }} días.</p>
        <ul class="panel" aria-label="Docs en la papelera">
          @for (n of roots(); track n.id) {
            <li class="item">
              <span class="row">
                <span class="tile">
                  @if (n.icon) {
                    <span class="emo">{{ n.icon }}</span>
                  } @else {
                    <app-icon name="file-text" [size]="20" />
                  }
                </span>
                <span class="lt">
                  <span class="ln">{{ n.title.trim() || 'Sin título' }}</span>
                  <span class="meta">
                    <span>{{ left(n) }} d</span>
                    @if (subs(n); as k) {
                      <span class="mi" [attr.aria-label]="k + (k === 1 ? ' subpágina' : ' subpáginas')"><app-icon name="folder" [size]="13" [stroke]="2" />{{ k }}</span>
                    }
                  </span>
                </span>
              </span>
              <button type="button" class="act" [disabled]="busy()" [attr.aria-label]="'Restaurar ' + (n.title.trim() || 'doc sin título')" (click)="restore(n)"><app-icon name="history" [size]="20" /></button>
              <button type="button" class="act bad" [disabled]="busy()" [attr.aria-label]="'Borrar para siempre ' + (n.title.trim() || 'doc sin título')" (click)="purgeAsk.set(n)"><app-icon name="trash" [size]="20" /></button>
            </li>
          }
        </ul>
      }
    </div>

    <ui-confirm-dialog
      [open]="purgeAsk() !== null" (openChange)="$event || purgeAsk.set(null)" [title]="'¿Borrar «' + (purgeAsk()?.title?.trim() || 'Sin título') + '» para siempre?'"
      message="No se puede recuperar; se borran también sus subpáginas e imágenes." confirmLabel="Borrar" [busy]="busy()" (confirmed)="purgeOne()"
    />
    <ui-confirm-dialog
      [open]="emptyAsk()" (openChange)="emptyAsk.set($event)" title="¿Vaciar la papelera?"
      message="Todo lo que hay en ella se borra para siempre, con sus subpáginas e imágenes." confirmLabel="Vaciar" [busy]="busy()" (confirmed)="empty()"
    />
  `,
  styles: `
    :host { display: block; }
    .page { display: flex; flex-direction: column; gap: var(--sp-4); max-width: 720px; margin: 0 auto; padding: var(--sp-4) var(--sp-4) var(--sp-6); }
    header { display: flex; align-items: center; gap: 2px; min-height: 48px; }
    .grow { flex: 1; }
    h1 { font-size: 28px; line-height: 36px; font-weight: 700; letter-spacing: -0.02em; }
    .ib { display: grid; place-items: center; flex: none; width: var(--touch); height: var(--touch); padding: 0; border: 0; border-radius: var(--rf-3); background: none; color: var(--tx2); cursor: pointer; }
    .ib:hover { background: var(--s2); color: var(--tx); }
    .ib.danger:hover { background: var(--rds); color: var(--rd); }
    .treebtn { margin-left: -8px; margin-right: 2px; }
    .back { margin-right: 2px; }
    @media (min-width: 1024px) { .treebtn { display: none; } .back { margin-left: -8px; } }
    .hint { margin: -6px 4px 0; font-size: 13px; color: var(--tx3); }
    .panel { position: relative; display: flex; flex-direction: column; margin: 0; padding: 0; list-style: none; border-radius: var(--rf-3); background: var(--sf); box-shadow: var(--sh1), inset 0 0 0 1px var(--bd); overflow: hidden; }
    .item { display: flex; align-items: center; background: var(--sf); }
    .item + .item { border-top: 1px solid var(--bd); }
    .row { display: flex; align-items: center; gap: 12px; flex: 1; min-width: 0; min-height: 64px; padding: 10px 4px 10px 14px; }
    .tile { display: grid; place-items: center; flex: none; width: 40px; height: 40px; border-radius: 10px; background: var(--s2); color: var(--tx2); }
    .emo { font-size: 21px; line-height: 1; }
    .lt { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
    .ln { font-size: 15px; line-height: 20px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .meta { display: flex; align-items: center; gap: 10px; font-size: 12px; line-height: 16px; color: var(--tx3); }
    .mi { display: inline-flex; align-items: center; gap: 4px; }
    .act { display: grid; place-items: center; flex: none; width: 40px; height: var(--touch); border: 0; border-radius: var(--rf-2); background: none; color: var(--tx2); cursor: pointer; }
    .act:last-child { margin-right: 4px; }
    .act:hover:not(:disabled) { background: var(--s2); color: var(--tx); }
    .act.bad:hover:not(:disabled) { background: var(--rds); color: var(--rd); }
    .act:disabled { opacity: 0.35; cursor: default; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotasPapelera implements OnInit {
  protected readonly notas = inject(NotasService);
  protected readonly nav = inject(NotasNav);
  private readonly toasts = inject(ToastService);

  protected readonly days = TRASH_DAYS;
  protected readonly failed = signal(false);
  protected readonly busy = signal(false);
  protected readonly purgeAsk = signal<Note | null>(null);
  protected readonly emptyAsk = signal(false);
  protected readonly roots = computed(() => trashRoots(this.notas.trash()));

  ngOnInit() {
    this.load();
  }

  protected load() {
    this.failed.set(false);
    this.notas.loadTrash().catch(() => this.failed.set(true));
  }

  /** Cuántas subpáginas se fueron junto con este doc. */
  protected subs(n: Note): number {
    return trashFamily(this.notas.trash(), n.id).length - 1;
  }

  /** Días que le quedan antes de borrarse solo. */
  protected left(n: Note): number {
    const used = (Date.now() - Date.parse(n.deletedAt ?? new Date().toISOString())) / 86_400_000;
    return Math.max(0, Math.ceil(TRASH_DAYS - used));
  }

  protected async restore(n: Note) {
    this.busy.set(true);
    try {
      await this.notas.restore(n.id);
      this.toasts.show({ message: 'Doc restaurado' });
    } catch {
      this.toasts.error(ERROR);
    } finally {
      this.busy.set(false);
    }
  }

  protected async purgeOne() {
    const n = this.purgeAsk();
    if (!n) return;
    this.busy.set(true);
    try {
      await this.notas.purge([n.id]);
      this.purgeAsk.set(null);
    } catch {
      this.toasts.error(ERROR);
    } finally {
      this.busy.set(false);
    }
  }

  protected async empty() {
    this.busy.set(true);
    try {
      await this.notas.emptyTrash();
      this.emptyAsk.set(false);
    } catch {
      this.toasts.error(ERROR);
    } finally {
      this.busy.set(false);
    }
  }
}
