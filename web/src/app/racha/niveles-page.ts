import { ChangeDetectionStrategy, Component, ElementRef, OnInit, afterNextRender, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ConfigService } from '../config.service';
import { HabitsStore } from '../habits/habits.store';
import { Icon } from '../icons/icon';
import { ProgressBar } from '../ui/progress';
import { ErrorState, Skeleton } from '../ui/states';
import { levelName } from './logros.config';

type RowState = 'done' | 'cur' | 'todo';

const fmt = (n: number) => n.toLocaleString('es-MX');

/** Racha › Niveles: todos los niveles hasta el máximo, con la experiencia que pide cada uno y en cuál vas. */
@Component({
  selector: 'app-niveles-page',
  imports: [ErrorState, Icon, ProgressBar, RouterLink, Skeleton],
  template: `
    <a class="back" routerLink="/racha/logros"><app-icon name="chevron-left" [size]="18" />Logros</a>
    <h2>Niveles</h2>

    @if (failed()) {
      <ui-error-state message="No se pudieron cargar tus datos" detail="Revisa tu conexión e intenta de nuevo." (retry)="load()" />
    } @else if (!store.loaded()) {
      <div class="skel" aria-busy="true" aria-label="Cargando"><ui-skeleton height="72px" radius="20px" /><ui-skeleton height="360px" radius="20px" /></div>
    } @else {
      <p class="sum">
        Vas en el <strong>nivel {{ info().level }}</strong> con <strong class="num">{{ fmt(store.xp()) }} XP</strong>.
        Cada nivel pide más que el anterior hasta el {{ rows().length }}, que se alcanza con
        <span class="num">{{ fmt(last()) }} XP</span>.
      </p>
      <p class="note">La experiencia de los niveles que te faltan se ajusta sola cuando agregas o quitas misiones. Los que ya alcanzaste no cambian.</p>

      <ol class="list" aria-label="Niveles">
        @for (r of rows(); track r.n) {
          <li class="row" [class]="r.state" [attr.aria-current]="r.state === 'cur' ? 'step' : null">
            <span class="n num">
              @if (r.state === 'done') { <app-icon name="check" [size]="16" /> } @else { {{ r.n }} }
            </span>
            <span class="t">
              <span class="ln">{{ r.name }}</span>
              <span class="ls">{{ r.sub }}</span>
              @if (r.state === 'cur' && info().next !== null) {
                <ui-progress-bar tone="orange" [height]="8" [value]="info().into" [max]="info().size" [label]="'Progreso del nivel ' + r.n" />
                <span class="lf num">{{ fmt(store.xp()) }} / {{ fmt(info().next!) }} XP · faltan {{ fmt(info().left) }}</span>
              }
            </span>
            <span class="xp num">{{ fmt(r.total) }} XP</span>
          </li>
        }
      </ol>
    }
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: var(--sp-3); }
    .back { align-self: flex-start; display: inline-flex; align-items: center; gap: 2px; min-height: var(--touch); margin: -8px 0 -12px -6px; padding-right: 8px; color: var(--ac); font-size: 14px; font-weight: 600; text-decoration: none; }
    h2 { font-size: 20px; line-height: 28px; font-weight: 700; }
    .sum { font-size: 15px; line-height: 22px; color: var(--tx2); }
    .sum strong { color: var(--tx); }
    .note { font-size: 13px; line-height: 18px; color: var(--tx2); }
    .skel { display: flex; flex-direction: column; gap: var(--sp-3); }

    .list { position: relative; margin: 0; padding: 0; list-style: none; border-radius: var(--rr-2); background: var(--sf); box-shadow: inset 0 0 0 1px var(--bd); max-height: min(70dvh, 640px); overflow-y: auto; scrollbar-gutter: stable; }
    .row { display: flex; align-items: flex-start; gap: 12px; padding: 12px 16px; }
    .row + .row { border-top: 1px solid var(--bd); }
    .n { display: grid; place-items: center; flex: none; width: 32px; height: 32px; border-radius: 50%; background: var(--s2); color: var(--tx3); font-size: 13px; font-weight: 700; }
    .t { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
    .ln { font-size: 15px; line-height: 20px; font-weight: 600; }
    .ls { font-size: 13px; line-height: 18px; color: var(--tx2); }
    .lf { font-size: 12px; line-height: 16px; color: var(--or); font-weight: 600; }
    .t ui-progress-bar { margin-top: 6px; }
    .xp { flex: none; padding-top: 6px; font-size: 14px; color: var(--tx2); text-align: right; }

    .row.done .n { background: var(--grs); color: var(--gr); }
    .row.done .ln { color: var(--tx2); }
    .row.cur { background: var(--ors); }
    .row.cur .n { background: var(--orf); color: var(--ink); }
    .row.cur .xp { color: var(--tx); font-weight: 600; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NivelesPage implements OnInit {
  protected readonly store = inject(HabitsStore);
  private readonly config = inject(ConfigService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly fmt = fmt;
  protected readonly failed = signal(false);
  protected readonly info = this.store.levelInfo;

  protected readonly rows = computed(() => {
    const th = this.config.levels();
    const current = this.info().level;
    return th.map((total, i) => {
      const n = i + 1;
      const state: RowState = n < current ? 'done' : n === current ? 'cur' : 'todo';
      const sub = n === 1 ? 'Inicio' : n === th.length ? `Nivel máximo · +${fmt(total - th[i - 1])} XP` : `+${fmt(total - th[i - 1])} XP sobre el anterior`;
      return { n, name: levelName(n), total, state, sub };
    });
  });
  protected readonly last = computed(() => this.config.levels().at(-1) ?? 0);

  constructor() {
    // El nivel actual queda a la vista dentro de la lista al abrir
    afterNextRender(() => this.showCurrent());
  }

  async ngOnInit() {
    await this.load();
  }

  protected async load() {
    this.failed.set(false);
    try {
      await Promise.all([this.store.load(), this.config.load()]);
      setTimeout(() => this.showCurrent());
    } catch {
      this.failed.set(true);
    }
  }

  private showCurrent() {
    const list = this.host.nativeElement.querySelector<HTMLElement>('.list');
    const cur = list?.querySelector<HTMLElement>('.row.cur');
    if (list && cur) list.scrollTop = cur.offsetTop - list.clientHeight / 2 + cur.clientHeight / 2;
  }
}
