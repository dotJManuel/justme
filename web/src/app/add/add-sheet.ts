import { ChangeDetectionStrategy, Component, effect, inject, model, signal } from '@angular/core';
import { FinanzasService } from '../finanzas/finanzas.service';
import { BottomSheet } from '../ui/bottom-sheet';
import { Segmented } from '../ui/segmented';
import { ErrorState, Skeleton } from '../ui/states';
import { AddExpense } from './add-expense';
import { AddSheetService } from './add-sheet.service';
import { AddFamily } from './add-family';
import { AddLoan } from './add-loan';

const TABS = [
  { value: 'gasto', label: 'Gasto' },
  { value: 'prestamo', label: 'Préstamo' },
  { value: 'familia', label: 'Familia' },
];

/** El "+" de la navegación: captura un gasto, un préstamo/abono o dinero de familia sin salir de donde estás. */
@Component({
  selector: 'app-add-sheet',
  imports: [AddExpense, AddFamily, AddLoan, BottomSheet, ErrorState, Segmented, Skeleton],
  template: `
    <ui-bottom-sheet title="Agregar" [(open)]="open">
      @if (open()) {
        <ui-segmented label="Tipo de registro" [options]="tabs" [(value)]="tab" />
        @if (fin.loaded()) {
          @switch (tab()) {
            @case ('gasto') { <app-add-expense (saved)="open.set(false)" /> }
            @case ('prestamo') { <app-add-loan (saved)="open.set(false)" /> }
            @case ('familia') { <app-add-family (saved)="open.set(false)" /> }
          }
        } @else if (failed()) {
          <ui-error-state message="No se pudo cargar tu información" (retry)="load()" />
        } @else {
          <div class="skel" aria-busy="true" aria-label="Cargando">
            <ui-skeleton height="52px" radius="10px" />
            <ui-skeleton height="48px" radius="10px" />
            <ui-skeleton height="44px" radius="10px" />
          </div>
        }
      }
    </ui-bottom-sheet>
  `,
  styles: `
    .skel { display: flex; flex-direction: column; gap: 14px; padding-top: 8px; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AddSheet {
  protected readonly fin = inject(FinanzasService);
  private readonly service = inject(AddSheetService);
  readonly open = model(false);

  protected readonly tabs = TABS;
  protected readonly tab = signal('gasto');
  protected readonly failed = signal(false);

  constructor() {
    // Las finanzas se cargan al abrir por primera vez (desde Hoy o Racha aún no están).
    effect(() => {
      if (!this.open()) return;
      this.tab.set(this.service.preset().tab ?? 'gasto');
      this.fin.error.set('');
      if (!this.fin.loaded()) this.load();
    });
  }

  protected load() {
    this.failed.set(false);
    this.fin.load().catch(() => this.failed.set(true));
  }
}
