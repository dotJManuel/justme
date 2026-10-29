import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { Icon } from '../icons/icon';
import { BottomSheet } from '../ui/bottom-sheet';
import { Button } from '../ui/button';
import { ConfirmDialog } from '../ui/confirm-dialog';
import { Input } from '../ui/input';
import { EmptyState, ErrorState, Skeleton } from '../ui/states';
import { ToastService } from '../ui/toast';
import { AppLink, LinksService, normalizeUrl } from './links.service';

const SAVE_ERROR = 'No se pudo guardar. Revisa tu conexión e intenta de nuevo.';

/** Perfil › Enlaces: tus accesos externos. Se agregan con una dirección y se quitan con la papelera. */
@Component({
  selector: 'app-enlaces',
  imports: [BottomSheet, Button, ConfirmDialog, EmptyState, ErrorState, Icon, Input, Skeleton],
  template: `
    <div class="sec">
      <h2 id="enl-h">Enlaces</h2>
      <button type="button" class="add" (click)="openAdd()"><app-icon name="plus" [size]="16" />Agregar</button>
    </div>

    @if (failed()) {
      <ui-error-state message="No se pudieron cargar tus enlaces" detail="Revisa tu conexión e intenta de nuevo." (retry)="load()" />
    } @else if (!links.loaded()) {
      <div class="panel skel" aria-busy="true" aria-label="Cargando enlaces"><ui-skeleton height="56px" radius="0" /></div>
    } @else {
      <ul class="panel scroll" aria-labelledby="enl-h">
        @for (l of links.links(); track l.id) {
          <li class="item">
            <a class="row" [href]="l.url" target="_blank" rel="noopener noreferrer">
              <span class="ico"><app-icon name="link" [size]="18" /></span>
              <span class="lt">
                <span class="ln">{{ l.title }}</span>
                <span class="ls">{{ l.note || host(l.url) }}</span>
              </span>
              <app-icon class="chev" name="external" [size]="16" />
              <span class="sr-only">(se abre en otra pestaña)</span>
            </a>
            <button type="button" class="del" [attr.aria-label]="'Quitar ' + l.title" (click)="ask(l)"><app-icon name="trash" [size]="18" /></button>
          </li>
        } @empty {
          <li>
            <ui-empty-state icon="link" title="Aún no hay enlaces" text="Guarda aquí los sitios que usas seguido.">
              <button uiBtn small type="button" (click)="openAdd()"><app-icon name="plus" [size]="16" />Agregar enlace</button>
            </ui-empty-state>
          </li>
        }
      </ul>
    }

    <ui-bottom-sheet title="Nuevo enlace" [(open)]="adding">
      <form (submit)="$event.preventDefault(); save()" novalidate>
        <ui-input label="Nombre" placeholder="Ej. Prep de entrevistas" [(value)]="title" [error]="titleError()" autocomplete="off" />
        <ui-input label="Dirección" type="url" inputmode="url" placeholder="ejemplo.com" [(value)]="url" [error]="urlError()" autocomplete="off" />
        <ui-input label="Nota (opcional)" placeholder="Para qué lo usas" [(value)]="note" autocomplete="off" />
        <button uiBtn block type="submit" [disabled]="busy()">{{ busy() ? 'Guardando…' : 'Agregar enlace' }}</button>
      </form>
    </ui-bottom-sheet>

    <ui-confirm-dialog
      [(open)]="asking" [title]="'¿Quitar «' + (removing()?.title ?? '') + '»?'" message="Solo se quita de esta lista; el sitio no se toca."
      confirmLabel="Quitar" [busy]="busy()" (confirmed)="remove()"
    />
  `,
  styles: `
    :host { display: block; }
    .sec { display: flex; justify-content: space-between; align-items: center; padding: 0 4px; margin-bottom: 8px; }
    h2 { font-size: 13px; line-height: 16px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: var(--tx3); }
    .add { display: flex; align-items: center; gap: 4px; min-height: var(--touch); margin-block: -14px; padding: 0 4px; border: 0; background: none; color: var(--ac); font: inherit; font-size: 14px; font-weight: 600; cursor: pointer; }
    .panel { display: flex; flex-direction: column; margin: 0; padding: 0; list-style: none; border-radius: var(--rf-3); background: var(--sf); box-shadow: var(--sh1), inset 0 0 0 1px var(--bd); overflow: hidden; }
    .scroll { max-height: min(60dvh, 560px); overflow-y: auto; scrollbar-gutter: stable; }
    .item { display: flex; align-items: center; }
    .item + .item { border-top: 1px solid var(--bd); }
    .row { display: flex; align-items: center; gap: 12px; flex: 1; min-width: 0; min-height: 56px; padding: 10px 8px 10px 16px; color: inherit; text-decoration: none; }
    .row:hover { background: var(--s2); }
    .ico { display: grid; place-items: center; flex: none; width: 36px; height: 36px; border-radius: 8px; background: var(--s2); color: var(--tx2); }
    .lt { display: flex; flex-direction: column; flex: 1; min-width: 0; }
    .ln { font-size: 15px; line-height: 20px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .ls { font-size: 13px; line-height: 18px; color: var(--tx2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .chev { color: var(--tx3); }
    .del { display: grid; place-items: center; flex: none; width: var(--touch); height: var(--touch); margin-right: 4px; border: 0; border-radius: var(--rf-2); background: none; color: var(--tx3); cursor: pointer; }
    .del:hover { background: var(--rds); color: var(--rd); }
    form { display: flex; flex-direction: column; gap: 16px; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EnlacesSection implements OnInit {
  protected readonly links = inject(LinksService);
  private readonly toasts = inject(ToastService);

  protected readonly failed = signal(false);
  protected readonly adding = signal(false);
  protected readonly asking = signal(false);
  protected readonly removing = signal<AppLink | null>(null);
  protected readonly busy = signal(false);

  protected readonly title = signal('');
  protected readonly url = signal('');
  protected readonly note = signal('');
  private readonly tried = signal(false);

  protected readonly titleError = computed(() => (this.tried() && !this.title().trim() ? 'Escribe un nombre' : this.title().trim().length > 80 ? 'Máximo 80 caracteres' : ''));
  protected readonly urlError = computed(() => (this.tried() && normalizeUrl(this.url()) === null ? 'Escribe una dirección web válida, por ejemplo ejemplo.com' : ''));

  ngOnInit() {
    this.load();
  }

  protected load() {
    this.failed.set(false);
    this.links.load().catch(() => this.failed.set(true));
  }

  protected host(url: string): string {
    try {
      return new URL(url).host;
    } catch {
      return url;
    }
  }

  protected openAdd() {
    this.title.set('');
    this.url.set('');
    this.note.set('');
    this.tried.set(false);
    this.adding.set(true);
  }

  protected async save() {
    this.tried.set(true);
    const url = normalizeUrl(this.url());
    const title = this.title().trim();
    if (!title || title.length > 80 || !url || this.busy()) return;
    this.busy.set(true);
    try {
      await this.links.add(title, url, this.note().trim().slice(0, 120));
      this.toasts.show({ message: 'Enlace agregado' });
      this.adding.set(false);
    } catch {
      this.toasts.error(SAVE_ERROR);
    } finally {
      this.busy.set(false);
    }
  }

  protected ask(l: AppLink) {
    this.removing.set(l);
    this.asking.set(true);
  }

  protected async remove() {
    const l = this.removing();
    if (!l) return;
    this.busy.set(true);
    try {
      await this.links.remove(l.id);
      this.toasts.show({ message: 'Enlace quitado' });
    } catch {
      this.toasts.error(SAVE_ERROR);
    } finally {
      this.busy.set(false);
      this.asking.set(false);
    }
  }
}
