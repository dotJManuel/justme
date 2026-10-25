import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ConceptChange, ConceptField, ConceptValue, resolveConcept } from '../concept-field/concept-field';
import { localInputToIso, nowLocalInput, parseMoney } from '../finanzas.calc';
import { FinanzasService } from '../finanzas.service';
import { Icon } from '../../icons/icon';

/** Valor del destino "Gastos fijos mensuales" (los ids de tarjeta son uuid, no chocan). */
const FIXED = 'fijos';

/**
 * Formulario único para agregar un gasto: se elige el destino (cualquier tarjeta activa o los gastos fijos) y los
 * campos se ajustan. Las tarjetas llevan fecha y hora, "a meses" y monto total; los gastos fijos, solo un monto mensual.
 */
@Component({
  selector: 'app-expense-add',
  imports: [Icon, FormsModule, ConceptField],
  templateUrl: './expense-add.html',
  styleUrls: ['../finanzas.shared.css', './expense-add.css'],
})
export class ExpenseAdd {
  private readonly fin = inject(FinanzasService);
  private timer?: ReturnType<typeof setTimeout>;

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
  }

  /** Tarjetas activas y, al final, los gastos fijos. */
  protected readonly options = computed(() => [
    ...this.fin
      .cards()
      .filter((c) => c.active)
      .map((c) => ({ value: c.id, label: `Tarjeta de crédito — ${c.name}` })),
    { value: FIXED, label: 'Gastos fijos mensuales' },
  ]);

  /** Destino elegido; si ya no existe (por ejemplo, se desactivó la tarjeta), el primero de la lista. */
  protected readonly dest = signal('');
  protected readonly destValue = computed(() =>
    this.options().some((o) => o.value === this.dest()) ? this.dest() : this.options()[0].value,
  );
  protected readonly isCard = computed(() => this.destValue() !== FIXED);

  protected readonly conceptOptions = computed(() => this.fin.concepts().filter((c) => c.scope === 'gasto'));
  protected readonly concept = signal<ConceptValue>({ id: null, text: '' });
  protected readonly purchased = signal(nowLocalInput());
  protected readonly installment = signal('');
  protected readonly total = signal('');
  protected readonly amount = signal('');

  /** Aviso de lo último que se agregó (el gasto queda en su tabla, más abajo). */
  protected readonly added = signal('');

  /** Si no la tocas, la fecha y hora se actualizan al empezar a escribir el concepto. */
  private purchasedTouched = false;

  /** Monto escrito: vacío cuenta como 0; null si no es un monto válido. */
  private readonly draftAmount = computed(() => (this.amount().trim() === '' ? 0 : parseMoney(this.amount())));
  private readonly draftTotal = computed(() => (this.total().trim() === '' ? null : parseMoney(this.total())));
  protected readonly canAdd = computed(
    () =>
      (this.concept().id !== null || this.concept().text.trim() !== '') &&
      this.draftAmount() !== null &&
      (!this.isCard() || this.total().trim() === '' || this.draftTotal() !== null),
  );

  protected onConcept(e: ConceptChange) {
    const had = this.concept().id !== null || this.concept().text.trim() !== '';
    if (!had && (e.value.id !== null || e.value.text.trim() !== '') && !this.purchasedTouched) {
      this.purchased.set(nowLocalInput());
    }
    this.concept.set(e.value);
    e.done(true);
  }

  protected onPurchased(value: string) {
    this.purchasedTouched = true;
    this.purchased.set(value);
  }

  protected async add() {
    const amount = this.draftAmount();
    if (!this.canAdd() || amount === null) return;
    const typed = this.concept();
    const concept = typed.id !== null ? typed : resolveConcept(this.conceptOptions(), typed.text);
    const card = this.isCard();
    const ok = await this.fin.addExpense({
      section: card ? 'tarjeta' : 'fijos',
      cardId: card ? this.destValue() : null,
      conceptId: concept.id,
      conceptText: concept.text,
      installment: card ? this.installment().trim() : '',
      // Una compra sin monto total es un pago único: el total es lo que se paga.
      total: card ? (this.draftTotal() ?? amount) : null,
      amount,
      purchasedAt: card ? localInputToIso(this.purchased()) : null,
    });
    if (!ok) return;
    const label = this.options().find((o) => o.value === this.destValue())?.label ?? '';
    this.announce(`Agregado a ${label}`);
    // Se conserva el destino: así se pueden capturar varios gastos seguidos en la misma tarjeta.
    this.purchasedTouched = false;
    this.purchased.set(nowLocalInput());
    this.concept.set({ id: null, text: '' });
    this.installment.set('');
    this.total.set('');
    this.amount.set('');
  }

  private announce(message: string) {
    this.added.set(message);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.added.set(''), 4000);
  }
}
