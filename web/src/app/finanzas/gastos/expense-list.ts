import { Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  expenseTotals,
  fmtMoney,
  isoToLocalInput,
  localInputToIso,
  nowLocalInput,
  parseMoney,
  perQuincena,
} from '../finanzas.calc';
import { Concept, CreditCard, Expense } from '../finanzas.models';
import { FinanzasService } from '../finanzas.service';

/** Tabla editable de una sección: tarjeta Santander, tarjeta BBVA o gastos fijos. */
@Component({
  selector: 'app-expense-list',
  imports: [FormsModule],
  templateUrl: './expense-list.html',
  styleUrl: '../finanzas.shared.css',
})
export class ExpenseList {
  private readonly fin = inject(FinanzasService);

  /** Tarjeta que se muestra; sin tarjeta, son los gastos fijos. */
  readonly card = input<CreditCard | null>(null);
  readonly title = input.required<string>();

  protected readonly money = fmtMoney;
  protected readonly half = perQuincena;
  protected readonly dateValue = (r: Expense) => isoToLocalInput(r.purchasedAt);

  /** Las tarjetas llevan "a meses" y monto total; los gastos fijos solo un monto mensual. */
  protected readonly cards = computed(() => this.card() !== null);
  protected readonly cols = computed(() =>
    this.cards()
      ? 'minmax(0,2fr) 11.5rem 5rem minmax(0,1fr) minmax(0,1fr) minmax(0,.9fr) 5.5rem'
      : 'minmax(0,2.2fr) minmax(0,1fr) minmax(0,.9fr) 5.5rem',
  );
  protected readonly rows = computed(() => this.fin.expenses().filter((e) => (this.card() ? e.cardId === this.card()?.id : e.section === 'fijos')));
  protected readonly totals = computed(() => expenseTotals(this.rows()));

  /** Conceptos que se pueden elegir al capturar un gasto nuevo. */
  protected readonly activeConcepts = computed(() => this.fin.concepts().filter((c) => c.scope === 'gasto' && c.active));

  /** Id del concepto elegido en el formulario (vacío = ninguno). */
  protected readonly concept = signal('');
  protected readonly purchased = signal(nowLocalInput());
  protected readonly installment = signal('');
  protected readonly total = signal('');
  protected readonly amount = signal('');

  /** Si no la tocas, la fecha y hora se actualizan al empezar a escribir el concepto. */
  private purchasedTouched = false;

  /** Monto escrito en el formulario: vacío cuenta como 0; null si no es un monto válido. */
  private readonly draftAmount = computed(() => (this.amount().trim() === '' ? 0 : parseMoney(this.amount())));
  private readonly draftTotal = computed(() => (this.total().trim() === '' ? null : parseMoney(this.total())));
  protected readonly canAdd = computed(
    () =>
      this.concept() !== '' &&
      this.draftAmount() !== null &&
      (this.total().trim() === '' || this.draftTotal() !== null),
  );

  /** Opciones de una fila: los conceptos activos y, si ya está desactivado, el que tiene la fila. */
  protected optionsFor(r: Expense): Concept[] {
    return this.fin.concepts().filter((c) => c.scope === 'gasto' && (c.active || c.id === r.conceptId));
  }

  protected conceptName(id: string): string {
    return this.fin.concepts().find((c) => c.id === id)?.name ?? '';
  }

  protected setConcept(r: Expense, el: HTMLSelectElement) {
    if (el.value && el.value !== r.conceptId) this.save(r, el, { conceptId: el.value }, r.conceptId);
  }

  protected onConcept(value: string) {
    if (!this.concept() && value && !this.purchasedTouched) this.purchased.set(nowLocalInput());
    this.concept.set(value);
  }

  protected onPurchased(value: string) {
    this.purchasedTouched = true;
    this.purchased.set(value);
  }

  protected setPurchased(r: Expense, el: HTMLInputElement) {
    if (el.value !== this.dateValue(r)) this.save(r, el, { purchasedAt: localInputToIso(el.value) }, this.dateValue(r));
  }

  protected setInstallment(r: Expense, el: HTMLInputElement) {
    const installment = el.value.trim();
    if (installment !== r.installment) this.save(r, el, { installment }, r.installment);
  }

  protected setAmount(r: Expense, el: HTMLInputElement) {
    const amount = parseMoney(el.value);
    if (amount === null) return this.invalid(el, String(r.amount));
    if (amount !== r.amount) this.save(r, el, { amount }, String(r.amount));
  }

  protected setTotal(r: Expense, el: HTMLInputElement) {
    const total = el.value.trim() === '' ? null : parseMoney(el.value);
    if (el.value.trim() !== '' && total === null) return this.invalid(el, String(r.total ?? ''));
    if (total !== r.total) this.save(r, el, { total }, String(r.total ?? ''));
  }

  protected async remove(r: Expense) {
    if (confirm(`¿Eliminar «${this.conceptName(r.conceptId)}»?`)) await this.fin.removeExpense(r.id);
  }

  protected async add() {
    const amount = this.draftAmount();
    if (!this.canAdd() || amount === null) return;
    const ok = await this.fin.addExpense({
      section: this.card() ? 'tarjeta' : 'fijos',
      cardId: this.card()?.id ?? null,
      conceptId: this.concept(),
      installment: this.cards() ? this.installment().trim() : '',
      // Una compra sin monto total es un pago único: el total es lo que se paga.
      total: this.cards() ? (this.draftTotal() ?? amount) : null,
      amount,
      purchasedAt: this.cards() ? localInputToIso(this.purchased()) : null,
    });
    if (ok) {
      this.purchasedTouched = false;
      this.purchased.set(nowLocalInput());
      this.concept.set('');
      this.installment.set('');
      this.total.set('');
      this.amount.set('');
    }
  }

  private async save(r: Expense, el: HTMLInputElement | HTMLSelectElement, patch: Partial<Expense>, back: string) {
    if (!(await this.fin.updateExpense(r.id, patch))) el.value = back;
  }

  private invalid(el: HTMLInputElement, back: string) {
    el.value = back;
    this.fin.error.set('Escribe un monto válido (solo números).');
  }
}
