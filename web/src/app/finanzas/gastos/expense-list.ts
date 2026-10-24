import { Component, computed, inject, input } from '@angular/core';
import {
  conceptLabel,
  expenseTotals,
  fmtMoney,
  isoToLocalInput,
  localInputToIso,
  parseMoney,
  perQuincena,
} from '../finanzas.calc';
import { ConceptChange, ConceptField } from '../concept-field/concept-field';
import { CreditCard, Expense } from '../finanzas.models';
import { FinanzasService } from '../finanzas.service';
import { deleteRowMessage } from '../finanzas.warn';

/** Tabla editable de una sección: una tarjeta de crédito o los gastos fijos. Los gastos nuevos se agregan arriba. */
@Component({
  selector: 'app-expense-list',
  imports: [ConceptField],
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
      ? 'minmax(0,2fr) 11.5rem 5rem minmax(0,1fr) minmax(0,1fr) minmax(0,.9fr) 3rem'
      : 'minmax(0,2.2fr) minmax(0,1fr) minmax(0,.9fr) 3rem',
  );
  protected readonly rows = computed(() =>
    this.fin.expenses().filter((e) => (this.card() ? e.cardId === this.card()?.id : e.section === 'fijos')),
  );
  protected readonly totals = computed(() => expenseTotals(this.rows()));

  /** Conceptos del catálogo de gastos (el campo oculta los desactivados). */
  protected readonly conceptOptions = computed(() => this.fin.concepts().filter((c) => c.scope === 'gasto'));

  protected label(r: Expense): string {
    return conceptLabel(this.fin.concepts(), r.conceptId, r.conceptText);
  }

  /** Cambio de concepto en una fila: es obligatorio (del catálogo o texto libre). */
  protected async setConcept(r: Expense, e: ConceptChange) {
    const { id, text } = e.value;
    if (id === null && text === '') return e.done(false);
    e.done(await this.fin.updateExpense(r.id, { conceptId: id, conceptText: text }));
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
    if (confirm(deleteRowMessage(`el gasto «${this.label(r)}»`))) await this.fin.removeExpense(r.id);
  }

  private async save(r: Expense, el: HTMLInputElement, patch: Partial<Expense>, back: string) {
    if (!(await this.fin.updateExpense(r.id, patch))) el.value = back;
  }

  private invalid(el: HTMLInputElement, back: string) {
    el.value = back;
    this.fin.error.set('Escribe un monto válido (solo números).');
  }
}
