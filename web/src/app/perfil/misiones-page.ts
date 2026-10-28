import { ChangeDetectionStrategy, Component, OnInit, computed, effect, inject, input, model, signal } from '@angular/core';
import { ConfigService, HabitItem } from '../config.service';
import { DN } from '../habits/habits.config';
import { Icon } from '../icons/icon';
import { BottomSheet } from '../ui/bottom-sheet';
import { Button } from '../ui/button';
import { Chip } from '../ui/chip';
import { Switch } from '../ui/fields';
import { Input } from '../ui/input';
import { PageHeader } from '../ui/page-header';
import { ErrorState, Skeleton } from '../ui/states';
import { ToastService } from '../ui/toast';

const SAVE_ERROR = 'No se pudo guardar. Revisa tu conexión e intenta de nuevo.';

/** Agregar o renombrar una misión (nombre y horario o nota). */
@Component({
  selector: 'app-edit-habit',
  imports: [BottomSheet, Button, Input],
  template: `
    <ui-bottom-sheet [title]="habit() ? 'Editar misión' : 'Nueva misión'" [(open)]="open">
      <form (submit)="$event.preventDefault(); save()" novalidate>
        <ui-input label="Nombre" placeholder="Ej. LeetCode" [(value)]="name" [error]="error()" />
        <ui-input label="Horario o nota (opcional)" placeholder="Ej. 7:40 – 8:40" [(value)]="when" />
        <button uiBtn block type="submit" [disabled]="busy()">{{ busy() ? 'Guardando…' : habit() ? 'Guardar cambios' : 'Agregar misión' }}</button>
      </form>
    </ui-bottom-sheet>
  `,
  styles: `form { display: flex; flex-direction: column; gap: 16px; }`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditHabit {
  private readonly config = inject(ConfigService);
  private readonly toasts = inject(ToastService);
  readonly habit = input<HabitItem | null>(null);
  readonly open = model(false);

  protected readonly name = signal('');
  protected readonly when = signal('');
  protected readonly busy = signal(false);
  private readonly tried = signal(false);
  protected readonly error = computed(() => (this.tried() && !this.name().trim() ? 'Escribe el nombre de la misión' : ''));

  constructor() {
    effect(() => {
      if (!this.open()) return;
      const h = this.habit();
      this.name.set(h?.name ?? '');
      this.when.set(h?.when ?? '');
      this.tried.set(false);
    });
  }

  protected async save() {
    this.tried.set(true);
    const name = this.name().trim();
    const when = this.when().trim();
    if (!name || this.busy()) return;
    const h = this.habit();
    this.busy.set(true);
    try {
      if (h) {
        const patch: Partial<Omit<HabitItem, 'k'>> = {};
        if (name !== h.name) patch.name = name;
        if (when !== h.when) patch.when = when;
        if (Object.keys(patch).length) await this.config.updateHabit(h.k, patch);
      } else {
        await this.config.addHabit(name, when);
      }
      this.toasts.show({ message: h ? 'Misión actualizada' : 'Misión agregada' });
      this.open.set(false);
    } catch {
      this.toasts.error(SAVE_ERROR);
    } finally {
      this.busy.set(false);
    }
  }
}

/**
 * Perfil › Misiones y meta: la meta diaria, la congelación, los días obligatorios y la lista de misiones. Las mismas
 * reglas de siempre (por ejemplo, desactivar una misión la oculta pero sus marcas pasadas siguen contando).
 */
@Component({
  selector: 'app-misiones-page',
  imports: [Button, Chip, EditHabit, ErrorState, Icon, Input, PageHeader, Skeleton, Switch],
  template: `
    <div class="page">
      <ui-page-header title="Misiones" />

      @if (failed()) {
        <ui-error-state message="No se pudieron cargar los ajustes" detail="Revisa tu conexión e intenta de nuevo." (retry)="load()" />
      } @else if (!loaded()) {
        <div class="skel" aria-busy="true" aria-label="Cargando"><ui-skeleton height="260px" radius="12px" /><ui-skeleton height="240px" radius="12px" /></div>
      } @else {
        <section class="card" aria-labelledby="rc-h">
          <h2 id="rc-h">Racha</h2>
          <ui-input label="Misiones por día para mantener la racha" type="number" inputmode="numeric" [(value)]="goal" [error]="goalError()" />
          @if (tooHigh()) {
            <p class="warn">Tienes menos misiones activas ({{ config.activeHabits().length }}) que esta meta: no podrás cumplirla.</p>
          }
          <ui-input label="Días cumplidos para ganar una congelación" type="number" inputmode="numeric" [(value)]="freezeMin" [error]="freezeError()" />
          <fieldset>
            <legend>Días obligatorios</legend>
            <div class="chips">
              @for (d of weekdays; track d.n) {
                <ui-chip [interactive]="true" [selected]="days().includes(d.n)" (click)="toggleDay(d.n)">{{ d.label }}</ui-chip>
              }
            </div>
            @if (daysError()) {
              <p class="err" role="alert">{{ daysError() }}</p>
            } @else {
              <p class="hint">Los días no marcados son de descanso: no rompen la racha.</p>
            }
          </fieldset>
          <p class="hint">Los cambios se aplican también a tu historial, así que tu racha puede variar.</p>
          <button uiBtn block type="button" [disabled]="!dirty() || !valid() || busy()" (click)="saveSettings()">Guardar ajustes</button>
        </section>

        <section aria-labelledby="ms-h">
          <div class="sec"><h2 id="ms-h" class="l">Misiones · {{ config.habits().length }}</h2><button type="button" class="add" (click)="edit(null)"><app-icon name="plus" [size]="16" />Agregar</button></div>
          <div class="panel scroll">
            @for (h of config.habits(); track h.k; let first = $first; let last = $last) {
              <div class="item" [class.off]="!h.active">
                <button type="button" class="txt" (click)="edit(h)" [attr.aria-label]="'Editar ' + h.name">
                  <span class="ln">{{ h.name }}</span>
                  <span class="ls">{{ h.when || 'Sin horario' }}</span>
                </button>
                <button type="button" class="mv" aria-label="Subir" [disabled]="first || busy()" (click)="move(h.k, -1)"><app-icon name="chevron-up" [size]="18" /></button>
                <button type="button" class="mv" aria-label="Bajar" [disabled]="last || busy()" (click)="move(h.k, 1)"><app-icon name="chevron-down" [size]="18" /></button>
                <ui-switch [checked]="h.active" [label]="(h.active ? 'Desactivar ' : 'Activar ') + h.name" [disabled]="busy()" (toggled)="setActive(h.k, $event)" />
              </div>
            }
          </div>
          <p class="hint pad">Desactivar una misión la oculta, pero sus marcas pasadas siguen contando en tu historial.</p>
        </section>
      }
    </div>

    <app-edit-habit [habit]="editing()" [(open)]="editOpen" />
  `,
  styles: `
    :host { display: block; }
    .page { display: flex; flex-direction: column; gap: var(--sp-4); max-width: 640px; margin: 0 auto; padding: var(--sp-5) var(--sp-4) var(--sp-6); }
    .card { display: flex; flex-direction: column; gap: 16px; padding: 20px; border-radius: var(--rf-3); background: var(--sf); box-shadow: var(--sh1), inset 0 0 0 1px var(--bd); }
    h2 { font-size: 18px; line-height: 24px; font-weight: 700; }
    h2.l { font-size: 13px; line-height: 16px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: var(--tx3); }
    fieldset { margin: 0; padding: 0; border: 0; display: flex; flex-direction: column; gap: 8px; }
    legend { padding: 0; margin-bottom: 8px; font-size: 13px; font-weight: 600; color: var(--tx2); }
    .chips { display: flex; flex-wrap: wrap; gap: 8px; }
    .hint { font-size: 13px; line-height: 18px; color: var(--tx2); }
    .hint.pad { padding: 8px 4px 0; }
    .warn { font-size: 13px; line-height: 18px; color: var(--yl); font-weight: 500; margin-top: -8px; }
    .err { font-size: 12px; color: var(--rd); font-weight: 500; }
    .sec { display: flex; justify-content: space-between; align-items: center; padding: 0 4px; margin-bottom: 6px; }
    .add { display: flex; align-items: center; gap: 4px; min-height: var(--touch); padding: 0 4px; border: 0; background: none; color: var(--ac); font: inherit; font-size: 14px; font-weight: 600; cursor: pointer; }
    .panel { display: flex; flex-direction: column; border-radius: var(--rf-3); background: var(--sf); box-shadow: inset 0 0 0 1px var(--bd); overflow: hidden; }
    .scroll { max-height: min(60dvh, 560px); overflow-y: auto; scrollbar-gutter: stable; }
    .item { display: flex; align-items: center; gap: 4px; padding: 0 8px 0 4px; min-height: 56px; }
    .item + .item { border-top: 1px solid var(--bd); }
    .item.off .txt { opacity: 0.55; }
    .txt { display: flex; flex-direction: column; flex: 1; min-width: 0; min-height: var(--touch); padding: 6px 12px; border: 0; background: none; color: inherit; font: inherit; text-align: left; cursor: pointer; }
    .ln { font-size: 15px; line-height: 20px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .ls { font-size: 13px; line-height: 18px; color: var(--tx2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .mv { display: grid; place-items: center; flex: none; width: var(--touch); height: var(--touch); border: 0; background: none; color: var(--tx2); cursor: pointer; }
    .mv:disabled { opacity: 0.3; cursor: default; }
    .skel { display: flex; flex-direction: column; gap: var(--sp-3); }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MisionesPage implements OnInit {
  protected readonly config = inject(ConfigService);
  private readonly toasts = inject(ToastService);

  /** Lunes primero; el valor es el número de día de JavaScript (0 = domingo). */
  protected readonly weekdays = [1, 2, 3, 4, 5, 6, 0].map((n) => ({ n, label: DN[n] }));

  protected readonly loaded = signal(false);
  protected readonly failed = signal(false);
  protected readonly goal = signal('0');
  protected readonly freezeMin = signal('0');
  protected readonly days = signal<number[]>([]);
  protected readonly busy = signal(false);

  private readonly goalN = computed(() => Number(this.goal()));
  private readonly freezeN = computed(() => Number(this.freezeMin()));
  private readonly goalOk = computed(() => Number.isInteger(this.goalN()) && this.goalN() >= 1 && this.goalN() <= 50);
  private readonly freezeOk = computed(() => Number.isInteger(this.freezeN()) && this.freezeN() >= 1 && this.freezeN() <= 365);
  protected readonly goalError = computed(() => (this.goalOk() ? '' : 'Un número entero del 1 al 50'));
  protected readonly freezeError = computed(() => (this.freezeOk() ? '' : 'Un número entero del 1 al 365'));
  protected readonly daysError = computed(() => (this.days().length ? '' : 'Elige al menos un día obligatorio'));
  protected readonly valid = computed(() => this.goalOk() && this.freezeOk() && this.days().length >= 1);
  protected readonly dirty = computed(
    () =>
      this.goalN() !== this.config.goal() ||
      this.freezeN() !== this.config.freezeMin() ||
      [...this.days()].sort().join() !== [...this.config.activeDays()].sort().join(),
  );
  protected readonly tooHigh = computed(() => this.goalN() > this.config.activeHabits().length);

  protected readonly editing = signal<HabitItem | null>(null);
  protected readonly editOpen = signal(false);

  ngOnInit() {
    void this.load();
  }

  protected async load() {
    this.failed.set(false);
    try {
      await this.config.load();
      this.goal.set(String(this.config.goal()));
      this.freezeMin.set(String(this.config.freezeMin()));
      this.days.set([...this.config.activeDays()]);
      this.loaded.set(true);
    } catch {
      this.failed.set(true);
    }
  }

  protected toggleDay(n: number) {
    this.days.update((d) => (d.includes(n) ? d.filter((x) => x !== n) : [...d, n]));
  }

  protected edit(h: HabitItem | null) {
    this.editing.set(h);
    this.editOpen.set(true);
  }

  protected saveSettings() {
    return this.run('Ajustes guardados', () => this.config.saveSettings(this.goalN(), this.freezeN(), this.days()));
  }
  protected setActive(k: string, active: boolean) {
    return this.run('', () => this.config.updateHabit(k, { active }));
  }
  protected move(k: string, dir: -1 | 1) {
    return this.run('', () => this.config.move(k, dir));
  }

  private async run(okMessage: string, action: () => Promise<void>) {
    this.busy.set(true);
    try {
      await action();
      if (okMessage) this.toasts.show({ message: okMessage });
    } catch {
      this.toasts.error(SAVE_ERROR);
    } finally {
      this.busy.set(false);
    }
  }
}
