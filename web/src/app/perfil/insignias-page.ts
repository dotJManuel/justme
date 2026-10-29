import { ChangeDetectionStrategy, Component, OnInit, computed, effect, inject, input, model, signal, untracked } from '@angular/core';
import { ConfigService } from '../config.service';
import { Icon } from '../icons/icon';
import { BadgesService } from '../racha/badges.service';
import { BADGE_ICONS, BADGE_KINDS, BadgeDef, BadgeKind, TIERS, TIER_PRESETS, badgeRule, targetsError } from '../racha/logros.config';
import { BottomSheet } from '../ui/bottom-sheet';
import { Button } from '../ui/button';
import { ConfirmDialog } from '../ui/confirm-dialog';
import { Choice, Option, Select, Switch } from '../ui/fields';
import { Input } from '../ui/input';
import { PageHeader } from '../ui/page-header';
import { EmptyState, ErrorState, Skeleton } from '../ui/states';
import { ToastService } from '../ui/toast';

const SAVE_ERROR = 'No se pudo guardar. Revisa tu conexión e intenta de nuevo.';

/** Agregar, editar o quitar una insignia: nombre, ícono, qué se mide y la meta de cada nivel (Bronce a Platino). */
@Component({
  selector: 'app-edit-badge',
  imports: [BottomSheet, Button, Choice, ConfirmDialog, Icon, Input, Select],
  template: `
    <ui-bottom-sheet [title]="badge() ? 'Editar insignia' : 'Nueva insignia'" [(open)]="open">
      <form (submit)="$event.preventDefault(); save()" novalidate>
        <ui-input label="Nombre" placeholder="Ej. Madrugador" [(value)]="name" [error]="nameError()" autocomplete="off" />

        <fieldset>
          <legend>Ícono</legend>
          <div class="icons" role="radiogroup" aria-label="Ícono">
            @for (i of icons; track i) {
              <button type="button" role="radio" [class.on]="icon() === i" [attr.aria-checked]="icon() === i" [attr.aria-label]="i" (click)="icon.set(i)">
                <app-icon [name]="i" [size]="22" />
              </button>
            }
          </div>
        </fieldset>

        <ui-choice label="¿Qué se mide?" [options]="kindOptions" [(value)]="kind" columns="repeat(2, minmax(0, 1fr))" />
        <p class="hint">{{ kindHint() }}</p>

        @if (kind() === 'mision') {
          <ui-select label="Misión" placeholder="Elige una misión" [options]="habits()" [(value)]="habitKey" />
          @if (habitError()) {
            <p class="err" role="alert">{{ habitError() }}</p>
          }
        }
        <fieldset>
          <legend>Meta de cada nivel ({{ unitLabel() }})</legend>
          <div class="tiers">
            @for (t of tiers; track t; let i = $index) {
              <div class="tier">
                <span class="dot" [class]="'p' + (i + 1)" aria-hidden="true"></span>
                <ui-input [label]="t" type="number" inputmode="numeric" [value]="targets()[i]" (valueChange)="setTarget(i, $event)" />
              </div>
            }
          </div>
          @if (targetError()) {
            <p class="err tierr" role="alert">{{ targetError() }}</p>
          }
        </fieldset>

        <div class="actions" [class.one]="!badge()">
          @if (badge()) {
            <button uiBtn variant="danger" type="button" [disabled]="busy()" (click)="asking.set(true)">Quitar</button>
          }
          <button uiBtn type="submit" [disabled]="busy()">{{ busy() ? 'Guardando…' : badge() ? 'Guardar cambios' : 'Agregar insignia' }}</button>
        </div>
      </form>
    </ui-bottom-sheet>
    <ui-confirm-dialog
      [(open)]="asking" [title]="'¿Quitar «' + (badge()?.name ?? '') + '»?'"
      message="Solo se quita la insignia: tus días y tu racha no cambian. Si solo quieres ocultarla de Logros, desactívala."
      confirmLabel="Quitar" alternativeLabel="Solo desactivar" [busy]="busy()" (confirmed)="remove()" (alternative)="deactivate()"
    />
  `,
  styles: `
    form { display: flex; flex-direction: column; gap: 16px; }
    fieldset { margin: 0; padding: 0; border: 0; min-width: 0; }
    legend { padding: 0; margin-bottom: 8px; font-size: 13px; line-height: 16px; font-weight: 600; color: var(--tx2); }
    .icons { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 8px; }
    .icons button {
      display: grid; place-items: center; min-height: var(--touch); border: 0; border-radius: var(--rf-2); background: var(--sf);
      color: var(--tx2); box-shadow: inset 0 0 0 1px var(--bd2); cursor: pointer;
    }
    .icons button.on { background: var(--orf); color: var(--ink); box-shadow: none; }
    .tiers { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
    .tier { display: flex; align-items: flex-end; gap: 8px; }
    .tier ui-input { flex: 1; min-width: 0; }
    .dot { flex: none; width: 12px; height: 12px; margin-bottom: 18px; border-radius: 50%; }
    .dot.p1 { background: var(--tier-1g); }
    .dot.p2 { background: var(--tier-2g); }
    .dot.p3 { background: var(--tier-3g); }
    .dot.p4 { background: var(--tier-4g); }
    .hint { margin-top: -8px; font-size: 13px; line-height: 18px; color: var(--tx2); }
    .err { margin-top: -10px; font-size: 12px; color: var(--rd); font-weight: 500; }
    .tierr { margin-top: 8px; }
    .actions { display: grid; grid-template-columns: auto 1fr; gap: 8px; }
    .actions.one { grid-template-columns: 1fr; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditBadge {
  private readonly svc = inject(BadgesService);
  private readonly config = inject(ConfigService);
  private readonly toasts = inject(ToastService);

  readonly badge = input<BadgeDef | null>(null);
  readonly open = model(false);

  protected readonly icons = BADGE_ICONS;
  protected readonly kindOptions: Option[] = BADGE_KINDS.map((k) => ({ value: k.value, label: k.label }));
  protected readonly name = signal('');
  protected readonly icon = signal<(typeof BADGE_ICONS)[number]>('trophy');
  protected readonly kind = signal<string>('racha');
  protected readonly habitKey = signal('');
  protected readonly tiers = TIERS;
  /** La meta de cada nivel, tal como se escribe. */
  protected readonly targets = signal<string[]>(['', '', '', '']);
  /** Último tipo visto: al cambiarlo, si las metas son las sugeridas del anterior, pasan a las del nuevo. */
  private lastKind: BadgeKind = 'racha';
  protected readonly busy = signal(false);
  protected readonly asking = signal(false);
  private readonly tried = signal(false);

  /** Todas las misiones, también las desactivadas: sus marcas pasadas siguen contando. */
  protected readonly habits = computed<Option[]>(() => this.config.habits().map((h) => ({ value: h.k, label: h.active ? h.name : `${h.name} (inactiva)` })));
  protected readonly kindHint = computed(() => BADGE_KINDS.find((k) => k.value === this.kind())?.hint ?? '');
  protected readonly unitLabel = computed(() => ({ racha: 'días de racha', misiones: 'misiones', xp: 'XP', mision: 'días' })[this.kind() as BadgeKind] ?? '');

  private readonly targetNums = computed(() => this.targets().map((t) => (t.trim() === '' ? null : Number(t))));
  protected readonly nameError = computed(() => (this.tried() && !this.name().trim() ? 'Escribe un nombre' : this.name().trim().length > 40 ? 'Máximo 40 caracteres' : ''));
  protected readonly targetError = computed(() => (this.tried() ? targetsError(this.targetNums()) : ''));
  protected readonly habitError = computed(() => (this.tried() && this.kind() === 'mision' && !this.habitKey() ? 'Elige una misión' : ''));

  constructor() {
    effect(() => {
      if (!this.open()) return;
      const b = this.badge();
      this.name.set(b?.name ?? '');
      this.icon.set(b?.icon && BADGE_ICONS.includes(b.icon) ? b.icon : 'trophy');
      const kind = b?.kind ?? 'racha';
      this.lastKind = kind;
      this.kind.set(kind);
      this.habitKey.set(b?.habitKey ?? '');
      this.targets.set((b?.targets ?? TIER_PRESETS[kind]).map(String));
      this.tried.set(false);
    });
    // Al cambiar el tipo, las metas sugeridas siguen al tipo (si ya las cambiaste a mano, se respetan).
    effect(() => {
      const kind = this.kind() as BadgeKind;
      untracked(() => {
        if (kind === this.lastKind || !TIER_PRESETS[kind]) return;
        if (this.targets().join() === TIER_PRESETS[this.lastKind].join()) this.targets.set(TIER_PRESETS[kind].map(String));
        this.lastKind = kind;
      });
    });
  }

  protected setTarget(i: number, value: string) {
    this.targets.update((t) => t.map((v, j) => (j === i ? value : v)));
  }

  protected async save() {
    this.tried.set(true);
    const name = this.name().trim();
    const kind = this.kind() as BadgeKind;
    if (!name || name.length > 40 || this.targetError() || (kind === 'mision' && !this.habitKey()) || this.busy()) return;
    const draft = { name, icon: this.icon(), kind, targets: this.targetNums() as number[], habitKey: kind === 'mision' ? this.habitKey() : null };
    const b = this.badge();
    this.busy.set(true);
    try {
      if (b) await this.svc.update(b.id, draft);
      else await this.svc.add(draft);
      this.toasts.show({ message: b ? 'Insignia actualizada' : 'Insignia agregada' });
      this.open.set(false);
    } catch {
      this.toasts.error(SAVE_ERROR);
    } finally {
      this.busy.set(false);
    }
  }

  protected async remove() {
    const b = this.badge();
    if (!b) return;
    this.busy.set(true);
    try {
      await this.svc.remove(b.id);
      this.toasts.show({ message: 'Insignia quitada' });
      this.open.set(false);
    } catch {
      this.toasts.error(SAVE_ERROR);
    } finally {
      this.busy.set(false);
      this.asking.set(false);
    }
  }

  /** "Solo desactivar": se oculta de Logros sin perderla. */
  protected async deactivate() {
    const b = this.badge();
    if (!b) return;
    this.busy.set(true);
    try {
      await this.svc.setActive(b.id, false);
      this.toasts.show({ message: 'Insignia desactivada' });
      this.open.set(false);
    } catch {
      this.toasts.error(SAVE_ERROR);
    } finally {
      this.busy.set(false);
      this.asking.set(false);
    }
  }
}

/** Perfil › Insignias: las insignias de Logros. Se activan con el interruptor y, al tocar una, se editan o se quitan. */
@Component({
  selector: 'app-insignias-page',
  imports: [EditBadge, EmptyState, ErrorState, Button, Icon, PageHeader, Skeleton, Switch],
  template: `
    <div class="page">
      <ui-page-header title="Insignias" back="/racha/logros" backLabel="Logros">
        <button uiBtn small type="button" (click)="edit(null)"><app-icon name="plus" [size]="16" />Agregar</button>
      </ui-page-header>
      <p class="hint">Cada insignia tiene cuatro niveles, de Bronce a Platino, con su propia meta. Se ganan solos al llegar a ella: se calculan con tus días, sin guardar nada más. Quitar una insignia no toca tu racha.</p>

      @if (failed()) {
        <ui-error-state message="No se pudieron cargar tus insignias" detail="Revisa tu conexión e intenta de nuevo." (retry)="load()" />
      } @else if (!svc.loaded()) {
        <div class="skel" aria-busy="true" aria-label="Cargando"><ui-skeleton height="220px" radius="12px" /></div>
      } @else {
        <div class="panel scroll">
          @for (b of rows(); track b.def.id) {
            <div class="item" [class.off]="!b.def.active">
              <button type="button" class="txt" (click)="edit(b.def)" [attr.aria-label]="'Editar ' + b.def.name">
                <span class="ico"><app-icon [name]="b.def.icon" [size]="20" /></span>
                <span class="lt"><span class="ln">{{ b.def.name }}</span><span class="ls">{{ b.rule }}</span></span>
              </button>
              <ui-switch [checked]="b.def.active" [label]="(b.def.active ? 'Desactivar ' : 'Activar ') + b.def.name" [disabled]="busy()" (toggled)="setActive(b.def, $event)" />
            </div>
          } @empty {
            <ui-empty-state icon="trophy" title="Aún no hay insignias" text="Crea una con las metas que quieras para Bronce, Plata, Oro y Platino: días de racha, misiones, XP o una misión concreta.">
              <button uiBtn small type="button" (click)="edit(null)"><app-icon name="plus" [size]="16" />Agregar insignia</button>
            </ui-empty-state>
          }
        </div>
      }
    </div>

    <app-edit-badge [badge]="editing()" [(open)]="editOpen" />
  `,
  styles: `
    :host { display: block; }
    .page { display: flex; flex-direction: column; gap: var(--sp-4); max-width: 640px; margin: 0 auto; padding: var(--sp-5) var(--sp-4) var(--sp-6); }
    .hint { font-size: 13px; line-height: 18px; color: var(--tx2); }
    .panel { display: flex; flex-direction: column; border-radius: var(--rf-3); background: var(--sf); box-shadow: inset 0 0 0 1px var(--bd); overflow: hidden; }
    .scroll { max-height: min(60dvh, 560px); overflow-y: auto; scrollbar-gutter: stable; }
    .item { display: flex; align-items: center; gap: 4px; padding: 0 12px 0 4px; min-height: 60px; }
    .item + .item { border-top: 1px solid var(--bd); }
    .item.off .txt { opacity: 0.55; }
    .txt { display: flex; align-items: center; gap: 12px; flex: 1; min-width: 0; min-height: var(--touch); padding: 8px 12px; border: 0; background: none; color: inherit; font: inherit; text-align: left; cursor: pointer; }
    .ico { display: grid; place-items: center; flex: none; width: 40px; height: 40px; border-radius: 50%; background: var(--orf); color: var(--ink); }
    .item.off .ico { background: var(--s2); color: var(--tx3); }
    .lt { display: flex; flex-direction: column; min-width: 0; }
    .ln { font-size: 15px; line-height: 20px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .ls { font-size: 13px; line-height: 18px; color: var(--tx2); overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
    .skel { display: flex; flex-direction: column; gap: var(--sp-3); }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InsigniasPage implements OnInit {
  protected readonly svc = inject(BadgesService);
  private readonly config = inject(ConfigService);
  private readonly toasts = inject(ToastService);

  protected readonly failed = signal(false);
  protected readonly busy = signal(false);
  protected readonly editing = signal<BadgeDef | null>(null);
  protected readonly editOpen = signal(false);

  protected readonly rows = computed(() =>
    this.svc.all().map((def) => ({ def, rule: badgeRule(def, (key) => this.config.habits().find((h) => h.k === key)?.name ?? key) })),
  );

  ngOnInit() {
    this.load();
  }

  protected load() {
    this.failed.set(false);
    // Las misiones (para nombrar las insignias de "una misión") también hacen falta.
    Promise.all([this.svc.load(), this.config.load()]).catch(() => this.failed.set(true));
  }

  protected edit(b: BadgeDef | null) {
    this.editing.set(b);
    this.editOpen.set(true);
  }

  protected async setActive(b: BadgeDef, active: boolean) {
    this.busy.set(true);
    try {
      await this.svc.setActive(b.id, active);
      this.toasts.show({ message: active ? `${b.name} activada` : `${b.name} desactivada` });
    } catch {
      this.toasts.error(SAVE_ERROR);
    } finally {
      this.busy.set(false);
    }
  }
}
