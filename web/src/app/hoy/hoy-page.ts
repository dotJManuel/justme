import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ConfigService } from '../config.service';
import { ageDays, currentCutPeriod, monthSummary, personSummaries } from '../finanzas/finanzas.calc';
import { FinanzasService } from '../finanzas/finanzas.service';
import { MN } from '../habits/habits.config';
import { HabitsStore } from '../habits/habits.store';
import { Icon } from '../icons/icon';
import { Card } from '../ui/card';
import { money } from '../ui/money';
import { ProgressBar, ProgressRing } from '../ui/progress';
import { ErrorState, Skeleton } from '../ui/states';

const DAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
/** Desde cuántos días antes del corte se marca como alerta. */
const CUT_ALERT_DAYS = 7;

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Pantalla de inicio: ¿qué hago ahora y cómo voy? Racha del día, mes en finanzas, próximos cortes y lo que te deben. */
@Component({
  selector: 'app-hoy-page',
  imports: [Card, ErrorState, Icon, ProgressBar, ProgressRing, RouterLink, Skeleton],
  templateUrl: './hoy-page.html',
  styleUrl: './hoy-page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HoyPage implements OnInit {
  protected readonly store = inject(HabitsStore);
  protected readonly fin = inject(FinanzasService);
  private readonly config = inject(ConfigService);

  protected readonly money = money;
  protected readonly failed = signal(false);
  protected readonly ready = computed(() => this.store.loaded() && this.fin.loaded());

  async ngOnInit() {
    await this.load();
  }

  protected async load() {
    this.failed.set(false);
    const results = await Promise.allSettled([this.store.load(), this.fin.load()]);
    if (results.some((r) => r.status === 'rejected')) this.failed.set(true);
  }

  // ── Encabezado
  protected readonly dateText = computed(() => {
    const d = this.store.today();
    return `${cap(DAYS[d.getDay()])} ${d.getDate()} de ${MONTHS[d.getMonth()]}`;
  });
  protected readonly greeting = computed(() => {
    const h = this.store.today().getHours();
    return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
  });
  protected readonly streak = computed(() => this.store.streaks().cur);

  // ── Racha de hoy
  protected readonly goal = this.config.goal;
  protected readonly racha = computed(() => {
    const missing = this.store.missing();
    const cur = this.streak();
    if (missing === 0) {
      return { title: '¡Racha asegurada por hoy!', text: `Llevas ${cur} ${cur === 1 ? 'día' : 'días'} de racha.` };
    }
    return {
      title: `Te ${missing === 1 ? 'falta 1 misión' : `faltan ${missing} misiones`}`,
      text: cur === 0 ? 'Complétalas antes de medianoche para empezar tu racha.' : `Complétalas antes de medianoche para llegar a ${cur + 1} ${cur + 1 === 1 ? 'día' : 'días'} de racha.`,
    };
  });

  protected complete(habitKey: string, name: string) {
    this.store.complete(habitKey, name);
  }

  // ── Mes
  private readonly summary = computed(() => monthSummary(this.fin.expenses(), this.fin.income(), this.fin.cards()));
  protected readonly month = computed(() => {
    const s = this.summary();
    const name = MONTHS[this.store.today().getMonth()];
    return {
      title: `${s.balance >= 0 ? 'Te sobra' : 'Te falta'} en ${name}`,
      balance: Math.abs(s.balance),
      spent: s.gran,
      income: s.income,
      pct: s.income > 0 ? Math.min(100, (s.gran / s.income) * 100) : 0,
    };
  });

  // ── Próximos cortes
  protected readonly cuts = computed(() => {
    const today = this.store.today();
    const amounts = new Map(this.summary().cards.map((c) => [c.card.id, c.amount]));
    return this.fin
      .cards()
      .filter((c) => c.active)
      .map((card) => {
        const end = currentCutPeriod(card.cutDay, today).end;
        const days = -ageDays(end, today);
        const [, m, d] = end.split('-').map(Number);
        const when = days === 0 ? 'Corte hoy' : days === 1 ? 'Corte mañana' : `Corte en ${days} días`;
        return { id: card.id, name: card.name, last4: card.last4, amount: amounts.get(card.id) ?? 0, days, text: `${when} · ${d} ${MN[m - 1]}`, alert: days <= CUT_ALERT_DAYS };
      })
      .sort((a, b) => a.days - b.days);
  });

  // ── Te deben
  protected readonly owed = computed(() => {
    const { people, total } = personSummaries(this.fin.debts(), this.fin.people());
    return { total: total.pending, count: people.filter((p) => p.pending > 0).length };
  });
}
