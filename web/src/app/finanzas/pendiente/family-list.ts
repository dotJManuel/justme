import { Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { dateKey } from '../../habits/streaks';
import { fmtMoney, parseMoney, sum } from '../finanzas.calc';
import { FamilyMove } from '../finanzas.models';
import { FinanzasService } from '../finanzas.service';

/** Lista editable de lo recibido o de lo dado a la familia. */
@Component({
  selector: 'app-family-list',
  imports: [FormsModule],
  templateUrl: './family-list.html',
  styleUrl: '../finanzas.shared.css',
})
export class FamilyList {
  private readonly fin = inject(FinanzasService);

  readonly direction = input.required<FamilyMove['direction']>();

  protected readonly money = fmtMoney;
  protected readonly received = computed(() => this.direction() === 'recibido');
  /** Recibido lleva una columna más: de quién se recibió. */
  protected readonly cols = computed(() =>
    this.received() ? 'minmax(0,2fr) minmax(0,1.4fr) 9.5rem minmax(0,1fr) 5.5rem' : 'minmax(0,2fr) 9.5rem minmax(0,1fr) 5.5rem',
  );
  protected readonly title = computed(() => (this.received() ? 'Recibido' : 'Dado'));
  protected readonly nameLabel = computed(() => (this.received() ? 'Concepto' : 'Para quién'));
  protected readonly rows = computed(() => this.fin.family().filter((m) => m.direction === this.direction()));
  protected readonly total = computed(() => sum(this.rows().map((m) => m.amount)));

  protected readonly name = signal('');
  protected readonly person = signal('');
  protected readonly date = signal(dateKey(new Date()));
  protected readonly amount = signal('');

  protected readonly canAdd = computed(() => this.name().trim() !== '' && (parseMoney(this.amount()) ?? 0) > 0);

  protected setName(m: FamilyMove, el: HTMLInputElement) {
    const name = el.value.trim();
    if (!name) return void (el.value = m.name);
    if (name !== m.name) this.save(m, el, { name }, m.name);
  }

  protected setPerson(m: FamilyMove, el: HTMLInputElement) {
    const person = el.value.trim();
    if (person !== m.person) this.save(m, el, { person }, m.person);
  }

  protected setDate(m: FamilyMove, el: HTMLInputElement) {
    const date = el.value || null;
    if (date !== m.date) this.save(m, el, { date }, m.date ?? '');
  }

  protected setAmount(m: FamilyMove, el: HTMLInputElement) {
    const amount = parseMoney(el.value);
    if (!amount) {
      el.value = String(m.amount);
      this.fin.error.set('Escribe un monto válido, mayor a cero.');
    } else if (amount !== m.amount) {
      this.save(m, el, { amount }, String(m.amount));
    }
  }

  protected async remove(m: FamilyMove) {
    if (confirm(`¿Eliminar «${m.name}»?`)) await this.fin.removeFamily(m.id);
  }

  protected async add() {
    const amount = parseMoney(this.amount());
    if (!this.canAdd() || !amount) return;
    const ok = await this.fin.addFamily({
      direction: this.direction(),
      name: this.name().trim(),
      person: this.received() ? this.person().trim() : '',
      date: this.date() || null,
      amount,
    });
    if (ok) {
      this.name.set('');
      this.person.set('');
      this.date.set(dateKey(new Date()));
      this.amount.set('');
    }
  }

  private async save(m: FamilyMove, el: HTMLInputElement, patch: Partial<FamilyMove>, back: string) {
    if (!(await this.fin.updateFamily(m.id, patch))) el.value = back;
  }
}
