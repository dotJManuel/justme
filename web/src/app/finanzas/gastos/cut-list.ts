import { Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { cutPending, fmtMoney, parseMoney } from '../finanzas.calc';
import { Card, Cut } from '../finanzas.models';
import { FinanzasService } from '../finanzas.service';

/** Cortes de una tarjeta: periodo, monto del corte, lo pagado y lo que queda pendiente. */
@Component({
  selector: 'app-cut-list',
  imports: [FormsModule],
  templateUrl: './cut-list.html',
  styleUrl: '../finanzas.shared.css',
})
export class CutList {
  private readonly fin = inject(FinanzasService);

  readonly card = input.required<Card>();
  readonly title = input.required<string>();

  protected readonly money = fmtMoney;
  protected readonly pending = cutPending;
  protected readonly cols = 'minmax(0,1.6fr) minmax(0,1fr) minmax(0,1fr) minmax(0,1fr) 5.5rem';

  protected readonly rows = computed(() => this.fin.cuts().filter((c) => c.card === this.card()));

  protected readonly period = signal('');
  protected readonly amount = signal('');
  protected readonly paid = signal('');

  private readonly draftAmount = computed(() => (this.amount().trim() === '' ? 0 : parseMoney(this.amount())));
  private readonly draftPaid = computed(() => (this.paid().trim() === '' ? 0 : parseMoney(this.paid())));
  protected readonly canAdd = computed(
    () => this.period().trim() !== '' && this.draftAmount() !== null && this.draftPaid() !== null,
  );

  protected setPeriod(c: Cut, el: HTMLInputElement) {
    const period = el.value.trim();
    if (!period) return void (el.value = c.period);
    if (period !== c.period) this.save(c, el, { period }, c.period);
  }

  protected setAmount(c: Cut, el: HTMLInputElement) {
    this.setMoney(c, el, 'amount');
  }

  protected setPaid(c: Cut, el: HTMLInputElement) {
    this.setMoney(c, el, 'paid');
  }

  protected async remove(c: Cut) {
    if (confirm(`¿Eliminar el corte «${c.period}»?`)) await this.fin.removeCut(c.id);
  }

  protected async add() {
    const amount = this.draftAmount();
    const paid = this.draftPaid();
    if (!this.canAdd() || amount === null || paid === null) return;
    const ok = await this.fin.addCut({ card: this.card(), period: this.period().trim(), amount, paid });
    if (ok) {
      this.period.set('');
      this.amount.set('');
      this.paid.set('');
    }
  }

  private setMoney(c: Cut, el: HTMLInputElement, field: 'amount' | 'paid') {
    const n = el.value.trim() === '' ? 0 : parseMoney(el.value);
    if (n === null) {
      el.value = String(c[field]);
      this.fin.error.set('Escribe un monto válido (solo números).');
      return;
    }
    if (n !== c[field]) this.save(c, el, { [field]: n }, String(c[field]));
  }

  private async save(c: Cut, el: HTMLInputElement, patch: Partial<Cut>, back: string) {
    if (!(await this.fin.updateCut(c.id, patch))) el.value = back;
  }
}
