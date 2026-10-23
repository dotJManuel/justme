import { Component, HostListener, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../auth.service';
import { ConfigService } from '../config.service';
import { Habits, SupabaseService } from '../supabase.service';
import { DN, MN, XP_LEVEL, XP_PER } from './habits.config';
import { Days, addDays, computeStreaks, countDone, dateKey, isRestDay, parseKey } from './streaks';

@Component({
  selector: 'app-habits-page',
  imports: [RouterLink],
  templateUrl: './habits-page.html',
  styleUrl: './habits-page.css',
})
export class HabitsPage implements OnInit {
  private readonly db = inject(SupabaseService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly config = inject(ConfigService);

  protected readonly xpPer = XP_PER;

  protected readonly days = signal<Days>({});
  protected readonly loaded = signal(false);
  protected readonly today = signal(new Date());
  protected readonly sel = signal(dateKey(new Date()));
  protected readonly note = signal('');
  protected readonly toast = signal('');

  private toastTimer?: ReturnType<typeof setTimeout>;
  private readonly saving = new Map<string, Promise<void>>();

  private readonly done = (k: string) => countDone(this.days(), k, this.config.racha().habitKeys);

  protected readonly todayKey = computed(() => dateKey(this.today()));
  protected readonly streaks = computed(() => computeStreaks(this.days(), this.today(), this.config.racha()));
  protected readonly xp = computed(
    () => Object.keys(this.days()).reduce((s, k) => s + this.done(k) * XP_PER, 0),
  );
  protected readonly level = computed(() => Math.floor(this.xp() / XP_LEVEL) + 1);
  protected readonly cold = computed(() => this.done(this.todayKey()) < this.config.goal());
  protected readonly iced = computed(() => this.cold() && this.streaks().recovering);

  protected readonly week = computed(() => {
    const goal = this.config.goal();
    const activeDays = this.config.activeDays();
    return [6, 5, 4, 3, 2, 1, 0].map((i) => {
      const d = addDays(this.today(), -i);
      const k = dateKey(d);
      const c = this.done(k);
      const frozen = c < goal && this.streaks().frozen.has(k);
      const state = c >= goal ? 'ok' : frozen ? 'frozen' : c > 0 ? 'part' : isRestDay(d, activeDays) ? 'rest' : '';
      return {
        k,
        c,
        state,
        label: i === 0 ? 'hoy' : DN[d.getDay()],
        aria: `${DN[d.getDay()]} ${d.getDate()}: ${c} misiones${frozen ? ', día congelado' : ''}`,
        text: c >= goal ? '✓' : frozen ? '❄' : String(d.getDate()),
      };
    });
  });

  protected readonly selCount = computed(() => this.done(this.sel()));
  protected readonly progress = computed(() => Math.min(100, (this.selCount() / this.config.goal()) * 100));
  protected readonly selHabits = computed<Habits>(() => this.days()[this.sel()] ?? {});
  protected readonly dayTitle = computed(() => {
    if (this.sel() === this.todayKey()) return 'Misiones de hoy';
    const d = parseKey(this.sel());
    return `${DN[d.getDay()]} ${d.getDate()} ${MN[d.getMonth()]}`;
  });
  protected readonly goalText = computed(() => {
    const c = this.selCount();
    const goal = this.config.goal();
    return c >= goal
      ? `${c} / ${this.config.activeHabits().length} · racha asegurada`
      : `${c} / ${goal} para mantener la racha`;
  });
  protected readonly rule = computed(
    () => `Marca al menos ${this.config.goal()} misiones al día para sumar a tu racha. Los días de descanso no la rompen.`,
  );

  async ngOnInit() {
    try {
      const [days] = await Promise.all([this.db.loadDays(), this.config.load()]);
      this.days.set(days);
      this.loaded.set(true);
    } catch {
      this.note.set('No se pudieron cargar tus datos. Recarga la página.');
    }
  }

  /** Si la pestaña estuvo abierta toda la noche, "hoy" cambia al volver a ella. */
  @HostListener('document:visibilitychange')
  protected refreshToday() {
    if (document.visibilityState === 'visible') this.today.set(new Date());
  }

  protected select(k: string) {
    this.sel.set(k);
  }

  protected toggle(hk: string) {
    const k = this.sel();
    const before = this.done(k);
    const h = { ...(this.days()[k] ?? {}) };
    h[hk] = !h[hk];
    this.days.update((d) => ({ ...d, [k]: h }));
    if (before < this.config.goal() && this.done(k) >= this.config.goal()) {
      this.showToast(k === this.todayKey() ? '¡Racha asegurada por hoy! 🔥' : 'Día completado ✓');
    }
    this.persist(k, h);
  }

  protected async signOut() {
    await this.auth.signOut();
    await this.router.navigate(['/login']);
  }

  /** Guarda en orden por día, para que dos toques seguidos no se pisen. */
  private persist(k: string, habits: Habits) {
    const prev = this.saving.get(k) ?? Promise.resolve();
    this.saving.set(
      k,
      prev
        .then(() => this.db.saveDay(k, habits))
        .catch(() => this.showToast('No se pudo guardar. Intenta de nuevo.')),
    );
  }

  private showToast(msg: string) {
    this.toast.set(msg);
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toast.set(''), 2200);
  }
}
