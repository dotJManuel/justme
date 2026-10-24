import { Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { dateKey } from '../../habits/streaks';
import { conceptLabel, fmtMoney, parseMoney, sum } from '../finanzas.calc';
import { ConceptChange, ConceptField, ConceptValue } from '../concept-field/concept-field';
import { FamilyMove, Person } from '../finanzas.models';
import { FinanzasService } from '../finanzas.service';

/**
 * Lista editable de lo recibido o de lo dado a la familia. Un recibido siempre lleva concepto (y de quién es
 * opcional); un dado siempre lleva persona, "para quién" (y el concepto es opcional).
 */
@Component({
  selector: 'app-family-list',
  imports: [FormsModule, ConceptField],
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

  /** Conceptos del catálogo de familia (el campo oculta los desactivados) y personas que se pueden elegir. */
  protected readonly conceptOptions = computed(() => this.fin.concepts().filter((c) => c.scope === 'familia'));
  protected readonly activePeople = computed(() => this.fin.people().filter((p) => p.scope === 'familia' && p.active));

  // Formulario de alta: concepto (catálogo o texto libre) y persona elegida (id; vacío = ninguna)
  protected readonly concept = signal<ConceptValue>({ id: null, text: '' });
  protected readonly person = signal('');
  protected readonly date = signal(dateKey(new Date()));
  protected readonly amount = signal('');

  protected readonly canAdd = computed(
    () =>
      (parseMoney(this.amount()) ?? 0) > 0 &&
      (this.received() ? this.concept().id !== null || this.concept().text !== '' : this.person() !== ''),
  );

  /** Opciones de una fila: las activas y, si ya está desactivada, la que tiene el registro. */
  protected peopleFor(m: FamilyMove): Person[] {
    return this.fin.people().filter((p) => p.scope === 'familia' && (p.active || p.id === m.personId));
  }

  protected label(m: FamilyMove): string {
    const concept = conceptLabel(this.fin.concepts(), m.conceptId, m.conceptText);
    const person = this.fin.people().find((p) => p.id === m.personId)?.name;
    return [concept, person].filter(Boolean).join(' · ') || 'registro';
  }

  /** Cambio de concepto en una fila: en Recibido es obligatorio. */
  protected async setConcept(m: FamilyMove, e: ConceptChange) {
    const { id, text } = e.value;
    if (this.received() && id === null && text === '') return e.done(false);
    e.done(await this.fin.updateFamily(m.id, { conceptId: id, conceptText: text }));
  }

  protected onConcept(e: ConceptChange) {
    this.concept.set(e.value);
    e.done(true);
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
      conceptId: this.concept().id,
      conceptText: this.concept().text,
      personId: this.person() || null,
      date: this.date() || null,
      amount,
    });
    if (ok) {
      this.concept.set({ id: null, text: '' });
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
