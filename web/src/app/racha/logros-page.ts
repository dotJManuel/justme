import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { ConfigService } from '../config.service';
import { XP_LEVEL } from '../habits/habits.config';
import { HabitsStore } from '../habits/habits.store';
import { countDone } from '../habits/streaks';
import { Icon } from '../icons/icon';
import { ProgressRing } from '../ui/progress';
import { ErrorState, Skeleton } from '../ui/states';
import { BADGES, badgeStates, levelName } from './logros.config';

/** Racha › Logros: nivel y XP, estadísticas y las insignias (ganadas en naranja, bloqueadas con su progreso). */
@Component({
  selector: 'app-logros-page',
  imports: [ErrorState, Icon, ProgressRing, Skeleton],
  template: `
    @if (failed()) {
      <ui-error-state message="No se pudieron cargar tus datos" detail="Revisa tu conexión e intenta de nuevo." (retry)="load()" />
    } @else if (!store.loaded()) {
      <div class="skel" aria-busy="true" aria-label="Cargando">
        <ui-skeleton height="128px" radius="24px" />
        <div class="stats"><ui-skeleton height="68px" radius="18px" /><ui-skeleton height="68px" radius="18px" /><ui-skeleton height="68px" radius="18px" /><ui-skeleton height="68px" radius="18px" /></div>
        <ui-skeleton height="140px" radius="20px" />
      </div>
    } @else {
      <section class="level" aria-label="Nivel">
        <ui-progress-ring [size]="88" [stroke]="8" tone="orange" [value]="level().into" [max]="XP_LEVEL" [label]="'Progreso del nivel ' + level().n">
          <span class="rl">NIVEL</span>
          <span class="rn num">{{ level().n }}</span>
        </ui-progress-ring>
        <div class="lt">
          <span class="ln">{{ level().name }}</span>
          <span class="lx num"><strong>{{ level().xp }}</strong> / {{ level().n * XP_LEVEL }} XP</span>
          <span class="ll">{{ level().left }} XP para nivel {{ level().n + 1 }}</span>
        </div>
      </section>

      <section class="stats" aria-label="Estadísticas">
        @for (s of stats(); track s.label) {
          <div class="stat"><span class="sv num">{{ s.value }}</span><span class="sl">{{ s.label }}</span></div>
        }
      </section>

      <section aria-labelledby="ins-h" class="ins">
        <div class="ih"><h2 id="ins-h">Insignias</h2><span class="ic">{{ earned() }} de {{ badges().length }}</span></div>
        <ul class="grid">
          @for (b of badges(); track b.def.id) {
            <li class="badge" [class.on]="b.earned" [attr.aria-label]="b.def.name + ': ' + (b.earned ? 'ganada' : b.def.rule + ', ' + b.sub)">
              <span class="bi"><app-icon [name]="b.def.icon" [size]="26" /></span>
              <span class="bn">{{ b.def.name }}</span>
              <span class="bs num">{{ b.sub }}</span>
            </li>
          }
        </ul>
      </section>
    }
  `,
  styles: `
    :host { display: contents; }
    .level { display: flex; align-items: center; gap: 18px; padding: 20px; border-radius: 24px; background: var(--sf); box-shadow: var(--sh1), inset 0 0 0 1px var(--bd); }
    .rl { font-size: 11px; line-height: 14px; font-weight: 600; letter-spacing: 0.06em; color: var(--tx2); }
    .rn { font-size: 28px; line-height: 30px; font-weight: 800; text-align: center; }
    .lt { display: flex; flex-direction: column; gap: 6px; flex: 1; min-width: 0; }
    .ln { font-size: 18px; font-weight: 700; }
    .lx { font-size: 14px; color: var(--tx2); text-align: left; }
    .lx strong { color: var(--tx); }
    .ll { font-size: 13px; font-weight: 600; color: var(--or); }

    .stats { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
    @media (min-width: 1024px) { .stats { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
    .stat { display: flex; flex-direction: column; gap: 2px; padding: 14px 16px; border-radius: 18px; background: var(--sf); box-shadow: inset 0 0 0 1px var(--bd); }
    .sv { font-size: 26px; line-height: 32px; font-weight: 800; letter-spacing: -0.02em; text-align: left; }
    .sl { font-size: 13px; color: var(--tx2); }

    .ins { display: flex; flex-direction: column; gap: 12px; }
    .ih { display: flex; justify-content: space-between; align-items: baseline; }
    h2 { font-size: 20px; line-height: 28px; font-weight: 700; }
    .ic { font-size: 14px; color: var(--tx2); }
    .grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin: 0; padding: 0; list-style: none; }
    @media (min-width: 1024px) { .grid { grid-template-columns: repeat(6, minmax(0, 1fr)); } }
    .badge { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 16px 8px 14px; border-radius: var(--rr-2); background: var(--sf); box-shadow: inset 0 0 0 1px var(--bd); text-align: center; }
    .bi { display: grid; place-items: center; width: 56px; height: 56px; border-radius: 50%; background: var(--s2); color: var(--tx3); }
    .bn { font-size: 13px; line-height: 16px; font-weight: 600; color: var(--tx2); }
    .bs { font-size: 12px; line-height: 16px; color: var(--tx2); text-align: center; }
    .badge.on .bi { background: var(--orf); color: var(--ink); }
    .badge.on .bn { color: var(--tx); }
    .skel { display: flex; flex-direction: column; gap: var(--sp-3); }
    .skel .stats { display: grid; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LogrosPage implements OnInit {
  protected readonly store = inject(HabitsStore);
  private readonly config = inject(ConfigService);

  protected readonly XP_LEVEL = XP_LEVEL;
  protected readonly failed = signal(false);

  async ngOnInit() {
    await this.load();
  }

  protected async load() {
    this.failed.set(false);
    try {
      await this.store.load();
    } catch {
      this.failed.set(true);
    }
  }

  private readonly totalDone = computed(() => {
    const keys = this.config.racha().habitKeys;
    return Object.keys(this.store.days()).reduce((s, k) => s + countDone(this.store.days(), k, keys), 0);
  });

  protected readonly level = computed(() => {
    const xp = this.store.xp();
    const n = this.store.level();
    return { xp, n, name: levelName(n), into: xp % XP_LEVEL, left: XP_LEVEL - (xp % XP_LEVEL) };
  });
  protected readonly stats = computed(() => [
    { value: this.store.streaks().cur, label: 'Días de racha' },
    { value: this.store.streaks().best, label: 'Mejor racha' },
    { value: this.totalDone(), label: 'Misiones hechas' },
    { value: this.store.xp(), label: 'XP totales' },
  ]);
  protected readonly badges = computed(() =>
    badgeStates({ days: this.store.days(), streaks: this.store.streaks(), totalDone: this.totalDone() }, BADGES),
  );
  protected readonly earned = computed(() => this.badges().filter((b) => b.earned).length);
}
