import { Component, computed, inject } from '@angular/core';
import { conceptLabel, debtRows, familyTotals, fmtMoney, personSummaries, sortDebtRows } from '../finanzas.calc';
import { ExportButton } from '../export-button/export-button';
import { familySheet, movementsSheet, peopleSheet, today } from '../finanzas.export';
import { FamilyMove } from '../finanzas.models';
import { FinanzasService } from '../finanzas.service';
import { downloadXlsx } from '../xlsx';
import { Debts } from './debts';
import { FamilyList } from './family-list';

/** Pendiente: dinero que me deben y dinero con familia. */
@Component({
  selector: 'app-pendiente-page',
  imports: [Debts, FamilyList, ExportButton],
  templateUrl: './pendiente-page.html',
  styleUrl: './pendiente-page.css',
})
export class PendientePage {
  private readonly fin = inject(FinanzasService);

  protected readonly money = fmtMoney;
  protected readonly totals = computed(() => familyTotals(this.fin.family()));

  /** Un libro con el resumen por persona, los movimientos, lo recibido y lo dado. */
  protected exportAll() {
    const debts = debtRows(this.fin.debts(), new Date(), this.fin.people(), this.fin.concepts());
    const concepts = this.fin.concepts();
    const people = this.fin.people();
    const family = (direction: FamilyMove['direction'], name: string, personHeader: string) =>
      familySheet(
        name,
        this.fin.family().filter((m) => m.direction === direction),
        personHeader,
        (m) => conceptLabel(concepts, m.conceptId, m.conceptText),
        (m) => people.find((p) => p.id === m.personId)?.name ?? '',
      );
    downloadXlsx(`Pendiente - ${today()}`, [
      peopleSheet(personSummaries(this.fin.debts(), people)),
      movementsSheet(sortDebtRows(debts, []), debts),
      family('recibido', 'Recibido', 'De quién'),
      family('dado', 'Dado', 'Para quién'),
    ]);
  }
}
