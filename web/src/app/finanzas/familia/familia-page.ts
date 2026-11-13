import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { AddSheetService } from '../../add/add-sheet.service';
import { Icon } from '../../icons/icon';
import { Button } from '../../ui/button';
import { Chip } from '../../ui/chip';
import { money } from '../../ui/money';
import { EmptyState } from '../../ui/states';
import { EditFamily } from '../edit/edit-simple';
import { conceptLabel, familyTotals, round2 } from '../finanzas.calc';
import { familySheet, today } from '../finanzas.export';
import { FinanzasView, monthName } from '../finanzas-view';
import { FamilyMove } from '../finanzas.models';
import { FinanzasService } from '../finanzas.service';
import { shortDate } from '../finanzas.view-calc';
import { downloadXlsx } from '../xlsx';

type Tab = 'todo' | 'recibido' | 'dado';

/** Finanzas › Familia: lo que recibes, lo que entregas y lo que te queda, en una sola lista por mes. */
@Component({
  selector: 'app-familia-page',
  imports: [Button, Chip, EditFamily, EmptyState, Icon],
  templateUrl: './familia-page.html',
  styleUrls: ['../fin-pages.css', './familia-page.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FamiliaPage {
  protected readonly fin = inject(FinanzasService);
  protected readonly view = inject(FinanzasView);
  private readonly add = inject(AddSheetService);

  protected readonly money = money;
  protected readonly tab = signal<Tab>('todo');
  protected readonly totals = computed(() => familyTotals(this.fin.family()));
  /** Qué parte de lo recibido ya se entregó, de 0 a 100. */
  protected readonly givenPct = computed(() => {
    const t = this.totals();
    return t.recibido > 0 ? Math.min(100, (t.dado / t.recibido) * 100) : 0;
  });
  protected readonly receivedCount = computed(() => this.fin.family().filter((m) => m.direction === 'recibido').length);
  protected readonly givenCount = computed(() => this.fin.family().filter((m) => m.direction === 'dado').length);

  private personName(m: FamilyMove): string {
    return this.fin.people().find((p) => p.id === m.personId)?.name ?? '';
  }
  private conceptName(m: FamilyMove): string {
    return conceptLabel(this.fin.concepts(), m.conceptId, m.conceptText);
  }

  /** La lista por mes: cada grupo con su neto (lo recibido menos lo entregado). */
  protected readonly groups = computed(() => {
    const t = this.tab();
    const items = this.fin
      .family()
      .filter((m) => (t === 'todo' || m.direction === t) && this.view.familyInMonth(m) && this.view.matches(this.conceptName(m), this.personName(m)))
      .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
      .map((m) => ({
        m,
        received: m.direction === 'recibido',
        // Qué fue (el concepto) arriba; quién y cuándo, abajo. El tipo va con el monto: Recibido o Entregado.
        title: this.conceptName(m) || this.personName(m) || (m.direction === 'recibido' ? 'Recibido' : 'Entregado'),
        sub: [this.conceptName(m) ? this.personName(m) : '', m.date ? shortDate(m.date) : 'Sin fecha'].filter(Boolean).join(' · '),
        signed: m.direction === 'recibido' ? m.amount : -m.amount,
      }));
    const groups = new Map<string, { key: string; label: string; net: number; items: typeof items }>();
    for (const it of items) {
      const key = it.m.date?.slice(0, 7) ?? 'sin';
      const g = groups.get(key) ?? { key, label: key === 'sin' ? 'Sin fecha' : monthName(key), net: 0, items: [] };
      g.items.push(it);
      g.net = round2(g.net + it.signed);
      groups.set(key, g);
    }
    return [...groups.values()];
  });

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

  /** Un libro con lo recibido y lo entregado. */
  private exportAll() {
    const sheet = (direction: FamilyMove['direction'], name: string, header: string) =>
      familySheet(name, this.fin.family().filter((m) => m.direction === direction), header, (m) => this.conceptName(m), (m) => this.personName(m));
    downloadXlsx(`Familia - ${today()}`, [sheet('recibido', 'Recibido', 'De quién'), sheet('dado', 'Entregado', 'Para quién')]);
  }
}
