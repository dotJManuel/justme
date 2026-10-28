import { ChangeDetectionStrategy, Component, computed, inject, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { dateKey } from '../habits/streaks';
import { conceptLabel, debtRows, fmtMoney, localInputToIso, nowLocalInput, parseMoney, resolveConcept, round2 } from '../finanzas/finanzas.calc';
import { FinanzasService } from '../finanzas/finanzas.service';
import { Button } from '../ui/button';
import { Amount, Choice, Option, Select } from '../ui/fields';
import { Input } from '../ui/input';
import { ErrorState } from '../ui/states';
import { ToastService } from '../ui/toast';
import { AddSheetService } from './add-sheet.service';
import { ConceptInput } from './concept-input';

const KINDS: Option[] = [
  { value: 'cargo', label: 'Presté' },
  { value: 'abono', label: 'Me pagó' },
];

/**
 * Préstamo o abono de una persona, con las mismas reglas de siempre. Lo prestado puede registrarse además como
 * compra de una tarjeta. Un pago se reparte entre los cargos pendientes de la persona (un abono por cada uno) y
 * lo que sobra queda sin asignar.
 */
@Component({
  selector: 'app-add-loan',
  imports: [Amount, Button, Choice, ConceptInput, ErrorState, Input, RouterLink, Select],
  template: `
    <form (submit)="$event.preventDefault(); save()" novalidate>
      <ui-choice label="¿Qué pasó?" [options]="kinds" [(value)]="kind" columns="repeat(2, minmax(0, 1fr))" />
      <ui-amount [label]="kind() === 'abono' ? 'Cuánto pagó' : 'Monto'" [(value)]="amount" [error]="amountError()" />
      @if (people().length) {
        <ui-select label="Persona" placeholder="Elige a quién" [options]="people()" [(value)]="person" />
        @if (personError()) {
          <p class="err" role="alert">{{ personError() }}</p>
        }
      } @else {
        <p class="note">Aún no hay personas. Agrégalas en <a routerLink="/perfil/catalogos">Catálogos</a> para registrar préstamos.</p>
      }
      <app-concept-input label="Concepto (opcional)" placeholder="Ej. Recarga" [options]="conceptOptions()" [(text)]="concept" />

      @if (splitting() && pending().length) {
        <fieldset class="alloc">
          <legend>¿A qué cargos aplica?</legend>
          @for (c of pending(); track c.id) {
            <div class="line">
              <label [for]="'alloc-' + c.id">
                <span class="t">{{ c.conceptName || 'Sin concepto' }}</span>
                <span class="s">Pendiente {{ money(c.balance ?? 0) }}</span>
              </label>
              <input
                [id]="'alloc-' + c.id" inputmode="decimal" placeholder="0.00" class="num"
                [value]="alloc()[c.id] ?? ''" (input)="setAlloc(c.id, $any($event.target).value)"
              />
              <button type="button" (click)="fill(c.id, c.balance ?? 0)">Todo</button>
            </div>
          }
          <p class="note" [class.err]="!!allocError()">
            {{ allocError() || (remaining() > 0 ? 'Sin asignar a un cargo: ' + money(remaining()) : 'Todo el pago está repartido.') }}
          </p>
        </fieldset>
      }
      @if (kind() === 'cargo' && cards().length) {
        <ui-choice label="¿Lo pagaste con tarjeta?" [options]="cardOptions()" [(value)]="card" />
      }
      <ui-input label="Fecha" type="date" [(value)]="date" />

      @if (fin.error()) {
        <ui-error-state [inline]="true" [message]="fin.error()" (retry)="save()" />
      }
      <button uiBtn block type="submit" [disabled]="busy()">{{ busy() ? 'Guardando…' : kind() === 'cargo' ? 'Guardar préstamo' : 'Guardar abono' }}</button>
    </form>
  `,
  styles: `
    :host { display: block; }
    form { display: flex; flex-direction: column; gap: 16px; }
    .note { font-size: 13px; line-height: 18px; color: var(--tx2); }
    .note a { color: var(--ac); font-weight: 600; }
    .err { font-size: 12px; color: var(--rd); font-weight: 500; }
    p.err { margin-top: -10px; }
    .alloc { display: flex; flex-direction: column; gap: 8px; margin: 0; padding: 0; border: 0; min-width: 0; }
    legend { padding: 0; margin-bottom: 8px; font-size: 13px; line-height: 16px; font-weight: 600; color: var(--tx2); }
    .line { display: grid; grid-template-columns: minmax(0, 1fr) 7rem auto; align-items: center; gap: 8px; }
    label { display: flex; flex-direction: column; min-width: 0; }
    .t { font-size: 14px; line-height: 20px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .s { font-size: 12px; line-height: 16px; color: var(--tx2); }
    input { height: var(--touch); min-width: 0; padding: 0 10px; border: 1px solid var(--bd2); border-radius: var(--rf-2); background: var(--sf); color: var(--tx); font: inherit; font-size: 15px; }
    .line button { min-height: var(--touch); padding: 0 8px; border: 0; background: none; color: var(--ac); font: inherit; font-size: 14px; font-weight: 600; cursor: pointer; }
    button[type='submit'] { min-height: 52px; font-size: 16px; font-weight: 700; border-radius: var(--rf-3); }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AddLoan {
  protected readonly fin = inject(FinanzasService);
  private readonly toasts = inject(ToastService);

  readonly saved = output<void>();
  protected readonly kinds = KINDS;
  protected readonly money = fmtMoney;

  private readonly preset = inject(AddSheetService).preset();
  protected readonly kind = signal<string>(this.preset.kind ?? 'cargo');
  protected readonly amount = signal('');
  protected readonly person = signal(this.preset.personId ?? '');
  protected readonly concept = signal('');
  /** Cuánto del pago se aplica a cada cargo pendiente (texto por id de cargo). */
  protected readonly alloc = signal<Record<string, string>>({});
  protected readonly card = signal('');
  protected readonly date = signal(dateKey(new Date()));
  protected readonly busy = signal(false);
  protected readonly tried = signal(false);

  protected readonly people = computed<Option[]>(() =>
    this.fin.people().filter((p) => p.scope === 'deudor' && p.active).map((p) => ({ value: p.id, label: p.name })),
  );
  protected readonly conceptOptions = computed(() => this.fin.concepts().filter((c) => c.scope === 'movimiento'));
  protected readonly cards = computed(() => this.fin.cards().filter((c) => c.active));
  protected readonly cardOptions = computed<Option[]>(() => [
    { value: '', label: 'No' },
    ...this.cards().map((c) => ({ value: c.id, label: c.name })),
  ]);
  private readonly rows = computed(() => debtRows(this.fin.debts(), new Date(), this.fin.people(), this.fin.concepts()));

  protected readonly splitting = computed(() => this.kind() === 'abono');
  /** Cargos pendientes de la persona elegida, entre los que se reparte el pago. */
  protected readonly pending = computed(() => {
    const p = this.person();
    if (!this.splitting() || !p) return [];
    return this.rows().filter((r) => r.kind === 'cargo' && r.personId === p && (r.balance ?? 0) > 0);
  });
  private readonly allocated = computed(() =>
    this.pending().map((c) => ({ id: c.id, balance: c.balance ?? 0, amount: parseMoney(this.alloc()[c.id] ?? '') ?? 0 })),
  );
  private readonly parsed = computed(() => parseMoney(this.amount()));
  /** Lo que queda sin aplicar a ningún cargo (negativo si se reparte de más). */
  protected readonly remaining = computed(() => round2((this.parsed() ?? 0) - round2(this.allocated().reduce((a, x) => a + x.amount, 0))));
  protected readonly allocError = computed(() => {
    if (!this.splitting()) return '';
    if (this.allocated().some((x) => x.amount > x.balance)) return 'Un cargo no puede recibir más de lo que debe.';
    if (this.remaining() < 0) return 'Repartiste más de lo que pagó.';
    return '';
  });

  protected readonly amountError = computed(() =>
    this.tried() && !(this.parsed() && this.parsed()! > 0) ? 'Escribe un monto mayor a cero' : '',
  );
  protected readonly personError = computed(() => (this.tried() && !this.person() ? 'Elige una persona' : ''));

  protected setAlloc(id: string, value: string) {
    this.alloc.update((a) => ({ ...a, [id]: value }));
  }

  /** Aplica a ese cargo todo su saldo, o lo que quede del pago si es menos. */
  protected fill(id: string, balance: number) {
    const own = parseMoney(this.alloc()[id] ?? '') ?? 0;
    const left = round2(this.remaining() + own);
    this.setAlloc(id, String(Math.max(0, Math.min(balance, left))));
  }

  protected async save() {
    this.tried.set(true);
    const amount = this.parsed();
    if (!amount || amount <= 0 || !this.person() || this.allocError() || this.busy()) return;
    const typed = resolveConcept(this.conceptOptions(), this.concept());
    const date = this.date() || null;
    const personId = this.person();
    this.busy.set(true);
    let ok: boolean;
    if (this.splitting()) {
      // Un abono por cada cargo al que se aplica y, si sobra, uno sin asignar.
      const parts = this.allocated().filter((x) => x.amount > 0).map((x) => ({ appliesTo: x.id as string | null, amount: x.amount }));
      if (this.remaining() > 0) parts.push({ appliesTo: null, amount: this.remaining() });
      ok = await this.fin.addPayment(personId, parts, { conceptId: typed.id, conceptText: typed.text, date });
    } else {
      ok = await this.fin.addDebt({ personId, kind: 'cargo', conceptId: typed.id, conceptText: typed.text, amount, date, appliesTo: null });
      if (ok && this.card()) {
        // Lo prestado se pagó con tarjeta: queda como compra en esa tarjeta, para el corte.
        const name = conceptLabel(this.fin.concepts(), typed.id, typed.text) || 'Préstamo';
        const who = this.fin.people().find((p) => p.id === personId)?.name ?? '';
        const day = this.date() || nowLocalInput().slice(0, 10);
        await this.fin.addExpense({
          section: 'tarjeta',
          cardId: this.card(),
          conceptId: null,
          conceptText: who ? `${name} · ${who}` : name,
          installment: '',
          total: amount,
          amount,
          purchasedAt: localInputToIso(`${day}T${nowLocalInput().slice(11)}`),
        });
      }
    }
    this.busy.set(false);
    if (!ok) return; // el error queda a la vista y lo capturado, intacto
    this.toasts.show({ message: this.splitting() ? 'Abono guardado' : 'Préstamo guardado' });
    this.saved.emit();
  }
}
