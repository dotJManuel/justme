import { Injectable, inject } from '@angular/core';
import { ConfigService } from '../config.service';
import { XP_PER } from './habits.config';
import { HabitsStore } from './habits.store';
import { planDaysLeft, replanLevels } from './levels';

/**
 * Mantiene el plan de niveles al día: cuando cambian las misiones activas o la meta, la experiencia de los niveles que
 * faltan se recalcula para que llegar al máximo siga tomando lo que queda del año. Los niveles ya alcanzados no cambian.
 */
@Injectable({ providedIn: 'root' })
export class LevelsService {
  private readonly config = inject(ConfigService);
  private readonly store = inject(HabitsStore);

  /**
   * Recalcula y guarda los niveles que faltan. Es un ajuste de segundo plano: si no se puede (sin conexión, sin la
   * columna del plan), el cambio de misiones que lo pidió ya quedó guardado y se ajusta en el siguiente cambio.
   */
  async recalculate(): Promise<void> {
    if (!this.config.planReady()) return;
    try {
      // Hace falta la experiencia real: con los días sin cargar sería 0 y repartiría mal
      await this.store.load();
      const left = planDaysLeft(this.config.levelStart(), new Date(), this.config.activeDays());
      const budget = this.config.expectedPerDay() * XP_PER * left;
      const next = replanLevels(this.config.levels(), this.store.xp(), budget);
      if (next.join() !== this.config.levels().join()) await this.config.saveLevels(next);
    } catch {
      // se reintenta en el próximo cambio
    }
  }
}
