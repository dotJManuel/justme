import { Component, computed, inject } from '@angular/core';
import { expenseTotals, fmtMoney, monthSummary, parseMoney } from '../finanzas.calc';
import { FinanzasService } from '../finanzas.service';
import { CutList } from './cut-list';
import { ExpenseList } from './expense-list';

/** Gastos del mes: resumen, tarjetas Santander y BBVA, gastos fijos y cortes. */
@Component({
  selector: 'app-gastos-page',
  imports: [ExpenseList, CutList],
  templateUrl: './gastos-page.html',
  styleUrl: './gastos-page.css',
})
export class GastosPage {
  private readonly fin = inject(FinanzasService);

  protected readonly money = fmtMoney;

  protected readonly summary = computed(() => monthSummary(this.fin.expenses(), this.fin.income()));
  /** Ambas tarjetas juntas (el "total general" del Excel). */
  protected readonly cardsTotal = computed(() =>
    expenseTotals(this.fin.expenses().filter((e) => e.section !== 'fijos')),
  );
  protected readonly income = this.fin.income;

  protected async setIncome(el: HTMLInputElement) {
    const amount = parseMoney(el.value);
    if (amount === null) {
      el.value = String(this.income());
      this.fin.error.set('Escribe un monto válido (solo números).');
    } else if (amount !== this.income() && !(await this.fin.saveIncome(amount))) {
      el.value = String(this.income());
    }
  }
}
