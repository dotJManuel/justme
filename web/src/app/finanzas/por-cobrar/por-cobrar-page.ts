import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AddSheetService } from '../../add/add-sheet.service';
import { Icon } from '../../icons/icon';
import { Button } from '../../ui/button';
import { money } from '../../ui/money';
import { ProgressBar } from '../../ui/progress';
import { EmptyState } from '../../ui/states';
import { debtRows, personSummaries } from '../finanzas.calc';
import { movementsSheet, peopleSheet, today } from '../finanzas.export';
import { FinanzasView } from '../finanzas-view';
import { FinanzasService } from '../finanzas.service';
import { initials } from '../finanzas.view-calc';
import { downloadXlsx } from '../xlsx';
import { sortDebtRows } from '../finanzas.calc';

type Order = 'saldo' | 'nombre';

/** Finanzas › Por cobrar: cuánto te deben en total y por persona (la ficha de cada una está al tocarla). */
@Component({
  selector: 'app-por-cobrar-page',
  imports: [Button, EmptyState, Icon, ProgressBar, RouterLink],
  templateUrl: './por-cobrar-page.html',
  styleUrls: ['../fin-pages.css', './por-cobrar-page.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PorCobrarPage {
  protected readonly fin = inject(FinanzasService);
  protected readonly view = inject(FinanzasView);
  protected readonly add = inject(AddSheetService);

  protected readonly money = money;
  protected readonly initials = initials;
  protected readonly order = signal<Order>('saldo');

  private readonly summary = computed(() => personSummaries(this.fin.debts(), this.fin.people()));
  protected readonly total = computed(() => this.summary().total);
  private readonly rows = computed(() => debtRows(this.fin.debts(), new Date(), this.fin.people(), this.fin.concepts()));

  protected readonly people = computed(() => {
    const concepts = new Map<string, string[]>();
    for (const r of this.rows()) concepts.set(r.personId, [...(concepts.get(r.personId) ?? []), r.conceptName]);
    const list = this.summary().people.filter((p) => this.view.matches(p.person, ...(concepts.get(p.personId) ?? [])));
    return this.order() === 'saldo' ? [...list].sort((a, b) => b.pending - a.pending) : list;
  });

  constructor() {
    this.view.setExporter(() => this.exportAll(), inject(DestroyRef));
  }

  protected toggleOrder() {
    this.order.set(this.order() === 'saldo' ? 'nombre' : 'saldo');
  }

  /** Un libro con el resumen por persona y todos los movimientos (lo que exportaba "Dinero que me deben"). */
  private exportAll() {
    downloadXlsx(`Por cobrar - ${today()}`, [peopleSheet(this.summary()), movementsSheet(sortDebtRows(this.rows(), []), this.rows())]);
  }
}
