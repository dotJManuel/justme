import { ChangeDetectionStrategy, Component, computed, inject, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { dateKey } from '../habits/streaks';
import { Icon } from '../icons/icon';
import { conceptLabel, debtRows, fmtMoney, localInputToIso, nowLocalInput, parseMoney, resolveConcept, round2 } from '../finanzas/finanzas.calc';
import { FinanzasService } from '../finanzas/finanzas.service';
import { Button } from '../ui/button';
import { Amount, Choice, Option, Select } from '../ui/fields';
import { Input } from '../ui/input';
import { ErrorState } from '../ui/states';
import { ToastService } from '../ui/toast';
import { AddSheetService } from './add-sheet.service';
import { ConceptInput } from './concept-input';

/**
 * Préstamo o abono de una persona, con las mismas reglas de siempre. Lo prestado puede registrarse además como
 * compra de una tarjeta. Un pago se reparte entre los cargos pendientes de la persona (un abono por cada uno) y
 * lo que sobra queda sin asignar.
 */
@Component({
  selector: 'app-add-loan',
  imports: [Amount, Button, Choice, ConceptInput, ErrorState, Icon, Input, RouterLink, Select],
  template: `
    <form (submit)="$event.preventDefault(); save()" novalidate>
      <ui-amount [label]="kind() === 'abono' ? 'Cuánto te pagó' : 'Monto'" [(value)]="amount" [error]="amountError()" />
      @if (people().length) {
        <ui-select label="Persona" placeholder="Elige a quién" [options]="people()" [(value)]="person" />
        @if (personError()) {
          <p class="err" role="alert">{{ personError() }}</p>
        }
      } @else {
        <p class="note">Aún no hay personas. Agrégalas en <a routerLink="/perfil/catalogos">Catálogos</a> para registrar préstamos.</p>
      }
      <app-concept-input label="Concepto (opcional)" placeholder="Ej. Recarga" [options]="conceptOptions()" [(text)]="concept" />

      @if (splitting() && person()) {
        <section class="apply" aria-label="Cómo se aplica el pago">
          <div class="ah">
            <span class="lg">Se aplica a</span>
            @if (pending().length) {
              <button type="button" class="tgl" (click)="toggleManual()">{{ manual() ? 'Aplicar automático' : 'Repartir manualmente' }}</button>
            }
          </div>
          @if (!pending().length) {
            <p class="note">Esta persona no tiene cargos pendientes: el pago queda sin asignar.</p>
          } @else if (!manual()) {
            @for (x of preview(); track x.id) {
              <div class="pv">
                <span class="ok"><app-icon name="check" [size]="16" /></span>
                <span class="pn"><span class="t">{{ x.name }}</span><span class="s">Debe {{ money(x.balance) }}</span></span>
                <span class="pa"><b class="num">{{ money(x.amount) }}</b><span class="s">{{ x.amount >= x.balance ? 'Queda saldado' : 'Quedan ' + money(x.balance - x.amount) }}</span></span>
              </div>
            } @empty {
              <p class="note">Escribe cuánto te pagó para ver cómo se aplica.</p>
            }
            @if (parsed() && remaining() > 0) {
              <p class="note">Sobran {{ money(remaining()) }}: quedan como pago sin asignar.</p>
            }
          } @else {
            <fieldset class="alloc">
              <legend class="sr-only">¿A qué cargos aplica?</legend>
              @for (c of pending(); track c.id) {
                <div class="line">
                  <label [for]="'alloc-' + c.id">
                    <span class="t">{{ c.conceptName || 'Sin concepto' }}</span>
                    <span class="s">Debe {{ money(c.balance ?? 0) }}</span>
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
        </section>
      }
      @if (kind() === 'cargo' && cards().length) {
        <ui-choice label="¿Lo pagaste con tarjeta?" [options]="cardOptions()" [(value)]="card" />
      }
      <ui-input label="Fecha" type="date" [(value)]="date" />

      @if (fin.error()) {
        <ui-error-state [inline]="true" [message]="fin.error()" (retry)="save()" />
      }
      <button uiBtn block type="submit" [disabled]="busy()">{{ busy() ? 'Guardando…' : kind() === 'cargo' ? 'Guardar préstamo' : 'Guardar pago' }}</button>
    </form>
  `,
  styles: `
    :host { display: block; }
    form { display: flex; flex-direction: column; gap: 16px; }
    .note { font-size: 13px; line-height: 18px; color: var(--tx2); }
    .note a { color: var(--ac); font-weight: 600; }
    .err { font-size: 12px; color: var(--rd); font-weight: 500; }
    p.err { margin-top: -10px; }
    .apply { display: flex; flex-direction: column; gap: 10px; }
    .ah { display: flex; align-items: center; justify-content: space-between; }
    .lg { font-size: 13px; line-height: 16px; font-weight: 600; color: var(--tx2); }
    .tgl { min-height: 32px; padding: 0 4px; border: 0; background: none; color: var(--ac); font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; }
    .pv { display: flex; align-items: center; gap: 12px; padding: 12px; border-radius: var(--rf-3); background: var(--grs); box-shadow: inset 0 0 0 1px var(--bd); }
    .ok { display: grid; place-items: center; flex: none; width: 28px; height: 28px; border-radius: 50%; background: var(--sf); color: var(--gr); }
    .pn, .pa { display: flex; flex-direction: column; min-width: 0; }
    .pn { flex: 1; }
    .pa { align-items: flex-end; flex: none; }
    .pa b { font-size: 15px; font-weight: 650; }
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
  /** Repartir el pago a mano; si no, se aplica solo al cargo más antiguo primero. */
  protected readonly manual = signal(false);
  /** Cargos pendientes de la persona elegida, entre los que se reparte el pago. */
  protected readonly pending = computed(() => {
    const p = this.person();
    if (!this.splitting() || !p) return [];
    return this.rows().filter((r) => r.kind === 'cargo' && r.personId === p && (r.balance ?? 0) > 0);
  });
  /** Reparto automático: del cargo más antiguo al más reciente, hasta agotar lo que pagó. */
  protected readonly auto = computed(() => {
    let left = this.parsed() ?? 0;
    return [...this.pending()]
      .sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999'))
      .map((c) => {
        const balance = c.balance ?? 0;
        const amount = Math.max(0, Math.min(balance, left));
        left = round2(left - amount);
        return { id: c.id, name: c.conceptName || 'Sin concepto', balance, amount };
      });
  });
  protected readonly preview = computed(() => this.auto().filter((x) => x.amount > 0));
  private readonly allocated = computed(() =>
    this.manual()
      ? this.pending().map((c) => ({ id: c.id, balance: c.balance ?? 0, amount: parseMoney(this.alloc()[c.id] ?? '') ?? 0 }))
      : this.auto().map(({ id, balance, amount }) => ({ id, balance, amount })),
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

  /** Pasa a repartir a mano (con lo automático como punto de partida) o vuelve al reparto automático. */
  protected toggleManual() {
    if (!this.manual()) this.alloc.set(Object.fromEntries(this.auto().filter((x) => x.amount > 0).map((x) => [x.id, String(x.amount)])));
    this.manual.update((m) => !m);
  }

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
    this.toasts.show({ message: this.splitting() ? 'Pago guardado' : 'Préstamo guardado' });
    this.saved.emit();
  }
}
