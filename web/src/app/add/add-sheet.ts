import { ChangeDetectionStrategy, Component, computed, effect, inject, model, signal, untracked } from '@angular/core';
import { conceptLabel } from '../finanzas/finanzas.calc';
import { FinanzasService } from '../finanzas/finanzas.service';
import { isMsi } from '../finanzas/finanzas.view-calc';
import { Icon, IconName } from '../icons/icon';
import { BottomSheet } from '../ui/bottom-sheet';
import { money } from '../ui/money';
import { ErrorState, Skeleton } from '../ui/states';
import { AddExpense } from './add-expense';
import { AddFamily } from './add-family';
import { AddLoan } from './add-loan';
import { AddPreset, AddSheetService, FrequentExpense } from './add-sheet.service';

type Tab = NonNullable<AddPreset['tab']>;

interface Tile {
  tab: Tab;
  kind?: 'cargo' | 'abono';
  icon: IconName;
  title: string;
  text: string;
}

const TILES: Tile[] = [
  { tab: 'gasto', icon: 'card', title: 'Un gasto', text: 'Compra con tarjeta o gasto fijo' },
  { tab: 'prestamo', kind: 'cargo', icon: 'arrow-up', title: 'Préstamo', text: 'Lo que le prestaste a alguien' },
  { tab: 'prestamo', kind: 'abono', icon: 'arrow-down', title: 'Pago recibido', text: 'Un abono a lo que te deben' },
  { tab: 'familia', icon: 'heart', title: 'Familia', text: 'Lo que recibiste o entregaste' },
];

/**
 * El "+" de la navegación. Primero se elige qué pasó (gasto, préstamo, pago recibido o familia) y después se captura
 * lo mínimo. Los gastos que se repiten salen como atajos que abren el formulario ya escrito.
 */
@Component({
  selector: 'app-add-sheet',
  imports: [AddExpense, AddFamily, AddLoan, BottomSheet, ErrorState, Icon, Skeleton],
  template: `
    <ui-bottom-sheet [title]="title()" [(open)]="open">
      @if (open()) {
        @if (fin.loaded()) {
          @if (step() === 'tipo') {
            <div class="tiles" role="group" aria-label="Qué quieres registrar">
              @for (t of tiles; track t.title) {
                <button type="button" class="tile" (click)="choose(t)">
                  <span class="ico"><app-icon [name]="t.icon" [size]="20" /></span>
                  <span class="tt">{{ t.title }}</span>
                  <span class="ts">{{ t.text }}</span>
                </button>
              }
            </div>
            @if (frequent().length) {
              <section aria-labelledby="freq-h">
                <h3 id="freq-h" class="label">Gastos frecuentes</h3>
                <div class="chips">
                  @for (f of frequent(); track f.key) {
                    <button type="button" class="chip" (click)="repeat(f.expense)">{{ f.expense.concept }} <b class="num">{{ money(f.expense.amount) }}</b></button>
                  }
                </div>
              </section>
            }
          } @else {
            <button type="button" class="back" (click)="step.set('tipo')"><app-icon name="chevron-left" [size]="16" />Qué registrar</button>
            @switch (tab()) {
              @case ('gasto') { <app-add-expense (saved)="open.set(false)" /> }
              @case ('prestamo') { <app-add-loan (saved)="open.set(false)" /> }
              @case ('familia') { <app-add-family (saved)="open.set(false)" /> }
            }
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
    .tiles { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
    .tile {
      display: flex; flex-direction: column; align-items: flex-start; gap: 4px; min-height: 124px; padding: 14px; border: 0; border-radius: var(--rf-3);
      background: var(--s2); color: var(--tx); font: inherit; text-align: left; cursor: pointer; box-shadow: inset 0 0 0 1px var(--bd);
    }
    .tile:hover { background: var(--s3); }
    .ico { display: grid; place-items: center; width: 40px; height: 40px; margin-bottom: 6px; border-radius: var(--rf-2); background: var(--acs); color: var(--ac); }
    .tt { font-size: 16px; line-height: 22px; font-weight: 650; }
    .ts { font-size: 13px; line-height: 18px; color: var(--tx2); }
    h3 { margin-bottom: 8px; }
    .chips { display: flex; flex-wrap: wrap; gap: 8px; }
    .chip {
      display: inline-flex; align-items: center; gap: 6px; min-height: var(--touch); padding: 0 14px; border: 0; border-radius: 999px;
      background: var(--s2); color: var(--tx2); font: inherit; font-size: 14px; cursor: pointer;
    }
    .chip:hover { background: var(--s3); }
    .chip b { color: var(--tx); font-weight: 600; }
    .back {
      display: inline-flex; align-items: center; gap: 2px; align-self: flex-start; min-height: 36px; margin: -4px 0 0 -6px; padding: 0 8px 0 4px;
      border: 0; border-radius: 8px; background: none; color: var(--ac); font: inherit; font-size: 14px; font-weight: 600; cursor: pointer;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AddSheet {
  protected readonly fin = inject(FinanzasService);
  private readonly service = inject(AddSheetService);
  readonly open = model(false);

  protected readonly tiles = TILES;
  protected readonly money = money;
  protected readonly tab = signal<Tab>('gasto');
  protected readonly step = signal<'tipo' | 'form'>('tipo');
  protected readonly failed = signal(false);

  protected readonly title = computed(() => {
    if (this.step() === 'tipo') return '¿Qué quieres registrar?';
    if (this.tab() === 'gasto') return 'Nuevo gasto';
    if (this.tab() === 'familia') return 'Familia';
    return this.service.preset().kind === 'abono' ? 'Pago recibido' : 'Préstamo';
  });

  /** Gastos de contado que ya repites (mismo concepto, monto y destino al menos dos veces). */
  protected readonly frequent = computed(() => {
    const dests = new Set(['fijos', ...this.fin.cards().filter((c) => c.active).map((c) => c.id)]);
    const found = new Map<string, { expense: FrequentExpense; n: number }>();
    for (const e of this.fin.expenses()) {
      if (isMsi(e) || e.pinned) continue;
      const concept = conceptLabel(this.fin.concepts(), e.conceptId, e.conceptText);
      const dest = e.section === 'fijos' ? 'fijos' : (e.cardId ?? '');
      if (!concept || !dests.has(dest)) continue;
      const key = `${concept.toLowerCase()}|${e.amount}|${dest}`;
      const cur = found.get(key) ?? { expense: { concept, amount: e.amount, dest }, n: 0 };
      cur.n++;
      found.set(key, cur);
    }
    return [...found].filter(([, v]) => v.n >= 2).sort((a, b) => b[1].n - a[1].n).slice(0, 4).map(([key, v]) => ({ key, expense: v.expense }));
  });

  constructor() {
    // Las finanzas se cargan al abrir por primera vez (desde Hoy o Racha aún no están).
    effect(() => {
      if (!this.open()) return;
      const preset = untracked(() => this.service.preset());
      // Si ya viene elegido qué registrar (por ejemplo "Registrar pago" de una persona), se salta el primer paso.
      this.tab.set(preset.tab ?? 'gasto');
      this.step.set(preset.tab ? 'form' : 'tipo');
      this.fin.error.set('');
      if (!this.fin.loaded()) this.load();
    });
  }

  protected choose(t: Tile) {
    this.service.preset.set({ tab: t.tab, kind: t.kind });
    this.tab.set(t.tab);
    this.step.set('form');
  }

  protected repeat(expense: FrequentExpense) {
    this.service.preset.set({ tab: 'gasto', expense });
    this.tab.set('gasto');
    this.step.set('form');
  }

  protected load() {
    this.failed.set(false);
    this.fin.load().catch(() => this.failed.set(true));
  }
}
