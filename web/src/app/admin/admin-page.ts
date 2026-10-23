import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ConfigService } from '../config.service';
import { DN } from '../habits/habits.config';

@Component({
  selector: 'app-admin-page',
  imports: [FormsModule, RouterLink],
  templateUrl: './admin-page.html',
  styleUrl: './admin-page.css',
})
export class AdminPage implements OnInit {
  protected readonly config = inject(ConfigService);

  /** Lunes primero; el valor es el número de día de JavaScript (0 = domingo). */
  protected readonly weekdays = [1, 2, 3, 4, 5, 6, 0].map((n) => ({ n, label: DN[n] }));

  protected readonly loaded = signal(false);
  protected readonly goal = signal(0);
  protected readonly freezeMin = signal(0);
  protected readonly days = signal<number[]>([]);
  protected readonly newName = signal('');
  protected readonly newWhen = signal('');
  protected readonly error = signal('');
  protected readonly info = signal('');
  protected readonly busy = signal(false);

  protected readonly valid = computed(
    () =>
      Number.isInteger(this.goal()) && this.goal() >= 1 && this.goal() <= 50 &&
      Number.isInteger(this.freezeMin()) && this.freezeMin() >= 1 && this.freezeMin() <= 365 &&
      this.days().length >= 1,
  );
  protected readonly dirty = computed(
    () =>
      this.goal() !== this.config.goal() ||
      this.freezeMin() !== this.config.freezeMin() ||
      [...this.days()].sort().join() !== [...this.config.activeDays()].sort().join(),
  );
  protected readonly tooHigh = computed(() => this.goal() > this.config.activeHabits().length);

  async ngOnInit() {
    try {
      await this.config.load();
      this.resetDrafts();
      this.loaded.set(true);
    } catch {
      this.error.set('No se pudieron cargar los ajustes. Recarga la página.');
    }
  }

  protected toggleDay(n: number) {
    this.days.update((d) => (d.includes(n) ? d.filter((x) => x !== n) : [...d, n]));
  }

  protected saveSettings() {
    return this.run('Ajustes guardados', () =>
      this.config.saveSettings(Number(this.goal()), Number(this.freezeMin()), this.days()),
    );
  }

  protected addHabit() {
    const name = this.newName().trim();
    if (!name) return Promise.resolve();
    return this.run('Misión agregada', async () => {
      await this.config.addHabit(name, this.newWhen().trim());
      this.newName.set('');
      this.newWhen.set('');
    });
  }

  protected rename(k: string, input: HTMLInputElement, current: string) {
    const name = input.value.trim();
    if (!name) {
      input.value = current;
      return Promise.resolve();
    }
    return this.run('', () => this.config.updateHabit(k, { name }));
  }

  protected setWhen(k: string, input: HTMLInputElement) {
    return this.run('', () => this.config.updateHabit(k, { when: input.value.trim() }));
  }

  protected setActive(k: string, active: boolean) {
    return this.run('', () => this.config.updateHabit(k, { active }));
  }

  protected move(k: string, dir: -1 | 1) {
    return this.run('', () => this.config.move(k, dir));
  }

  private resetDrafts() {
    this.goal.set(this.config.goal());
    this.freezeMin.set(this.config.freezeMin());
    this.days.set([...this.config.activeDays()]);
  }

  private async run(okMessage: string, action: () => Promise<void>) {
    this.error.set('');
    this.info.set('');
    this.busy.set(true);
    try {
      await action();
      this.info.set(okMessage);
    } catch {
      this.error.set('No se pudo guardar. Revisa tu conexión e intenta de nuevo.');
    } finally {
      this.busy.set(false);
    }
  }
}
