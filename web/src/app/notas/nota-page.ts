import { ChangeDetectionStrategy, afterRenderEffect, Component, DestroyRef, ElementRef, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { skip } from 'rxjs';
import { Icon } from '../icons/icon';
import { Button } from '../ui/button';
import { EmptyState, ErrorState, Skeleton } from '../ui/states';
import { ToastService } from '../ui/toast';
import { BlockEditor } from './block-editor';
import { EmojiPicker } from './emoji-picker';
import { Block, MAX_TITLE, newBlock, sameContent, toPlainText } from './notas.blocks';
import { NotasNav } from './notas.nav';
import { childrenOf } from './notas.tree';
import { HEARTBEAT_MS, Note, NotasService } from './notas.service';

/**
 * - loading: cargando.
 * - editing: esta pestaña tiene el bloqueo y puede escribir.
 * - locked: otra pestaña o dispositivo la está editando; aquí solo se lee (y se actualiza sola).
 * - lost: se tenía el bloqueo, otra sesión lo tomó y quedaron cambios sin guardar (se conservan en pantalla).
 * - missing / error: la nota ya no existe / no se pudo cargar.
 */
type Mode = 'loading' | 'editing' | 'locked' | 'lost' | 'missing' | 'error';
type SaveState = 'saved' | 'dirty' | 'saving' | 'failed';

const SAVE_DELAY_MS = 800;
const RETRY_MS = 5_000;
const POLL_MS = 8_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Una nota abierta. Mientras esta pestaña tiene el bloqueo, lo que se escribe se guarda solo; si otra pestaña o
 * dispositivo la está editando, aquí se ve (y se refresca) pero no se puede escribir hasta tomar la edición.
 */
@Component({
  selector: 'app-nota-page',
  imports: [BlockEditor, Button, EmojiPicker, EmptyState, ErrorState, Icon, RouterLink, Skeleton],
  template: `
    <div class="page">
      <div class="bar">
        <a class="back" [routerLink]="backLink()" [attr.aria-label]="crumbs().length ? 'Volver a la página anterior' : 'Volver a Notas'"><app-icon name="chevron-left" [size]="22" /></a>
        <button type="button" class="tool treebtn" aria-label="Abrir el árbol de notas" (click)="nav.drawerOpen.set(true)"><app-icon name="menu" [size]="18" /></button>
        @if (crumbs().length) {
          <nav class="crumbs" aria-label="Ubicación de la nota">
            @for (c of crumbs(); track c.id) {
              <a [routerLink]="['/notas', c.id]">{{ c.icon }} {{ c.title.trim() || 'Sin título' }}</a><span aria-hidden="true">›</span>
            }
          </nav>
        }
        <span class="grow"></span>
        @if (mode() === 'editing') {
          <span class="state" role="status" [class.bad]="saveState() === 'failed'">
            @switch (saveState()) {
              @case ('saving') { Guardando… }
              @case ('dirty') { Sin guardar }
              @case ('failed') { Sin conexión · se reintenta }
              @default { <app-icon name="check" [size]="14" [stroke]="2.4" /> Guardado }
            }
          </span>
        }
        @if (mode() === 'editing' || mode() === 'locked' || mode() === 'lost') {
          <button type="button" class="tool" aria-label="Copiar el texto de la nota" (click)="copy()"><app-icon name="copy" [size]="18" /></button>
        }
      </div>

      @switch (mode()) {
        @case ('loading') {
          <div class="skel" aria-busy="true" aria-label="Cargando nota">
            <ui-skeleton height="40px" width="60%" /><ui-skeleton height="20px" /><ui-skeleton height="20px" width="85%" /><ui-skeleton height="20px" width="70%" />
          </div>
        }
        @case ('error') {
          <ui-error-state message="No se pudo abrir la nota" detail="Revisa tu conexión e intenta de nuevo." (retry)="init()" />
        }
        @case ('missing') {
          <ui-empty-state icon="file-text" title="Esta nota ya no existe" text="Pudo haberse eliminado desde otro dispositivo.">
            <a uiBtn small routerLink="/notas">Ver mis notas</a>
          </ui-empty-state>
        }
        @default {
          @if (mode() === 'locked') {
            <div class="banner" role="status">
              <app-icon name="lock" [size]="18" />
              <div class="bt">
                @if (free()) {
                  <b>Nadie la está editando ahora</b>
                  <span>Toma la edición para escribir.</span>
                } @else {
                  <b>Se está editando en otro dispositivo o pestaña</b>
                  <span>Aquí solo puedes leerla; se actualiza sola.</span>
                }
              </div>
              @if (free()) {
                <button uiBtn small type="button" [disabled]="busy()" (click)="takeEdit(false)">Editar</button>
              } @else {
                <button uiBtn small variant="secondary" type="button" [disabled]="busy()" (click)="takeEdit(true)">Editar aquí</button>
              }
            </div>
          } @else if (mode() === 'lost') {
            <div class="banner warn" role="alert">
              <app-icon name="alert" [size]="18" />
              <div class="bt">
                <b>Otra sesión tomó la edición</b>
                <span>Tus últimos cambios no se guardaron. Cópialos antes de ver la versión guardada.</span>
              </div>
              <button uiBtn small variant="secondary" type="button" (click)="copy()">Copiar</button>
              <button uiBtn small type="button" [disabled]="busy()" (click)="showSaved()">Ver la guardada</button>
            </div>
          }

          <div class="trow">
            <button type="button" class="ico" [disabled]="!editable()" [attr.aria-label]="icon() ? 'Cambiar el emoji de la nota' : 'Agregar un emoji a la nota'" (click)="iconOpen.set(true)">
              @if (icon()) {
                {{ icon() }}
              } @else {
                <app-icon name="file-text" [size]="26" />
              }
            </button>
            <textarea
              #titleInput class="title" rows="1" placeholder="Sin título" aria-label="Título de la nota" autocomplete="off" [maxLength]="maxTitle"
              [value]="title()" [readOnly]="!editable()" (input)="title.set($any($event.target).value)" (keydown.enter)="$event.preventDefault(); focusFirst()"
            ></textarea>
          </div>
          <app-block-editor [(blocks)]="blocks" [readonly]="!editable()" [noteId]="noteId()" />
          @if (extraChildren().length || editable()) {
            <section class="subs" aria-label="Subpáginas">
              @if (extraChildren().length) {
                <h2 class="subh">Subpáginas</h2>
                @for (c of extraChildren(); track c.id) {
                  <a class="sub" [routerLink]="['/notas', c.id]">
                    <span class="subi" aria-hidden="true">{{ c.icon || '📄' }}</span>
                    <span class="subt"><b>{{ c.title.trim() || 'Sin título' }}</b></span>
                    <app-icon name="chevron-right" [size]="16" />
                  </a>
                }
              }
              @if (editable()) {
                <button type="button" class="subadd" [disabled]="busy()" (click)="newSubpage()"><app-icon name="plus" [size]="16" />Nueva subpágina</button>
              }
            </section>
          }
          <app-emoji-picker [(open)]="iconOpen" [clearable]="true" title="Emoji de la nota" (picked)="setIcon($event)" />
        }
      }
    </div>
  `,
  styles: `
    :host { display: block; }
    .page { display: flex; flex-direction: column; gap: var(--sp-3); max-width: 720px; margin: 0 auto; padding: var(--sp-3) var(--sp-4) var(--sp-7); }
    /* En escritorio, el asa de los bloques vive en el margen izquierdo: se le deja lugar. */
    @media (min-width: 1024px) { .page { padding-left: 44px; } }
    .bar { display: flex; align-items: center; gap: 4px; min-height: var(--touch); }
    .back, .tool { display: grid; place-items: center; width: var(--touch); height: var(--touch); border: 0; border-radius: var(--rf-2); background: none; color: var(--tx); cursor: pointer; }
    .back { margin-left: -8px; }
    .tool { color: var(--tx2); }
    .back:hover, .tool:hover { background: var(--s2); }
    .grow { flex: 1; }
    @media (min-width: 1024px) { .treebtn { display: none; } }
    .crumbs { display: flex; align-items: center; gap: 2px; min-width: 0; overflow: hidden; font-size: 13px; color: var(--tx3); }
    .crumbs a { max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: 4px 6px; border-radius: 6px; color: var(--tx2); text-decoration: none; }
    .crumbs a:hover { background: var(--s2); color: var(--tx); }
    .trow { display: flex; align-items: flex-start; gap: 6px; }
    .ico {
      display: grid; place-items: center; flex: none; width: 48px; height: 48px; margin-top: 0; padding: 0; border: 0; border-radius: 10px; background: none;
      color: var(--tx3); font-size: 32px; line-height: 1; cursor: pointer;
    }
    .ico:hover:not(:disabled) { background: var(--s2); }
    .ico:disabled { cursor: default; }
    .trow .title { flex: 1; min-width: 0; }
    .state { display: inline-flex; align-items: center; gap: 4px; font-size: 13px; color: var(--tx2); }
    .state.bad { color: var(--rd); }
    .skel { display: flex; flex-direction: column; gap: 14px; padding-top: 8px; }
    .title {
      display: block; width: 100%; padding: 4px 2px; border: 0; border-radius: 4px; resize: none; overflow: hidden; background: none; color: var(--tx);
      font: inherit; font-size: 34px; line-height: 42px; font-weight: 700; letter-spacing: -0.025em; outline: none; box-shadow: none; overflow-wrap: anywhere;
    }
    @media (max-width: 480px) { .title { font-size: 28px; line-height: 36px; } }
    .title::placeholder { color: var(--tx3); }
    .banner {
      display: flex; align-items: center; flex-wrap: wrap; gap: 10px 12px; padding: 10px 12px 10px 14px; border-radius: var(--rf-3);
      background: var(--yls); color: var(--yl); box-shadow: inset 0 0 0 1px var(--yl);
    }
    .banner.warn { background: var(--rds); color: var(--rd); box-shadow: inset 0 0 0 1px var(--rd); }
    .bt { display: flex; flex-direction: column; flex: 1 1 200px; min-width: 0; }
    .bt b { font-size: 14px; line-height: 20px; font-weight: 600; color: var(--tx); }
    .bt span { font-size: 13px; line-height: 18px; color: var(--tx2); }
    app-block-editor { margin-top: 4px; }
    .subs { display: flex; flex-direction: column; gap: 6px; margin-top: var(--sp-3); }
    .subh { padding: 0 2px; font-size: 12px; line-height: 16px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--tx3); }
    .sub {
      display: flex; align-items: center; gap: 12px; min-height: 52px; padding: 8px 14px; border-radius: 10px; background: var(--sf);
      color: var(--tx); text-decoration: none; box-shadow: inset 0 0 0 1px var(--bd2);
    }
    .sub:hover { background: var(--s2); }
    .subi { display: grid; place-items: center; flex: none; width: 34px; height: 34px; border-radius: 8px; background: var(--s2); font-size: 20px; }
    .subt { display: flex; flex: 1; min-width: 0; }
    .subt b { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 15px; line-height: 20px; font-weight: 600; }
    .subadd {
      display: flex; align-items: center; gap: 6px; align-self: flex-start; min-height: 36px; padding: 0 10px; border: 0; border-radius: 8px; background: none;
      color: var(--tx2); font: inherit; font-size: 14px; font-weight: 600; cursor: pointer;
    }
    .subadd:hover:not(:disabled) { background: var(--s2); color: var(--tx); }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotaPage implements OnInit {
  private readonly notas = inject(NotasService);
  protected readonly nav = inject(NotasNav);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toasts = inject(ToastService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  protected readonly maxTitle = MAX_TITLE;
  protected readonly mode = signal<Mode>('loading');
  protected readonly saveState = signal<SaveState>('saved');
  protected readonly title = signal('');
  /** El emoji de la nota (vacío si no tiene). */
  protected readonly icon = signal('');
  protected readonly iconOpen = signal(false);
  /** Id de la nota abierta (para el editor y las migas de pan). */
  protected readonly noteId = signal('');
  /** Las notas que contienen a esta (si es una subpágina), de la más alta a la más cercana. */
  protected readonly crumbs = computed(() => this.notas.ancestors(this.noteId()));
  /**
   * Las subpáginas de esta nota que no tienen su propio bloque en el texto (las creadas desde el árbol o movidas aquí con
   * «Mover a…»): se listan debajo, para que la página padre siempre muestre todo lo que contiene, como en Notion. Las que sí
   * tienen bloque salen donde se pusieron.
   */
  protected readonly extraChildren = computed(() => {
    const id = this.noteId();
    if (!id) return [];
    const linked = new Set(this.blocks().flatMap((b) => (b.type === 'page' && b.ref ? [b.ref] : [])));
    return childrenOf(this.notas.notes(), id).filter((c) => !linked.has(c.id));
  });
  protected readonly backLink = computed(() => {
    const parent = this.notas.byId(this.noteId())?.parentId;
    return parent ? ['/notas', parent] : ['/notas'];
  });
  protected readonly blocks = signal<Block[]>([newBlock()]);
  protected readonly busy = signal(false);
  /** Última versión de la nota en el servidor, vista desde aquí (para saber si el bloqueo ya está libre). */
  private readonly remote = signal<Note | null>(null);

  /** Volviendo a la pestaña: se relee la nota y se retoma el bloqueo; mientras tanto no se escribe. */
  protected readonly resuming = signal(false);
  protected readonly editable = computed(() => this.mode() === 'editing' && !this.resuming());
  protected readonly free = computed(() => {
    const r = this.remote();
    return !r || !this.notas.lockedByOther(r);
  });

  private id = '';
  private saved: { title: string; blocks: Block[]; icon: string } = { title: '', blocks: [], icon: '' };
  private saveTimer?: ReturnType<typeof setTimeout>;
  private heartbeat?: ReturnType<typeof setInterval>;
  private poll?: ReturnType<typeof setInterval>;
  private inflight?: Promise<void>;
  private again = false;
  /** Se soltó el bloqueo al ocultar la pestaña (hay que volver a tomarlo y releer la nota al regresar). */
  private released = false;
  private destroyed = false;
  private readonly fitTitle = () => {
    const el = this.host.querySelector<HTMLTextAreaElement>('textarea.title');
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  };

  constructor() {
    // El título crece con su texto (nunca se corta con «…»), también al girar el teléfono o cambiar el ancho.
    afterRenderEffect(() => {
      this.title();
      this.mode();
      this.fitTitle();
    });
    window.addEventListener('resize', this.fitTitle);
    // Cada cambio (título o bloques) agenda un guardado, siempre que esta pestaña tenga el bloqueo.
    effect(() => {
      this.title();
      this.blocks();
      this.icon();
      untracked(() => {
        if (this.mode() !== 'editing') return;
        if (sameContent(this.current(), this.saved)) {
          if (!this.inflight && this.saveState() !== 'failed') this.saveState.set('saved');
          return;
        }
        if (this.saveState() !== 'saving') this.saveState.set('dirty');
        clearTimeout(this.saveTimer);
        this.saveTimer = setTimeout(() => void this.flush(), SAVE_DELAY_MS);
      });
    });

    // Se pasa de una nota a otra sin recrear la pantalla (por ejemplo de una página a su subpágina): se guarda y suelta la
    // actual y se abre la nueva.
    const route = this.route.paramMap.pipe(skip(1)).subscribe(() => void this.switchNote());

    const onVisibility = () => void this.onVisibility();
    const onHide = () => {
      if (this.mode() === 'editing') this.notas.releaseOnExit(this.id);
    };
    const onUnload = (e: BeforeUnloadEvent) => {
      // Cambios que aún no llegaron al servidor: el navegador avisa antes de cerrar.
      if (this.mode() === 'editing' && !sameContent(this.current(), this.saved)) e.preventDefault();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onHide);
    window.addEventListener('beforeunload', onUnload);

    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      route.unsubscribe();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onHide);
      window.removeEventListener('beforeunload', onUnload);
      window.removeEventListener('resize', this.fitTitle);
      void this.leave();
    });
  }

  ngOnInit() {
    this.init();
  }

  /** Guarda y suelta la nota abierta y abre la que indica la dirección. */
  private async switchNote() {
    await this.leave();
    if (this.destroyed) return;
    // Primero se detiene todo (así lo que sigue no se guarda sobre la nota anterior) y luego se limpia la pantalla.
    this.mode.set('loading');
    clearInterval(this.heartbeat);
    this.stopPoll();
    clearTimeout(this.saveTimer);
    this.again = false;
    this.released = false;
    this.resuming.set(false);
    this.remote.set(null);
    this.saved = { title: '', blocks: [], icon: '' };
    this.title.set('');
    this.icon.set('');
    this.blocks.set([newBlock()]);
    this.saveState.set('saved');
    void this.init();
  }

  protected async init() {
    const id = this.route.snapshot.paramMap.get('id') ?? '';
    if (!UUID.test(id)) {
      this.mode.set('missing');
      return;
    }
    this.id = id;
    this.noteId.set(id);
    this.mode.set('loading');
    // El resto de las notas (para los nombres de las subpáginas y las migas de pan): sin esperar y sin avisar si falla.
    void this.notas.load().catch(() => undefined);
    try {
      const note = await this.notas.fetchOne(id);
      if (this.destroyed) return;
      if (!note) {
        this.mode.set('missing');
        return;
      }
      this.load(note);
      const lock = await this.notas.acquire(id);
      if (this.destroyed) {
        if (lock === 'ok') void this.notas.release(id);
        return;
      }
      if (lock === 'ok') this.startEditing(!note.title && note.blocks.every((b) => !b.text));
      else if (lock === 'locked') this.startLocked();
      else this.mode.set('missing');
    } catch {
      if (!this.destroyed) this.mode.set('error');
    }
  }

  // ── Tomar la edición ───────────────────────────────────────────────────────

  /** "Editar" (el bloqueo está libre) o "Editar aquí" (se lo quita a la otra pestaña). Relee la nota antes de escribir. */
  protected async takeEdit(force: boolean) {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      const lock = await this.notas.acquire(this.id, force);
      if (lock === 'missing') return void this.mode.set('missing');
      if (lock === 'locked') {
        const n = await this.notas.fetchOne(this.id);
        if (n) this.remote.set(n);
        this.toasts.show({ message: 'Otra sesión la acaba de tomar' });
        return;
      }
      const fresh = await this.notas.fetchOne(this.id);
      if (!fresh) return void this.mode.set('missing');
      this.load(fresh);
      this.startEditing(false);
    } catch {
      this.toasts.error('No se pudo tomar la edición. Intenta de nuevo.');
    } finally {
      this.busy.set(false);
    }
  }

  /** Descarta lo que quedó sin guardar y muestra la versión del servidor. */
  protected async showSaved() {
    this.busy.set(true);
    try {
      const fresh = await this.notas.fetchOne(this.id);
      if (!fresh) return void this.mode.set('missing');
      this.load(fresh);
      this.startLocked();
    } catch {
      this.toasts.error('No se pudo cargar la nota. Intenta de nuevo.');
    } finally {
      this.busy.set(false);
    }
  }

  private load(note: Note) {
    this.saved = { title: note.title, blocks: note.blocks, icon: note.icon };
    this.remote.set(note);
    this.title.set(note.title);
    this.icon.set(note.icon);
    this.blocks.set(note.blocks);
    this.saveState.set('saved');
  }

  private startEditing(focusTitle: boolean) {
    this.stopPoll();
    this.released = false;
    this.mode.set('editing');
    clearInterval(this.heartbeat);
    this.heartbeat = setInterval(() => void this.renew(), HEARTBEAT_MS);
    if (focusTitle) setTimeout(() => this.host.querySelector<HTMLTextAreaElement>('textarea.title')?.focus());
  }

  private startLocked() {
    clearInterval(this.heartbeat);
    clearTimeout(this.saveTimer);
    this.mode.set('locked');
    this.stopPoll();
    this.poll = setInterval(() => void this.refresh(), POLL_MS);
  }

  /** Sin el bloqueo y con cambios sin guardar: se conservan en pantalla para poder copiarlos. */
  private lose() {
    clearInterval(this.heartbeat);
    clearTimeout(this.saveTimer);
    if (sameContent(this.current(), this.saved)) {
      void this.showSaved();
      return;
    }
    this.mode.set('lost');
    this.saveState.set('dirty');
  }

  /** Mientras se lee, se trae lo que la otra pestaña va guardando. */
  private async refresh() {
    if (this.mode() !== 'locked' || document.visibilityState === 'hidden') return;
    try {
      const n = await this.notas.fetchOne(this.id);
      if (this.mode() !== 'locked') return;
      if (!n) return void this.mode.set('missing');
      this.remote.set(n);
      if (!sameContent(n, this.saved)) this.load(n);
    } catch {
      /* sin conexión: se reintenta en el próximo ciclo */
    }
  }

  private stopPoll() {
    clearInterval(this.poll);
    this.poll = undefined;
  }

  // ── Guardado y bloqueo ─────────────────────────────────────────────────────

  private current() {
    return { title: this.title(), blocks: this.blocks(), icon: this.icon() };
  }

  /** Guarda ya, si hay algo distinto. Un guardado a la vez; si se escribe mientras tanto, sigue otro. */
  private flush(): Promise<void> {
    clearTimeout(this.saveTimer);
    if (this.mode() !== 'editing') return Promise.resolve();
    if (this.inflight) {
      this.again = true;
      return this.inflight;
    }
    const snap = this.current();
    if (sameContent(snap, this.saved)) {
      if (this.saveState() !== 'failed') this.saveState.set('saved');
      return Promise.resolve();
    }
    this.saveState.set('saving');
    this.inflight = (async () => {
      try {
        const result = await this.notas.save(this.id, snap.title, snap.blocks, snap.icon);
        if (result === 'ok') {
          this.saved = snap;
          this.saveState.set(sameContent(this.current(), this.saved) ? 'saved' : 'dirty');
        } else if (result === 'locked') {
          if (!this.destroyed) this.lose();
        } else if (!this.destroyed) {
          this.mode.set('missing');
        }
      } catch {
        this.saveState.set('failed');
        if (!this.destroyed) this.saveTimer = setTimeout(() => void this.flush(), RETRY_MS);
      } finally {
        this.inflight = undefined;
        if (this.again) {
          this.again = false;
          void this.flush();
        }
      }
    })();
    return this.inflight;
  }

  /** Renueva el bloqueo (dura 45 s en el servidor). Si ya es de otra sesión, esta pasa a solo lectura. */
  private async renew() {
    if (this.mode() !== 'editing') return;
    try {
      const lock = await this.notas.acquire(this.id);
      if (lock === 'locked') this.lose();
      else if (lock === 'missing') this.mode.set('missing');
    } catch {
      /* sin conexión: el bloqueo sigue siendo nuestro mientras nadie más lo tome */
    }
  }

  /** Al ocultar la pestaña se guarda y se suelta el bloqueo; al volver se intenta tomar de nuevo. */
  private async onVisibility() {
    if (document.visibilityState === 'hidden') {
      if (this.mode() !== 'editing') return;
      await this.flush();
      // Si el guardado no pudo salir, el bloqueo se conserva: soltarlo dejaría pasar a otra sesión sobre lo no guardado.
      if (this.mode() === 'editing' && sameContent(this.current(), this.saved)) {
        clearInterval(this.heartbeat);
        this.released = true;
        void this.notas.release(this.id).catch(() => undefined);
      }
      return;
    }
    if (this.destroyed || !this.id) return;
    if (this.mode() === 'editing' && this.released) {
      this.released = false;
      this.resuming.set(true);
      await this.takeEditAfterReturn();
    } else if (this.mode() === 'editing') {
      void this.renew();
    } else if (this.mode() === 'locked') {
      void this.refresh();
    }
  }

  /** Vuelve a la pestaña: relee la nota y toma el bloqueo si sigue libre; si no, queda en solo lectura. */
  private async takeEditAfterReturn() {
    try {
      const fresh = await this.notas.fetchOne(this.id);
      if (this.destroyed) return;
      if (!fresh) return void this.mode.set('missing');
      this.load(fresh);
      const lock = await this.notas.acquire(this.id);
      if (this.destroyed) return;
      if (lock === 'ok') this.startEditing(false);
      else if (lock === 'locked') this.startLocked();
      else this.mode.set('missing');
    } catch {
      if (!this.destroyed) this.startLocked();
    } finally {
      this.resuming.set(false);
    }
  }

  /** Al salir: guarda lo pendiente y suelta el bloqueo para que otra pestaña pueda editar. */
  private async leave() {
    clearInterval(this.heartbeat);
    this.stopPoll();
    clearTimeout(this.saveTimer);
    if (this.mode() !== 'editing' || this.resuming()) return;
    try {
      // El guardado sigue funcionando aunque la pantalla ya no exista. Si se escribió durante uno, sigue otro.
      for (let n = 0; n < 3 && !sameContent(this.current(), this.saved); n++) {
        await this.flush();
        while (this.inflight) await this.inflight;
      }
    } catch {
      /* se intentó */
    }
    // Con algo sin guardar, el bloqueo se queda (vence solo): soltarlo dejaría pasar a otra sesión sobre lo pendiente.
    if (sameContent(this.current(), this.saved)) await this.notas.release(this.id).catch(() => undefined);
  }

  // ── Interfaz ───────────────────────────────────────────────────────────────

  /** Crea una subpágina de esta nota y la abre. */
  protected async newSubpage() {
    if (this.busy() || !this.id) return;
    this.busy.set(true);
    try {
      const child = await this.notas.create(this.id);
      this.nav.expand(this.id);
      await this.router.navigate(['/notas', child.id]);
    } catch {
      this.toasts.error('No se pudo crear la subpágina. Revisa tu conexión e intenta de nuevo.');
    } finally {
      this.busy.set(false);
    }
  }

  /** Pone (o quita, con una cadena vacía) el emoji de la nota. */
  protected setIcon(emoji: string) {
    if (this.editable()) this.icon.set(emoji);
  }

  protected focusFirst() {
    this.host.querySelector<HTMLElement>('app-block-editor .rt')?.focus();
  }

  protected async copy() {
    try {
      await navigator.clipboard.writeText(toPlainText(this.title(), this.blocks(), (id) => this.notas.byId(id)?.title.trim() || 'Subpágina'));
      this.toasts.show({ message: 'Texto copiado' });
    } catch {
      this.toasts.error('No se pudo copiar. Selecciona el texto y cópialo a mano.');
    }
  }
}
