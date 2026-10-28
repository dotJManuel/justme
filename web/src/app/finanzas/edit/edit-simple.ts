import { ChangeDetectionStrategy, Component, computed, effect, inject, input, model, signal } from '@angular/core';
import { ConceptInput } from '../../add/concept-input';
import { BottomSheet } from '../../ui/bottom-sheet';
import { Button } from '../../ui/button';
import { ConfirmDialog } from '../../ui/confirm-dialog';
import { Amount, Option, Select } from '../../ui/fields';
import { Input } from '../../ui/input';
import { ErrorState } from '../../ui/states';
import { ToastService } from '../../ui/toast';
import { conceptLabel, currentCutPeriod, cutPending, debtRows, fmtMoney, parseMoney, resolveConcept, round2 } from '../finanzas.calc';
import { CreditCard, Cut, Debt, FamilyMove } from '../finanzas.models';
import { FinanzasService } from '../finanzas.service';
import { plural } from '../finanzas.warn';

// ── Ingreso mensual ─────────────────────────────────────────────────────

/** El ingreso mensual (de ahí sale "te sobra" o "te falta"). */
@Component({
  selector: 'app-edit-income',
  imports: [Amount, BottomSheet, Button, ErrorState],
  template: `
    <ui-bottom-sheet title="Ingreso mensual" [(open)]="open">
      <form (submit)="$event.preventDefault(); save()" novalidate>
        <ui-amount label="Ingreso mensual" [(value)]="amount" [error]="error()" />
        @if (fin.error()) {
          <ui-error-state [inline]="true" [message]="fin.error()" (retry)="save()" />
        }
        <button uiBtn block type="submit" [disabled]="busy()">{{ busy() ? 'Guardando…' : 'Guardar' }}</button>
      </form>
    </ui-bottom-sheet>
  `,
  styles: `form { display: flex; flex-direction: column; gap: 16px; }`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditIncome {
  protected readonly fin = inject(FinanzasService);
  private readonly toasts = inject(ToastService);
  readonly open = model(false);
  protected readonly amount = signal('');
  protected readonly busy = signal(false);
  protected readonly bad = signal(false);
  protected readonly error = computed(() => (this.bad() ? 'Escribe un monto válido (solo números)' : ''));

  constructor() {
    effect(() => {
      if (!this.open()) return;
      this.amount.set(String(this.fin.income()));
      this.bad.set(false);
      this.fin.error.set('');
    });
  }

  protected async save() {
    const n = parseMoney(this.amount());
    this.bad.set(n === null);
    if (n === null || this.busy()) return;
    if (n === this.fin.income()) return void this.open.set(false);
    this.busy.set(true);
    const ok = await this.fin.saveIncome(n);
    this.busy.set(false);
    if (!ok) return;
    this.toasts.show({ message: 'Ingreso actualizado' });
    this.open.set(false);
  }
}

// ── Corte en curso de una tarjeta ───────────────────────────────────────

/** Monto del corte y lo pagado del corte en curso. El registro se crea la primera vez que se captura alguno. */
@Component({
  selector: 'app-edit-cut',
  imports: [Amount, BottomSheet, Button, ErrorState],
  template: `
    <ui-bottom-sheet [title]="'Corte · ' + (card()?.name ?? '')" [(open)]="open">
      <form (submit)="$event.preventDefault(); save()" novalidate>
        <p class="per">Periodo {{ period()?.label }}</p>
        <ui-amount label="Monto del corte" [(value)]="amount" [error]="aErr()" />
        <ui-amount label="Pagado" [(value)]="paid" [error]="pErr()" />
        <p class="pend">Pendiente <b class="num">{{ money(pending()) }}</b></p>
        @if (fin.error()) {
          <ui-error-state [inline]="true" [message]="fin.error()" (retry)="save()" />
        }
        <button uiBtn block type="submit" [disabled]="busy()">{{ busy() ? 'Guardando…' : 'Guardar' }}</button>
      </form>
    </ui-bottom-sheet>
  `,
  styles: `
    form { display: flex; flex-direction: column; gap: 12px; }
    .per { font-size: 13px; color: var(--tx2); text-align: center; }
    .pend { display: flex; justify-content: space-between; font-size: 14px; color: var(--tx2); }
    .pend b { color: var(--tx); }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditCut {
  protected readonly fin = inject(FinanzasService);
  private readonly toasts = inject(ToastService);
  readonly card = input<CreditCard | null>(null);
  readonly open = model(false);

  protected readonly money = fmtMoney;
  protected readonly amount = signal('');
  protected readonly paid = signal('');
  protected readonly busy = signal(false);
  private readonly tried = signal(false);

  protected readonly period = computed(() => (this.card() ? currentCutPeriod(this.card()!.cutDay, new Date()) : null));
  private readonly saved = computed<Cut | undefined>(() =>
    this.fin.cuts().find((c) => c.cardId === this.card()?.id && c.periodEnd === this.period()?.end),
  );
  private readonly n = (s: string) => (s.trim() === '' ? 0 : parseMoney(s));
  protected readonly pending = computed(() => cutPending({ amount: this.n(this.amount()) ?? 0, paid: this.n(this.paid()) ?? 0 }));
  protected readonly aErr = computed(() => (this.tried() && this.n(this.amount()) === null ? 'Escribe un monto válido (solo números)' : ''));
  protected readonly pErr = computed(() => (this.tried() && this.n(this.paid()) === null ? 'Escribe un monto válido (solo números)' : ''));

  constructor() {
    effect(() => {
      if (!this.open()) return;
      this.amount.set(String(this.saved()?.amount ?? 0));
      this.paid.set(String(this.saved()?.paid ?? 0));
      this.tried.set(false);
      this.fin.error.set('');
    });
  }

  protected async save() {
    this.tried.set(true);
    const amount = this.n(this.amount());
    const paid = this.n(this.paid());
    const card = this.card();
    const period = this.period();
    if (amount === null || paid === null || !card || !period || this.busy()) return;
    const row = this.saved();
    this.busy.set(true);
    let ok = true;
    if (row) {
      // Los cambios se guardan de uno en uno, como siempre.
      if (amount !== row.amount) ok = await this.fin.updateCut(row.id, { amount });
      if (ok && paid !== row.paid) ok = await this.fin.updateCut(row.id, { paid });
    } else if (amount !== 0 || paid !== 0) {
      ok = await this.fin.addCut({ cardId: card.id, period: period.label, periodEnd: period.end, amount, paid });
    }
    this.busy.set(false);
    if (!ok) return;
    this.toasts.show({ message: 'Corte actualizado' });
    this.open.set(false);
  }
}

// ── Movimiento de dinero que me deben ───────────────────────────────────

/** Editar o eliminar un cargo (lo prestado) o un abono (lo pagado). */
@Component({
  selector: 'app-edit-debt',
  imports: [Amount, BottomSheet, Button, ConceptInput, ConfirmDialog, ErrorState, Input, Select],
  template: `
    <ui-bottom-sheet [title]="d()?.kind === 'cargo' ? 'Préstamo' : 'Abono'" [(open)]="open">
      <form (submit)="$event.preventDefault(); save()" novalidate>
        <ui-amount [(value)]="amount" [error]="amountError()" />
        <ui-select label="Persona" [options]="people()" [(value)]="person" [disabled]="locked()" />
        @if (locked()) {
          <p class="note">Este cargo ya tiene abonos aplicados: no puede cambiar de persona.</p>
        }
        <app-concept-input label="Concepto (opcional)" [options]="conceptOptions()" [(text)]="concept" />
        @if (d()?.kind === 'abono') {
          <ui-select label="Aplicar a" placeholder="Sin asignar a un cargo" [options]="cargos()" [(value)]="appliesTo" />
        }
        <ui-input label="Fecha" type="date" [(value)]="date" />
        @if (fin.error()) {
          <ui-error-state [inline]="true" [message]="fin.error()" (retry)="save()" />
        }
        <div class="actions">
          <button uiBtn variant="danger" type="button" [disabled]="busy()" (click)="asking.set(true)">Eliminar</button>
          <button uiBtn type="submit" [disabled]="busy()">{{ busy() ? 'Guardando…' : 'Guardar cambios' }}</button>
        </div>
      </form>
    </ui-bottom-sheet>
    <ui-confirm-dialog [(open)]="asking" [title]="askTitle()" [message]="askMessage()" [details]="askDetails()" [busy]="busy()" (confirmed)="remove()" />
  `,
  styles: `
    form { display: flex; flex-direction: column; gap: 16px; }
    .note { font-size: 13px; line-height: 18px; color: var(--tx2); margin-top: -8px; }
    .actions { display: grid; grid-template-columns: auto 1fr; gap: 8px; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditDebt {
  protected readonly fin = inject(FinanzasService);
  private readonly toasts = inject(ToastService);
  readonly debt = input<Debt | null>(null);
  readonly open = model(false);

  protected readonly d = computed(() => this.debt());
  protected readonly amount = signal('');
  protected readonly person = signal('');
  protected readonly concept = signal('');
  protected readonly appliesTo = signal('');
  protected readonly date = signal('');
  protected readonly busy = signal(false);
  protected readonly asking = signal(false);
  private readonly tried = signal(false);

  private readonly rows = computed(() => debtRows(this.fin.debts(), new Date(), this.fin.people(), this.fin.concepts()));
  protected readonly conceptOptions = computed(() => this.fin.concepts().filter((c) => c.scope === 'movimiento'));
  /** Las activas y la que ya tiene el movimiento. */
  protected readonly people = computed<Option[]>(() =>
    this.fin.people().filter((p) => p.scope === 'deudor' && (p.active || p.id === this.d()?.personId)).map((p) => ({ value: p.id, label: p.name })),
  );
  /** Un cargo con abonos aplicados no puede cambiar de persona. */
  protected readonly locked = computed(() => !!this.d() && this.rows().some((r) => r.appliesTo === this.d()!.id));
  protected readonly cargos = computed<Option[]>(() =>
    this.rows()
      .filter((r) => r.kind === 'cargo' && r.personId === this.person() && ((r.balance ?? 0) > 0 || r.id === this.d()?.appliesTo))
      .map((r) => ({ value: r.id, label: `${r.conceptName || 'Sin concepto'} · ${fmtMoney(r.balance ?? 0)} pendiente` })),
  );
  protected readonly amountError = computed(() => (this.tried() && !(parseMoney(this.amount()) ?? 0) ? 'Escribe un monto mayor a cero' : ''));

  /** Lo que se borra junto con un cargo: sus abonos aplicados. */
  private readonly abonos = computed(() => (this.d()?.kind === 'cargo' ? this.rows().filter((r) => r.appliesTo === this.d()!.id).length : 0));
  protected readonly askTitle = computed(() => {
    const d = this.d();
    const who = this.rows().find((r) => r.id === d?.id)?.personName ?? '';
    return `¿Eliminar este ${d?.kind ?? 'movimiento'} de ${who}?`;
  });
  protected readonly askMessage = computed(() =>
    this.abonos() ? 'Se eliminará también todo lo relacionado con esto. Quedará registrado en el historial de cambios.' : 'Quedará registrado en el historial de cambios.',
  );
  protected readonly askDetails = computed(() => (this.abonos() ? [plural(this.abonos(), 'abono aplicado', 'abonos aplicados')] : []));

  constructor() {
    effect(() => {
      const d = this.debt();
      if (!this.open() || !d) return;
      this.amount.set(String(d.amount));
      this.person.set(d.personId);
      this.concept.set(conceptLabel(this.fin.concepts(), d.conceptId, d.conceptText));
      this.appliesTo.set(d.appliesTo ?? '');
      this.date.set(d.date ?? '');
      this.tried.set(false);
      this.fin.error.set('');
    });
  }

  protected async save() {
    const d = this.debt();
    const amount = parseMoney(this.amount());
    this.tried.set(true);
    if (!d || !amount || !this.person() || this.busy()) return;
    const concept = resolveConcept(this.conceptOptions(), this.concept(), d.conceptId);
    const patch: Partial<Omit<Debt, 'id' | 'kind'>> = {};
    if (this.person() !== d.personId) patch.personId = this.person();
    if (concept.id !== d.conceptId || concept.text !== d.conceptText) Object.assign(patch, { conceptId: concept.id, conceptText: concept.text });
    if (amount !== d.amount) patch.amount = amount;
    if ((this.date() || null) !== d.date) patch.date = this.date() || null;
    if (d.kind === 'abono' && (this.appliesTo() || null) !== d.appliesTo) patch.appliesTo = this.appliesTo() || null;
    if (!Object.keys(patch).length) return void this.open.set(false);
    this.busy.set(true);
    const ok = await this.fin.updateDebt(d.id, patch);
    this.busy.set(false);
    if (!ok) return;
    this.toasts.show({ message: 'Movimiento actualizado' });
    this.open.set(false);
  }

  protected async remove() {
    const d = this.debt();
    if (!d) return;
    this.busy.set(true);
    const ok = await this.fin.removeDebt(d.id);
    this.busy.set(false);
    this.asking.set(false);
    if (!ok) return;
    this.toasts.show({ message: 'Movimiento eliminado' });
    this.open.set(false);
  }
}

// ── Dinero con familia ──────────────────────────────────────────────────

/** Editar o eliminar un recibido o un dado. En Recibido el concepto es obligatorio; en Dado, la persona. */
@Component({
  selector: 'app-edit-family',
  imports: [Amount, BottomSheet, Button, ConceptInput, ConfirmDialog, ErrorState, Input, Select],
  template: `
    <ui-bottom-sheet [title]="m()?.direction === 'recibido' ? 'Recibido' : 'Dado'" [(open)]="open">
      <form (submit)="$event.preventDefault(); save()" novalidate>
        <ui-amount [(value)]="amount" [error]="amountError()" />
        <app-concept-input
          [label]="received() ? 'Concepto' : 'Concepto (opcional)'" [options]="conceptOptions()" [(text)]="concept" [error]="conceptError()"
        />
        <ui-select
          [label]="received() ? 'De quién (opcional)' : 'Para quién'" [placeholder]="received() ? 'Nadie en particular' : ''"
          [options]="people()" [(value)]="person"
        />
        @if (personError()) {
          <p class="err" role="alert">{{ personError() }}</p>
        }
        <ui-input label="Fecha" type="date" [(value)]="date" />
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
      [(open)]="asking" title="¿Eliminar este registro?" message="Quedará registrado en el historial de cambios."
      [busy]="busy()" (confirmed)="remove()"
    />
  `,
  styles: `
    form { display: flex; flex-direction: column; gap: 16px; }
    .err { margin-top: -10px; font-size: 12px; color: var(--rd); font-weight: 500; }
    .actions { display: grid; grid-template-columns: auto 1fr; gap: 8px; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditFamily {
  protected readonly fin = inject(FinanzasService);
  private readonly toasts = inject(ToastService);
  readonly move = input<FamilyMove | null>(null);
  readonly open = model(false);

  protected readonly m = computed(() => this.move());
  protected readonly received = computed(() => this.m()?.direction === 'recibido');
  protected readonly amount = signal('');
  protected readonly concept = signal('');
  protected readonly person = signal('');
  protected readonly date = signal('');
  protected readonly busy = signal(false);
  protected readonly asking = signal(false);
  private readonly tried = signal(false);

  protected readonly conceptOptions = computed(() => this.fin.concepts().filter((c) => c.scope === 'familia'));
  /** Las activas y la que ya tiene el registro. */
  protected readonly people = computed<Option[]>(() =>
    this.fin.people().filter((p) => p.scope === 'familia' && (p.active || p.id === this.m()?.personId)).map((p) => ({ value: p.id, label: p.name })),
  );
  protected readonly amountError = computed(() => (this.tried() && !(parseMoney(this.amount()) ?? 0) ? 'Escribe un monto mayor a cero' : ''));
  protected readonly conceptError = computed(() => (this.tried() && this.received() && !this.concept().trim() ? 'El concepto es obligatorio' : ''));
  protected readonly personError = computed(() => (this.tried() && !this.received() && !this.person() ? 'Elige para quién' : ''));

  constructor() {
    effect(() => {
      const m = this.move();
      if (!this.open() || !m) return;
      this.amount.set(String(m.amount));
      this.concept.set(conceptLabel(this.fin.concepts(), m.conceptId, m.conceptText));
      this.person.set(m.personId ?? '');
      this.date.set(m.date ?? '');
      this.tried.set(false);
      this.fin.error.set('');
    });
  }

  protected async save() {
    const m = this.move();
    this.tried.set(true);
    const amount = parseMoney(this.amount());
    if (!m || !amount || this.busy()) return;
    if (this.received() ? !this.concept().trim() : !this.person()) return;
    const concept = resolveConcept(this.conceptOptions(), this.concept(), m.conceptId);
    const patch: Partial<Omit<FamilyMove, 'id' | 'direction'>> = {};
    if (concept.id !== m.conceptId || concept.text !== m.conceptText) Object.assign(patch, { conceptId: concept.id, conceptText: concept.text });
    if ((this.person() || null) !== m.personId) patch.personId = this.person() || null;
    if ((this.date() || null) !== m.date) patch.date = this.date() || null;
    if (round2(amount) !== m.amount) patch.amount = amount;
    if (!Object.keys(patch).length) return void this.open.set(false);
    this.busy.set(true);
    const ok = await this.fin.updateFamily(m.id, patch);
    this.busy.set(false);
    if (!ok) return;
    this.toasts.show({ message: 'Registro actualizado' });
    this.open.set(false);
  }

  protected async remove() {
    const m = this.move();
    if (!m) return;
    this.busy.set(true);
    const ok = await this.fin.removeFamily(m.id);
    this.busy.set(false);
    this.asking.set(false);
    if (!ok) return;
    this.toasts.show({ message: 'Registro eliminado' });
    this.open.set(false);
  }
}
