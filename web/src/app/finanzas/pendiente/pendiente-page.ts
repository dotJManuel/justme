import { Component, computed, inject } from '@angular/core';
import { familyTotals, fmtMoney } from '../finanzas.calc';
import { FinanzasService } from '../finanzas.service';
import { Debts } from './debts';
import { FamilyList } from './family-list';

/** Pendiente: dinero que me deben y dinero con familia. */
@Component({
  selector: 'app-pendiente-page',
  imports: [Debts, FamilyList],
  templateUrl: './pendiente-page.html',
  styleUrl: './pendiente-page.css',
})
export class PendientePage {
  private readonly fin = inject(FinanzasService);

  protected readonly money = fmtMoney;
  protected readonly totals = computed(() => familyTotals(this.fin.family()));
}
