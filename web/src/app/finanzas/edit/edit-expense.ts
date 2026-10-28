import { ChangeDetectionStrategy, Component, computed, effect, inject, input, model, signal } from '@angular/core';
import { ConceptInput } from '../../add/concept-input';
import { Button } from '../../ui/button';
import { Amount } from '../../ui/fields';
import { Input } from '../../ui/input';
import { BottomSheet } from '../../ui/bottom-sheet';
import { ConfirmDialog } from '../../ui/confirm-dialog';
import { ErrorState } from '../../ui/states';
import { ToastService } from '../../ui/toast';
import { conceptLabel, isoToLocalInput, localInputToIso, parseMoney, resolveConcept } from '../finanzas.calc';
import { Expense } from '../finanzas.models';
import { FinanzasService } from '../finanzas.service';

/** Editar o eliminar un gasto (de una tarjeta o fijo). Los mismos campos y reglas que la tabla de siempre. */
@Component({
  selector: 'app-edit-expense',
  imports: [Amount, BottomSheet, Button, ConceptInput, ConfirmDialog, ErrorState, Input],
  template: `
    <ui-bottom-sheet [title]="e()?.section === 'fijos' ? 'Gasto fijo' : 'Gasto'" [(open)]="open">
      <form (submit)="$event.preventDefault(); save()" novalidate>
        <ui-amount [label]="isCard() ? 'Por pagar' : 'Monto mensual'" [(value)]="amount" [error]="amountError()" />
        <app-concept-input [options]="conceptOptions()" [(text)]="concept" [error]="conceptError()" />
        @if (isCard()) {
          <div class="two">
            <ui-input label="A meses" placeholder="05/09" [(value)]="installment" />
            <ui-input label="Monto total" inputmode="decimal" placeholder="0.00" [(value)]="total" [error]="totalError()" />
          </div>
          <ui-input label="Fecha y hora" type="datetime-local" [(value)]="purchased" />
        }
        @if (fin.error()) {
          <ui-error-state [inline]="true" [message]="fin.error()" (retry)="save()" />
        }
        <div class="actions">
          <button uiBtn variant="danger" type="button" [disabled]="busy()" (click)="asking.set(true)">Eliminar</button>
          <button uiBtn type="submit" [disabled]="busy()">{{ busy() ? 'Guardando…' : 'Guardar cambios' }}</button>
        </div>
      </form>
    </ui-bottom-sheet>
    <ui-confirm-dialog
      [(open)]="asking" [title]="'¿Eliminar el gasto «' + label() + '»?'" message="Quedará registrado en el historial de cambios."
      [busy]="busy()" (confirmed)="remove()"
    />
  `,
  styles: `
    form { display: flex; flex-direction: column; gap: 16px; }
    .two { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; align-items: start; }
    .actions { display: grid; grid-template-columns: auto 1fr; gap: 8px; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditExpense {
  protected readonly fin = inject(FinanzasService);
  private readonly toasts = inject(ToastService);

  readonly expense = input<Expense | null>(null);
  readonly open = model(false);

  protected readonly e = computed(() => this.expense());
  protected readonly isCard = computed(() => this.e()?.section === 'tarjeta');
  protected readonly conceptOptions = computed(() => this.fin.concepts().filter((c) => c.scope === 'gasto'));
  protected readonly label = computed(() => (this.e() ? conceptLabel(this.fin.concepts(), this.e()!.conceptId, this.e()!.conceptText) : ''));

  protected readonly amount = signal('');
  protected readonly concept = signal('');
  protected readonly installment = signal('');
  protected readonly total = signal('');
  protected readonly purchased = signal('');
  protected readonly busy = signal(false);
  protected readonly asking = signal(false);
  private readonly tried = signal(false);

  constructor() {
    effect(() => {
      const e = this.expense();
      if (!this.open() || !e) return;
      this.amount.set(String(e.amount));
      this.concept.set(conceptLabel(this.fin.concepts(), e.conceptId, e.conceptText));
      this.installment.set(e.installment);
      this.total.set(e.total === null ? '' : String(e.total));
      this.purchased.set(isoToLocalInput(e.purchasedAt));
      this.tried.set(false);
      this.fin.error.set('');
    });
  }

  protected readonly amountError = computed(() => (this.tried() && parseMoney(this.amount()) === null ? 'Escribe un monto válido (solo números)' : ''));
  protected readonly conceptError = computed(() => (this.tried() && !this.concept().trim() ? 'El concepto es obligatorio' : ''));
  protected readonly totalError = computed(() => (this.tried() && this.total().trim() !== '' && parseMoney(this.total()) === null ? 'Monto no válido' : ''));

  protected async save() {
    const e = this.expense();
    if (!e || this.busy()) return;
    this.tried.set(true);
    const amount = parseMoney(this.amount());
    const total = this.total().trim() === '' ? null : parseMoney(this.total());
    if (amount === null || !this.concept().trim() || (this.isCard() && this.total().trim() !== '' && total === null)) return;

    const patch: Partial<Expense> = {};
    const concept = resolveConcept(this.conceptOptions(), this.concept(), e.conceptId);
    if (concept.id !== e.conceptId || concept.text !== e.conceptText) Object.assign(patch, { conceptId: concept.id, conceptText: concept.text });
    if (amount !== e.amount) patch.amount = amount;
    if (this.isCard()) {
      if (this.installment().trim() !== e.installment) patch.installment = this.installment().trim();
      if (total !== e.total) patch.total = total;
      if (this.purchased() !== isoToLocalInput(e.purchasedAt)) patch.purchasedAt = localInputToIso(this.purchased());
    }
    if (!Object.keys(patch).length) return void this.open.set(false);
    this.busy.set(true);
    const ok = await this.fin.updateExpense(e.id, patch);
    this.busy.set(false);
    if (!ok) return;
    this.toasts.show({ message: 'Gasto actualizado' });
    this.open.set(false);
  }

  protected async remove() {
    const e = this.expense();
    if (!e) return;
    this.busy.set(true);
    const ok = await this.fin.removeExpense(e.id);
    this.busy.set(false);
    this.asking.set(false);
    if (!ok) return;
    this.toasts.show({ message: 'Gasto eliminado' });
    this.open.set(false);
  }
}
