import { Injectable, computed, inject, signal } from '@angular/core';
import { ConfigService } from '../config.service';
import { SupabaseService } from '../supabase.service';
import { ToastService } from '../ui/toast';
import { nextMission } from './mission-groups';
import { Days, computeStreaks, countDone, dateKey } from './streaks';
import { XP_LEVEL, XP_PER } from './habits.config';

/**
 * Estado compartido de la racha: los días marcados, lo que se hizo hoy y la siguiente misión. Lo usan Hoy y Racha
 * para que marcar en una pantalla se vea al instante en la otra.
 */
@Injectable({ providedIn: 'root' })
export class HabitsStore {
  private readonly db = inject(SupabaseService);
  private readonly config = inject(ConfigService);
  private readonly toasts = inject(ToastService);

  readonly days = signal<Days>({});
  readonly loaded = signal(false);
  readonly error = signal(false);
  /** Se refresca al volver a la pestaña: si estuvo abierta toda la noche, "hoy" cambia. */
  readonly today = signal(new Date());
  /** Días de racha al asegurarla hoy: mientras tenga valor se muestra la celebración. */
  readonly celebrating = signal<number | null>(null);

  readonly todayKey = computed(() => dateKey(this.today()));
  readonly goal = this.config.goal;
  readonly streaks = computed(() => computeStreaks(this.days(), this.today(), this.config.racha()));
  readonly xp = computed(() => Object.keys(this.days()).reduce((s, k) => s + this.count(k) * XP_PER, 0));
  readonly level = computed(() => Math.floor(this.xp() / XP_LEVEL) + 1);

  readonly doneToday = computed(() => this.count(this.todayKey()));
  readonly missing = computed(() => Math.max(0, this.goal() - this.doneToday()));
  readonly secured = computed(() => this.doneToday() >= this.goal());
  /** Misiones activas que hoy no se han marcado, en el orden de la lista. */
  readonly pending = computed(() => {
    const marked = this.days()[this.todayKey()] ?? {};
    return this.config.activeHabits().filter((h) => !marked[h.k]);
  });
  readonly next = computed(() => nextMission(this.pending(), this.today()));

  private loading?: Promise<void>;
  private readonly saving = new Map<string, Promise<void>>();

  constructor() {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') this.today.set(new Date());
    });
  }

  /** Carga una sola vez; si falla, se puede reintentar. */
  load(): Promise<void> {
    this.loading ??= Promise.all([this.db.loadDays(), this.config.load()])
      .then(([days]) => {
        this.days.set(days);
        this.error.set(false);
        this.loaded.set(true);
      })
      .catch((e) => {
        this.loading = undefined;
        this.error.set(true);
        throw e;
      });
    return this.loading;
  }

  /** Olvida lo cargado (al cambiar de usuario). */
  reset() {
    this.loading = undefined;
    this.days.set({});
    this.loaded.set(false);
    this.error.set(false);
  }

  /** Marca o desmarca una misión de hoy. Marcar guarda la hora exacta del check; desmarcar la borra. */
  set(habitKey: string, on: boolean) {
    const k = this.todayKey();
    const h = { ...(this.days()[k] ?? {}) };
    if (on) h[habitKey] = new Date().toISOString();
    else delete h[habitKey];
    this.days.update((d) => ({ ...d, [k]: h }));
    // Guarda en orden por día, para que dos toques seguidos no se pisen.
    const prev = this.saving.get(k) ?? Promise.resolve();
    this.saving.set(
      k,
      prev
        .then(() => this.db.saveDay(k, h))
        .catch(() => void this.toasts.error('No se pudo guardar. Intenta de nuevo.')),
    );
  }

  /**
   * Completa una misión de hoy con su aviso ("+10 XP · misión", con "Deshacer" para desmarcarla). Si con esta se
   * llega a la meta del día, pide la celebración.
   */
  complete(habitKey: string, name: string) {
    const before = this.doneToday();
    this.set(habitKey, true);
    const left = this.missing();
    this.toasts.show({
      message: `+${XP_PER} XP · ${name}`,
      detail: left === 0 ? '¡Racha asegurada por hoy!' : `Te ${left === 1 ? 'falta 1' : `faltan ${left}`} para asegurar la racha`,
      tone: 'racha',
      actionLabel: 'Deshacer',
      onAction: () => this.set(habitKey, false),
    });
    if (before < this.goal() && left === 0) this.celebrating.set(this.streaks().cur);
  }

  private count(k: string): number {
    return countDone(this.days(), k, this.config.racha().habitKeys);
  }
}
