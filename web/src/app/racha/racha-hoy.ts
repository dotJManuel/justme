import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ConfigService } from '../config.service';
import { DN, MN, XP_LEVEL, XP_PER } from '../habits/habits.config';
import { HabitsStore } from '../habits/habits.store';
import { addDays, countDone, dateKey, doneAtLabel, isRestDay, parseKey } from '../habits/streaks';
import { Icon } from '../icons/icon';
import { Button } from '../ui/button';
import { ProgressBar } from '../ui/progress';
import { ErrorState, Skeleton } from '../ui/states';
import { BadgesService } from './badges.service';
import { badgeStates, levelName } from './logros.config';

type DayState = 'ok' | 'frozen' | 'part' | 'rest' | 'miss' | '';

interface Mission {
  k: string;
  name: string;
  /** Horario o nota de la misión. */
  when: string;
  group: string;
  /** Hora en que se marcó ("08:15"), vacía si no se guardó. */
  at: string;
  on: boolean;
}

/**
 * Racha › Hoy. La lógica es la de siempre (meta diaria, días de descanso, congelaciones, solo se marca el día de
 * hoy y los anteriores se consultan); solo cambia cómo se ve.
 */
@Component({
  selector: 'app-racha-hoy',
  imports: [Button, ErrorState, Icon, NgTemplateOutlet, ProgressBar, RouterLink, Skeleton],
  templateUrl: './racha-hoy.html',
  styleUrl: './racha-hoy.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RachaHoy implements OnInit {
  protected readonly store = inject(HabitsStore);
  protected readonly config = inject(ConfigService);
  private readonly badgesSvc = inject(BadgesService);

  protected readonly xpPer = XP_PER;
  protected readonly failed = signal(false);
  /** Día que se está viendo (aaaa-mm-dd); solo el de hoy se puede marcar. */
  protected readonly sel = signal(dateKey(new Date()));
  protected readonly showDone = signal(false);

  async ngOnInit() {
    await this.load();
    // Para contar las insignias ganadas (tarjeta de nivel, escritorio); si no cargan, el conteo queda en 0.
    this.badgesSvc.load().catch(() => undefined);
  }

  protected async load() {
    this.failed.set(false);
    try {
      await this.store.load();
    } catch {
      this.failed.set(true);
    }
  }

  private readonly done = (k: string) => countDone(this.store.days(), k, this.config.racha().habitKeys);

  protected readonly todayKey = this.store.todayKey;
  protected readonly streaks = this.store.streaks;
  protected readonly cold = computed(() => this.done(this.todayKey()) < this.config.goal());
  protected readonly iced = computed(() => this.cold() && this.streaks().recovering);
  protected readonly canEdit = computed(() => this.sel() === this.todayKey());
  protected readonly atBest = computed(() => this.streaks().cur > 0 && this.streaks().cur >= this.streaks().best);

  protected readonly week = computed(() => {
    const goal = this.config.goal();
    const activeDays = this.config.activeDays();
    return [6, 5, 4, 3, 2, 1, 0].map((i) => {
      const d = addDays(this.store.today(), -i);
      const k = dateKey(d);
      const c = this.done(k);
      const frozen = c < goal && this.streaks().frozen.has(k);
      const state: DayState = c >= goal ? 'ok' : frozen ? 'frozen' : c > 0 ? 'part' : isRestDay(d, activeDays) ? 'rest' : 'miss';
      return {
        k,
        state,
        today: i === 0,
        label: i === 0 ? 'hoy' : DN[d.getDay()],
        num: d.getDate(),
        aria: `${DN[d.getDay()]} ${d.getDate()}: ${c} misiones${frozen ? ', día congelado' : ''}${i === 0 ? ' (hoy)' : ''}`,
      };
    });
  });

  // ── Misiones del día elegido
  protected readonly selCount = computed(() => this.done(this.sel()));
  protected readonly segments = computed(() => (this.config.goal() <= 12 ? this.config.goal() : 0));
  protected readonly dayTitle = computed(() => {
    if (this.sel() === this.todayKey()) return 'Misiones de hoy';
    const d = parseKey(this.sel());
    return `${DN[d.getDay()]} ${d.getDate()} ${MN[d.getMonth()]}`;
  });
  protected readonly goalText = computed(() => {
    const c = this.selCount();
    const goal = this.config.goal();
    return c >= goal ? `${c} / ${this.config.activeHabits().length} · racha asegurada` : `${c} / ${goal} para mantener la racha`;
  });
  protected readonly rule = computed(
    () => `Marca al menos ${this.config.goal()} misiones al día para sumar a tu racha. Los días de descanso no la rompen.`,
  );

  private readonly missions = computed<Mission[]>(() => {
    const marks = this.store.days()[this.sel()] ?? {};
    return this.config.activeHabits().map((h) => ({
      k: h.k, name: h.name, when: h.when, group: this.config.groupName(h), at: doneAtLabel(marks[h.k], this.sel()), on: !!marks[h.k],
    }));
  });
  /** Los grupos que tienen misiones, en el orden de los grupos. */
  private readonly groupNames = computed(() => this.config.orderGroups(this.missions().map((m) => m.group)));
  /** Móvil: lo que falta, por grupo. */
  protected readonly groups = computed(() =>
    this.groupNames().map((name) => ({ name, items: this.missions().filter((m) => !m.on && m.group === name) })).filter((g) => g.items.length),
  );
  protected readonly completed = computed(() => this.missions().filter((m) => m.on));
  /** Escritorio: todas, por grupo, con cuántas van. */
  protected readonly allGroups = computed(() =>
    this.groupNames().map((name) => {
      const items = this.missions().filter((m) => m.group === name);
      return { name, items, done: items.filter((m) => m.on).length };
    }).filter((g) => g.items.length),
  );
  /** En un día anterior la lista de hechas va abierta: es lo que se viene a consultar. */
  protected readonly doneOpen = computed(() => this.showDone() || !this.canEdit());

  // ── Nivel (en escritorio, junto a la racha)
  protected readonly level = computed(() => {
    const xp = this.store.xp();
    const lvl = this.store.level();
    const days = this.store.days();
    const totalDone = Object.keys(days).reduce((s, k) => s + this.done(k), 0);
    const earned = badgeStates({ days, streaks: this.streaks(), totalDone, xp }, this.badgesSvc.active()).filter((b) => b.earned).length;
    return { xp, lvl, name: levelName(lvl), into: xp % XP_LEVEL, left: XP_LEVEL - (xp % XP_LEVEL), earned };
  });
  protected readonly XP_LEVEL = XP_LEVEL;

  protected select(k: string) {
    this.sel.set(k);
  }

  protected toggle(m: Mission, marked: boolean) {
    if (!this.canEdit()) return;
    if (marked) this.store.set(m.k, false);
    else this.store.complete(m.k, m.name);
  }
}
