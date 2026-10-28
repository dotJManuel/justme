import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { AddSheetService } from '../../add/add-sheet.service';
import { Icon } from '../../icons/icon';
import { Button } from '../../ui/button';
import { money } from '../../ui/money';
import { EmptyState } from '../../ui/states';
import { EditFamily } from '../edit/edit-simple';
import { conceptLabel, familyTotals } from '../finanzas.calc';
import { familySheet, today } from '../finanzas.export';
import { FinanzasView } from '../finanzas-view';
import { FamilyMove } from '../finanzas.models';
import { FinanzasService } from '../finanzas.service';
import { shortDate } from '../finanzas.view-calc';
import { downloadXlsx } from '../xlsx';

/** Finanzas › Familia: lo que recibes, lo que das y lo que te queda. */
@Component({
  selector: 'app-familia-page',
  imports: [Button, EditFamily, EmptyState, Icon],
  templateUrl: './familia-page.html',
  styleUrls: ['../fin-pages.css', './familia-page.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FamiliaPage {
  protected readonly fin = inject(FinanzasService);
  protected readonly view = inject(FinanzasView);
  private readonly add = inject(AddSheetService);

  protected readonly money = money;
  protected readonly totals = computed(() => familyTotals(this.fin.family()));

  private personName(m: FamilyMove): string {
    return this.fin.people().find((p) => p.id === m.personId)?.name ?? '';
  }
  private conceptName(m: FamilyMove): string {
    return conceptLabel(this.fin.concepts(), m.conceptId, m.conceptText);
  }
  private list(direction: FamilyMove['direction']) {
    return this.fin
      .family()
      .filter((m) => m.direction === direction && this.view.familyInMonth(m) && this.view.matches(this.conceptName(m), this.personName(m)))
      .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
      .map((m) => ({
        m,
        title: this.conceptName(m) || (direction === 'recibido' ? 'Recibido' : 'Dado'),
        sub: [this.personName(m), m.date ? shortDate(m.date) : 'Sin fecha'].filter(Boolean).join(' · '),
        signed: direction === 'recibido' ? m.amount : -m.amount,
      }));
  }
  protected readonly received = computed(() => this.list('recibido'));
  protected readonly given = computed(() => this.list('dado'));

  protected readonly editing = signal<FamilyMove | null>(null);
  protected readonly editOpen = signal(false);

  constructor() {
    this.view.setExporter(() => this.exportAll(), inject(DestroyRef));
  }

  protected edit(m: FamilyMove) {
    this.editing.set(m);
    this.editOpen.set(true);
  }

  protected register() {
    this.add.show({ tab: 'familia' });
  }

  /** Un libro con lo recibido y lo dado. */
  private exportAll() {
    const sheet = (direction: FamilyMove['direction'], name: string, header: string) =>
      familySheet(name, this.fin.family().filter((m) => m.direction === direction), header, (m) => this.conceptName(m), (m) => this.personName(m));
    downloadXlsx(`Familia - ${today()}`, [sheet('recibido', 'Recibido', 'De quién'), sheet('dado', 'Dado', 'Para quién')]);
  }
}
