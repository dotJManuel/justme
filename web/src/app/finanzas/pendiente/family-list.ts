import { Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { dateKey } from '../../habits/streaks';
import { fmtMoney, parseMoney, sum } from '../finanzas.calc';
import { Concept, FamilyMove, Person } from '../finanzas.models';
import { FinanzasService } from '../finanzas.service';

/**
 * Lista editable de lo recibido o de lo dado a la familia. Un recibido siempre lleva concepto (y de quién es
 * opcional); un dado siempre lleva persona, "para quién" (y el concepto es opcional).
 */
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
  protected readonly cols = 'minmax(0,1.4fr) minmax(0,1.4fr) 9.5rem minmax(0,1fr) 5.5rem';

  protected readonly received = computed(() => this.direction() === 'recibido');
  protected readonly title = computed(() => (this.received() ? 'Recibido' : 'Dado'));
  protected readonly personLabel = computed(() => (this.received() ? 'De quién' : 'Para quién'));
  protected readonly rows = computed(() => this.fin.family().filter((m) => m.direction === this.direction()));
  protected readonly total = computed(() => sum(this.rows().map((m) => m.amount)));

  /** Conceptos y personas que se pueden elegir en un registro nuevo. */
  protected readonly activeConcepts = computed(() =>
    this.fin.concepts().filter((c) => c.scope === 'familia' && c.active),
  );
  protected readonly activePeople = computed(() => this.fin.people().filter((p) => p.scope === 'familia' && p.active));

  // Formulario de alta: ids elegidos (vacío = ninguno)
  protected readonly concept = signal('');
  protected readonly person = signal('');
  protected readonly date = signal(dateKey(new Date()));
  protected readonly amount = signal('');

  protected readonly canAdd = computed(
    () =>
      (parseMoney(this.amount()) ?? 0) > 0 && (this.received() ? this.concept() !== '' : this.person() !== ''),
  );

  /** Opciones de una fila: las activas y, si ya está desactivada, la que tiene el registro. */
  protected conceptsFor(m: FamilyMove): Concept[] {
    return this.fin.concepts().filter((c) => c.scope === 'familia' && (c.active || c.id === m.conceptId));
  }

  protected peopleFor(m: FamilyMove): Person[] {
    return this.fin.people().filter((p) => p.scope === 'familia' && (p.active || p.id === m.personId));
  }

  protected label(m: FamilyMove): string {
    const concept = this.fin.concepts().find((c) => c.id === m.conceptId)?.name;
    const person = this.fin.people().find((p) => p.id === m.personId)?.name;
    return [concept, person].filter(Boolean).join(' · ') || 'registro';
  }

  protected setConcept(m: FamilyMove, el: HTMLSelectElement) {
    const conceptId = el.value || null;
    // En Recibido el concepto es obligatorio.
    if (this.received() && !conceptId) return void (el.value = m.conceptId ?? '');
    if (conceptId !== m.conceptId) this.save(m, el, { conceptId }, m.conceptId ?? '');
  }

  protected setPerson(m: FamilyMove, el: HTMLSelectElement) {
    const personId = el.value || null;
    // En Dado la persona (para quién) es obligatoria.
    if (!this.received() && !personId) return void (el.value = m.personId ?? '');
    if (personId !== m.personId) this.save(m, el, { personId }, m.personId ?? '');
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
    if (confirm(`¿Eliminar «${this.label(m)}»?`)) await this.fin.removeFamily(m.id);
  }

  protected async add() {
    const amount = parseMoney(this.amount());
    if (!this.canAdd() || !amount) return;
    const ok = await this.fin.addFamily({
      direction: this.direction(),
      conceptId: this.concept() || null,
      personId: this.person() || null,
      date: this.date() || null,
      amount,
    });
    if (ok) {
      this.concept.set('');
      this.person.set('');
      this.date.set(dateKey(new Date()));
      this.amount.set('');
    }
  }

  private async save(
    m: FamilyMove,
    el: HTMLInputElement | HTMLSelectElement,
    patch: Partial<FamilyMove>,
    back: string,
  ) {
    if (!(await this.fin.updateFamily(m.id, patch))) el.value = back;
  }
}
