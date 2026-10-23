import { Component, HostListener, OnInit, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../auth.service';
import { Habits, SupabaseService } from '../supabase.service';
import { DN, GOAL, HABITS, MN, XP_LEVEL, XP_PER } from './habits.config';
import { Days, addDays, computeStreaks, countDone, dateKey, isWeekend, parseKey } from './streaks';

@Component({
  selector: 'app-habits-page',
  templateUrl: './habits-page.html',
  styleUrl: './habits-page.css',
})
export class HabitsPage implements OnInit {
  private readonly db = inject(SupabaseService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly habits = HABITS;
  protected readonly goal = GOAL;
  protected readonly xpPer = XP_PER;

  protected readonly days = signal<Days>({});
  protected readonly today = signal(new Date());
  protected readonly sel = signal(dateKey(new Date()));
  protected readonly note = signal(`Marca al menos ${GOAL} misiones al día para sumar a tu racha. Sábado y domingo no la rompen.`);
  protected readonly toast = signal('');

  private toastTimer?: ReturnType<typeof setTimeout>;
  private readonly saving = new Map<string, Promise<void>>();

  protected readonly todayKey = computed(() => dateKey(this.today()));
  protected readonly streaks = computed(() => computeStreaks(this.days(), this.today()));
  protected readonly xp = computed(
    () => Object.keys(this.days()).reduce((s, k) => s + countDone(this.days(), k) * XP_PER, 0),
  );
  protected readonly level = computed(() => Math.floor(this.xp() / XP_LEVEL) + 1);
  protected readonly cold = computed(() => countDone(this.days(), this.todayKey()) < GOAL);
  protected readonly iced = computed(() => this.cold() && this.streaks().recovering);

  protected readonly week = computed(() => {
    const days = this.days();
    return [6, 5, 4, 3, 2, 1, 0].map((i) => {
      const d = addDays(this.today(), -i);
      const k = dateKey(d);
      const c = countDone(days, k);
      const frozen = c < GOAL && this.streaks().frozen.has(k);
      const state = c >= GOAL ? 'ok' : frozen ? 'frozen' : c > 0 ? 'part' : isWeekend(d) ? 'rest' : '';
      return {
        k,
        c,
        state,
        label: i === 0 ? 'hoy' : DN[d.getDay()],
        aria: `${DN[d.getDay()]} ${d.getDate()}: ${c} misiones${frozen ? ', día congelado' : ''}`,
        text: c >= GOAL ? '✓' : frozen ? '❄' : String(d.getDate()),
      };
    });
  });

  protected readonly selCount = computed(() => countDone(this.days(), this.sel()));
  protected readonly progress = computed(() => Math.min(100, (this.selCount() / GOAL) * 100));
  protected readonly selHabits =computed<Habits>(() => this.days()[this.sel()] ?? {});
  protected readonly dayTitle = computed(() => {
    if (this.sel() === this.todayKey()) return 'Misiones de hoy';
    const d = parseKey(this.sel());
    return `${DN[d.getDay()]} ${d.getDate()} ${MN[d.getMonth()]}`;
  });
  protected readonly goalText = computed(() => {
    const c = this.selCount();
    return c >= GOAL ? `${c} / ${HABITS.length} · racha asegurada` : `${c} / ${GOAL} para mantener la racha`;
  });

  async ngOnInit() {
    try {
      this.days.set(await this.db.loadDays());
    } catch {
      this.note.set('No se pudieron cargar tus días. Recarga la página.');
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
    const before = countDone(this.days(), k);
    const h = { ...(this.days()[k] ?? {}) };
    h[hk] = !h[hk];
    this.days.update((d) => ({ ...d, [k]: h }));
    if (before < GOAL && countDone(this.days(), k) >= GOAL) {
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
