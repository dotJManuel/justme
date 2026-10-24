import { Component, computed, inject, input } from '@angular/core';
import { currentCutPeriod, cutPending, fmtMoney, parseMoney } from '../finanzas.calc';
import { CreditCard } from '../finanzas.models';
import { cutsSheet, today } from '../finanzas.export';
import { FinanzasService } from '../finanzas.service';
import { ExportButton } from '../export-button/export-button';
import { downloadXlsx } from '../xlsx';

/**
 * Corte en curso de una tarjeta. El periodo se calcula solo a partir del día de corte de la tarjeta
 * (se define en Administrar); el registro se crea la primera vez que se captura el monto del corte o lo pagado.
 */
@Component({
  selector: 'app-cut-list',
  imports: [ExportButton],
  templateUrl: './cut-list.html',
  styleUrl: '../finanzas.shared.css',
})
export class CutList {
  private readonly fin = inject(FinanzasService);

  readonly card = input.required<CreditCard>();
  readonly title = input.required<string>();

  protected readonly money = fmtMoney;
  protected readonly cols = 'minmax(0,1.6fr) minmax(0,1fr) minmax(0,1fr) minmax(0,1fr)';

  private readonly today = new Date();
  protected readonly period = computed(() => currentCutPeriod(this.card().cutDay, this.today));
  private readonly saved = computed(() =>
    this.fin.cuts().find((c) => c.cardId === this.card().id && c.periodEnd === this.period().end),
  );
  protected readonly amount = computed(() => this.saved()?.amount ?? 0);
  protected readonly paid = computed(() => this.saved()?.paid ?? 0);
  protected readonly pending = computed(() => cutPending({ amount: this.amount(), paid: this.paid() }));

  /** Los cambios se guardan de uno en uno: así dos ediciones seguidas no crean el registro dos veces. */
  private queue: Promise<unknown> = Promise.resolve();

  protected setAmount(el: HTMLInputElement) {
    this.setMoney(el, 'amount');
  }

  protected setPaid(el: HTMLInputElement) {
    this.setMoney(el, 'paid');
  }

  /** Todos los cortes de la tarjeta (el actual y los anteriores). */
  protected exportExcel() {
    const cuts = this.fin.cuts().filter((c) => c.cardId === this.card().id);
    downloadXlsx(`${this.title()} - ${today()}`, [cutsSheet('Cortes', cuts)]);
  }

  private setMoney(el: HTMLInputElement, field: 'amount' | 'paid') {
    const n = el.value.trim() === '' ? 0 : parseMoney(el.value);
    const current = this[field]();
    if (n === null) {
      el.value = String(current);
      this.fin.error.set('Escribe un monto válido (solo números).');
    } else if (n !== current) {
      this.queue = this.queue.then(async () => {
        if (!(await this.save(field, n))) el.value = String(current);
      });
    }
  }

  private save(field: 'amount' | 'paid', n: number): Promise<boolean> {
    const row = this.saved();
    if (row) return this.fin.updateCut(row.id, field === 'amount' ? { amount: n } : { paid: n });
    const { label, end } = this.period();
    return this.fin.addCut({
      cardId: this.card().id,
      period: label,
      periodEnd: end,
      amount: field === 'amount' ? n : 0,
      paid: field === 'paid' ? n : 0,
    });
  }
}
