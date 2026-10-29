import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ConfigService } from '../config.service';
import { HabitsStore } from '../habits/habits.store';
import { countDone } from '../habits/streaks';
import { Icon } from '../icons/icon';
import { ProgressRing } from '../ui/progress';
import { ErrorState, Skeleton } from '../ui/states';
import { BadgesService } from './badges.service';
import { badgeStates, levelName } from './logros.config';

/** Racha › Logros: nivel y XP, estadísticas y las insignias (ganadas en naranja, bloqueadas con su progreso). */
@Component({
  selector: 'app-logros-page',
  imports: [ErrorState, Icon, ProgressRing, RouterLink, Skeleton],
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
        <ui-progress-ring [size]="88" [stroke]="8" tone="orange" [value]="level().into" [max]="level().size" [label]="'Progreso del nivel ' + level().n">
          <span class="rl">NIVEL</span>
          <span class="rn num">{{ level().n }}</span>
        </ui-progress-ring>
        <div class="lt">
          <span class="ln">{{ level().name }}</span>
          <span class="lx num"><strong>{{ level().xp }}</strong>{{ level().next === null ? '' : ' / ' + level().next }} XP</span>
          <span class="ll">{{ level().next === null ? 'Nivel máximo' : level().left + ' XP para nivel ' + (level().n + 1) }}</span>
          <a class="all" routerLink="/racha/niveles">Ver todos los niveles</a>
        </div>
      </section>

      <section class="stats" aria-label="Estadísticas">
        @for (s of stats(); track s.label) {
          <div class="stat"><span class="sv num">{{ s.value }}</span><span class="sl">{{ s.label }}</span></div>
        }
      </section>

      <section aria-labelledby="ins-h" class="ins">
        <div class="ih">
          <h2 id="ins-h">Insignias</h2>
          <span class="ic">{{ earned() }} de {{ badges().length }}</span>
          <a class="mng" routerLink="/perfil/insignias">Administrar</a>
        </div>
        @if (badgesFailed()) {
          <ui-error-state [inline]="true" message="No se pudieron cargar tus insignias" (retry)="loadBadges()" />
        } @else if (!badgesSvc.loaded()) {
          <div class="grid" aria-busy="true" aria-label="Cargando insignias">
            <ui-skeleton height="120px" radius="20px" /><ui-skeleton height="120px" radius="20px" /><ui-skeleton height="120px" radius="20px" />
          </div>
        } @else if (!badges().length) {
          <p class="none">No tienes insignias activas. <a routerLink="/perfil/insignias">Agrega o activa una</a>.</p>
        }
        <ul class="grid">
          @for (b of badges(); track b.def.id) {
            <li class="badge" [class]="'t' + b.tier" [attr.aria-label]="b.def.name + ': ' + (b.earned ? 'nivel ' + b.tierName : 'sin nivel') + ', ' + b.sub">
              <span class="bi"><app-icon [name]="b.def.icon" [size]="28" /></span>
              <span class="bn">{{ b.def.name }}</span>
              <span class="bt">{{ b.tierName || 'Sin nivel' }}</span>
              <span class="pips" aria-hidden="true">
                @for (p of pips; track p) {
                  <span class="pip" [class]="'p' + p" [class.on]="b.tier >= p"></span>
                }
              </span>
              <span class="bar" aria-hidden="true"><span class="fill" [class]="'p' + (b.tier + 1)" [style.width.%]="b.pct"></span></span>
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
    .all { align-self: flex-start; display: inline-flex; align-items: center; min-height: var(--touch); margin-block: -10px; color: var(--ac); font-size: 14px; font-weight: 600; text-decoration: none; }

    .stats { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
    @media (min-width: 1024px) { .stats { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
    .stat { display: flex; flex-direction: column; gap: 2px; padding: 14px 16px; border-radius: 18px; background: var(--sf); box-shadow: inset 0 0 0 1px var(--bd); }
    .sv { font-size: 26px; line-height: 32px; font-weight: 800; letter-spacing: -0.02em; text-align: left; }
    .sl { font-size: 13px; color: var(--tx2); }

    .ins { display: flex; flex-direction: column; gap: 12px; }
    .ih { display: flex; align-items: baseline; gap: 12px; }
    .ih h2 { flex: 1; }
    .mng { display: inline-flex; align-items: center; min-height: var(--touch); margin-block: -12px; color: var(--ac); font-size: 14px; font-weight: 600; text-decoration: none; }
    .none { font-size: 14px; color: var(--tx2); }
    .none a { color: var(--ac); font-weight: 600; }
    h2 { font-size: 20px; line-height: 28px; font-weight: 700; }
    .ic { font-size: 14px; color: var(--tx2); }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin: 0; padding: 0; list-style: none; }
    @media (min-width: 640px) { .grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
    @media (min-width: 1024px) { .grid { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
    .badge { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 16px 12px 14px; border-radius: var(--rr-2); background: var(--sf); box-shadow: inset 0 0 0 1px var(--bd); text-align: center; }
    .bi { display: grid; place-items: center; width: 64px; height: 64px; margin-bottom: 4px; border-radius: 50%; background: var(--s2); color: var(--tx3); }
    .bn { font-size: 14px; line-height: 18px; font-weight: 600; color: var(--tx2); }
    .bt { font-size: 12px; line-height: 16px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: var(--tx3); }
    .bs { font-size: 12px; line-height: 16px; color: var(--tx2); text-align: center; }
    .badge:not(.t0) .bn { color: var(--tx); }
    .badge:not(.t0) .bt { color: var(--tx2); }
    /* El metal del nivel alcanzado */
    .badge:not(.t0) .bi { color: var(--ink); box-shadow: inset 0 0 0 3px rgb(255 255 255 / 0.45), inset 0 -3px 6px rgb(0 0 0 / 0.14), var(--sh1); }
    .badge.t1 .bi { background: var(--tier-1g); }
    .badge.t2 .bi { background: var(--tier-2g); }
    .badge.t3 .bi { background: var(--tier-3g); }
    .badge.t4 .bi { background: var(--tier-4g); }
    /* Los cuatro niveles, encendidos hasta donde llegó */
    .pips { display: flex; gap: 6px; margin-top: 2px; }
    .pip { width: 10px; height: 10px; border-radius: 50%; background: var(--s3); box-shadow: inset 0 0 0 1px var(--bd2); }
    .pip.on { box-shadow: none; }
    .pip.p1.on { background: var(--tier-1g); }
    .pip.p2.on { background: var(--tier-2g); }
    .pip.p3.on { background: var(--tier-3g); }
    .pip.p4.on { background: var(--tier-4g); }
    /* Avance hacia el siguiente nivel, con el color de ese nivel */
    .bar { width: 100%; height: 6px; border-radius: var(--rr-pill); background: var(--s3); overflow: hidden; }
    .fill { display: block; height: 100%; border-radius: var(--rr-pill); background: var(--tier-4); transition: width 0.35s ease; }
    .fill.p1 { background: var(--tier-1); }
    .fill.p2 { background: var(--tier-2); }
    .fill.p3 { background: var(--tier-3); }
    .fill.p5 { background: var(--tier-4); }
    .skel { display: flex; flex-direction: column; gap: var(--sp-3); }
    .skel .stats { display: grid; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LogrosPage implements OnInit {
  protected readonly store = inject(HabitsStore);
  private readonly config = inject(ConfigService);
  protected readonly badgesSvc = inject(BadgesService);

  protected readonly pips = [1, 2, 3, 4];
  protected readonly failed = signal(false);
  protected readonly badgesFailed = signal(false);

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
    this.loadBadges();
  }

  /** Las insignias se cargan aparte: si fallan, el resto de Logros se sigue viendo. */
  protected loadBadges() {
    this.badgesFailed.set(false);
    this.badgesSvc.load().catch(() => this.badgesFailed.set(true));
  }

  private readonly totalDone = computed(() => {
    const keys = this.config.racha().habitKeys;
    return Object.keys(this.store.days()).reduce((s, k) => s + countDone(this.store.days(), k, keys), 0);
  });

  protected readonly level = computed(() => {
    const xp = this.store.xp();
    const { level: n, next, into, size, left } = this.store.levelInfo();
    return { xp, n, name: levelName(n), next, into, size, left };
  });
  protected readonly stats = computed(() => [
    { value: this.store.streaks().cur, label: 'Días de racha' },
    { value: this.store.streaks().best, label: 'Mejor racha' },
    { value: this.totalDone(), label: 'Misiones hechas' },
    { value: this.store.xp(), label: 'XP totales' },
  ]);
  protected readonly badges = computed(() =>
    badgeStates(
      { days: this.store.days(), streaks: this.store.streaks(), totalDone: this.totalDone(), xp: this.store.xp() },
      this.badgesSvc.active(),
      (key) => this.config.habits().find((h) => h.k === key)?.name ?? key,
    ),
  );
  protected readonly earned = computed(() => this.badges().filter((b) => b.earned).length);
}
