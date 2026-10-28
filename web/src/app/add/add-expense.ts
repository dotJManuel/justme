import { ChangeDetectionStrategy, Component, computed, inject, output, signal } from '@angular/core';
import { localInputToIso, nowLocalInput, parseMoney, resolveConcept } from '../finanzas/finanzas.calc';
import { FinanzasService } from '../finanzas/finanzas.service';
import { Button } from '../ui/button';
import { Amount, Choice, Option } from '../ui/fields';
import { Input } from '../ui/input';
import { ErrorState } from '../ui/states';
import { ToastService } from '../ui/toast';
import { ConceptInput } from './concept-input';

/** Valor del destino "Gasto fijo" (los ids de tarjeta son uuid, no chocan). */
const FIXED = 'fijos';

/** Último destino usado: así se capturan varios gastos seguidos en la misma tarjeta. */
let lastDest = '';

/**
 * Nuevo gasto, con los mismos campos de siempre. Se elige el destino (cualquier tarjeta activa o gastos fijos): las
 * tarjetas llevan fecha y hora, "a meses" (por ejemplo 05/09) y monto total; los gastos fijos, solo un monto mensual.
 */
@Component({
  selector: 'app-add-expense',
  imports: [Amount, Button, Choice, ConceptInput, ErrorState, Input],
  template: `
    <form (submit)="$event.preventDefault(); save()" novalidate>
      <ui-amount [label]="isCard() ? 'Por pagar' : 'Monto mensual'" [(value)]="amount" [error]="amountError()" />
      <app-concept-input [options]="conceptOptions()" [(text)]="concept" [error]="conceptError()" />
      <ui-choice label="Pagar con" [options]="destinations()" [value]="destValue()" (valueChange)="dest.set($event)" />

      @if (isCard()) {
        <div class="two">
          <ui-input label="A meses" placeholder="05/09" [(value)]="installment" />
          <ui-input label="Monto total" inputmode="decimal" placeholder="0.00" hint="Vacío = pago único" [(value)]="total" [error]="totalError()" />
        </div>
        <div class="when">
          @if (editDate()) {
            <ui-input label="Fecha y hora" type="datetime-local" [value]="purchased()" (valueChange)="onPurchased($event)" />
          } @else {
            <span class="at">{{ whenText() }}</span>
            <button type="button" class="link" (click)="editDate.set(true)">Cambiar</button>
          }
        </div>
      }

      @if (fin.error()) {
        <ui-error-state [inline]="true" [message]="fin.error()" (retry)="save()" />
      }
      <button uiBtn block type="submit" [disabled]="busy()">{{ busy() ? 'Guardando…' : 'Guardar gasto' }}</button>
    </form>
  `,
  styles: `
    :host { display: block; }
    form { display: flex; flex-direction: column; gap: 16px; }
    .two { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; align-items: start; }
    .when { display: flex; align-items: center; gap: 10px; min-height: var(--touch); font-size: 14px; color: var(--tx2); }
    .when ui-input { flex: 1; }
    .at { flex: 1; }
    .link { min-height: var(--touch); padding: 0 4px; border: 0; background: none; color: var(--ac); font: inherit; font-weight: 600; cursor: pointer; }
    button[type='submit'] { min-height: 52px; font-size: 16px; font-weight: 700; border-radius: var(--rf-3); }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AddExpense {
  protected readonly fin = inject(FinanzasService);
  private readonly toasts = inject(ToastService);

  /** Se guardó: la hoja se puede cerrar. */
  readonly saved = output<void>();

  protected readonly amount = signal('');
  protected readonly concept = signal('');
  protected readonly dest = signal(lastDest);
  protected readonly installment = signal('');
  protected readonly total = signal('');
  protected readonly purchased = signal(nowLocalInput());
  protected readonly editDate = signal(false);
  protected readonly busy = signal(false);
  protected readonly tried = signal(false);

  protected readonly conceptOptions = computed(() => this.fin.concepts().filter((c) => c.scope === 'gasto'));
  protected readonly destinations = computed<Option[]>(() => [
    ...this.fin.cards().filter((c) => c.active).map((c) => ({ value: c.id, label: c.name })),
    { value: FIXED, label: 'Gasto fijo' },
  ]);
  /** Destino elegido; si ya no existe (se desactivó la tarjeta), la primera tarjeta o gastos fijos. */
  protected readonly destValue = computed(() =>
    this.destinations().some((o) => o.value === this.dest()) ? this.dest() : this.destinations()[0].value,
  );
  protected readonly isCard = computed(() => this.destValue() !== FIXED);

  /** Monto escrito: vacío cuenta como 0; null si no es un monto válido. */
  private readonly draftAmount = computed(() => (this.amount().trim() === '' ? 0 : parseMoney(this.amount())));
  private readonly draftTotal = computed(() => (this.total().trim() === '' ? null : parseMoney(this.total())));

  protected readonly amountError = computed(() => (this.tried() && this.draftAmount() === null ? 'Escribe un monto válido (solo números)' : ''));
  protected readonly totalError = computed(() => (this.tried() && this.isCard() && this.total().trim() !== '' && this.draftTotal() === null ? 'Monto no válido' : ''));
  protected readonly conceptError = computed(() => (this.tried() && !this.concept().trim() ? 'Escribe un concepto para continuar' : ''));

  /** Si no la tocas, la fecha y hora se ponen al guardar. */
  private purchasedTouched = false;

  protected onPurchased(value: string) {
    this.purchasedTouched = true;
    this.purchased.set(value);
  }

  protected whenText(): string {
    const d = new Date(this.purchased());
    const same = d.toDateString() === new Date().toDateString();
    const time = d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false });
    return same ? `Hoy, ${time}` : `${d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}, ${time}`;
  }

  protected async save() {
    this.tried.set(true);
    const amount = this.draftAmount();
    const card = this.isCard();
    if (amount === null || !this.concept().trim() || (card && this.total().trim() !== '' && this.draftTotal() === null) || this.busy()) return;
    const concept = resolveConcept(this.conceptOptions(), this.concept());
    this.busy.set(true);
    const ok = await this.fin.addExpense({
      section: card ? 'tarjeta' : 'fijos',
      cardId: card ? this.destValue() : null,
      conceptId: concept.id,
      conceptText: concept.text,
      installment: card ? this.installment().trim() : '',
      // Una compra sin monto total es un pago único: el total es lo que se paga.
      total: card ? (this.draftTotal() ?? amount) : null,
      amount,
      purchasedAt: card ? localInputToIso(this.purchasedTouched ? this.purchased() : nowLocalInput()) : null,
    });
    this.busy.set(false);
    if (!ok) return; // el error queda a la vista y lo capturado, intacto
    lastDest = this.destValue();
    this.toasts.show({ message: 'Gasto guardado' });
    this.saved.emit();
  }
}
