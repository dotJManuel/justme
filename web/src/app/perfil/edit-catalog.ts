import { ChangeDetectionStrategy, Component, computed, effect, inject, input, model, signal } from '@angular/core';
import { BottomSheet } from '../ui/bottom-sheet';
import { Button } from '../ui/button';
import { ConfirmDialog } from '../ui/confirm-dialog';
import { Input } from '../ui/input';
import { ErrorState } from '../ui/states';
import { ToastService } from '../ui/toast';
import { debtsWithDependents } from '../finanzas/finanzas.calc';
import { Concept, CreditCard, Person } from '../finanzas/finanzas.models';
import { FinanzasService } from '../finanzas/finanzas.service';
import { plural } from '../finanzas/finanzas.warn';

export type CatalogKind = 'card' | 'concept' | 'person';
export type CatalogItem = CreditCard | Concept | Person;

const validDay = (n: number): boolean => Number.isInteger(n) && n >= 1 && n <= 31;
const validLast4 = (s: string): boolean => /^(\d{4})?$/.test(s);

/**
 * Alta, edición y baja de una opción de los catálogos (tarjeta, concepto o persona), con las mismas reglas de siempre:
 * desactivar oculta la opción y conserva su historial; eliminar la borra junto con lo que dependa de ella.
 */
@Component({
  selector: 'app-edit-catalog',
  imports: [BottomSheet, Button, ConfirmDialog, ErrorState, Input],
  template: `
    <ui-bottom-sheet [title]="title()" [(open)]="open">
      <form (submit)="$event.preventDefault(); save()" novalidate>
        <ui-input [label]="nameLabel()" [(value)]="name" [error]="nameError()" autocomplete="off" />
        @if (kind() === 'card') {
          <div class="two">
            <ui-input label="Día de corte" type="number" inputmode="numeric" placeholder="1 a 31" [(value)]="cutDay" [error]="dayError()" />
            <ui-input label="Terminación" inputmode="numeric" placeholder="0000" hint="Últimos 4 dígitos (opcional)" [(value)]="last4" [error]="last4Error()" />
          </div>
        }
        @if (fin.error()) {
          <ui-error-state [inline]="true" [message]="fin.error()" (retry)="save()" />
        }
        <div class="actions" [class.one]="!item()">
          @if (item()) {
            <button uiBtn variant="danger" type="button" [disabled]="busy()" (click)="asking.set(true)">Eliminar</button>
          }
          <button uiBtn type="submit" [disabled]="busy()">{{ busy() ? 'Guardando…' : item() ? 'Guardar cambios' : 'Agregar' }}</button>
        </div>
      </form>
    </ui-bottom-sheet>
    <ui-confirm-dialog
      [(open)]="asking" [title]="askTitle()" [message]="askMessage()" [details]="related()"
      [alternativeLabel]="item()?.active ? 'Solo desactivar' : ''" confirmLabel="Eliminar todo" [busy]="busy()"
      (confirmed)="remove()" (alternative)="deactivate()"
    />
  `,
  styles: `
    form { display: flex; flex-direction: column; gap: 16px; }
    .two { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; align-items: start; }
    .actions { display: grid; grid-template-columns: auto 1fr; gap: 8px; }
    .actions.one { grid-template-columns: 1fr; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditCatalog {
  protected readonly fin = inject(FinanzasService);
  private readonly toasts = inject(ToastService);

  readonly kind = input.required<CatalogKind>();
  /** Concepto: gasto, movimiento o familia. Persona: deudor o familia. */
  readonly scope = input('');
  readonly item = input<CatalogItem | null>(null);
  readonly open = model(false);

  protected readonly name = signal('');
  protected readonly cutDay = signal('');
  protected readonly last4 = signal('');
  protected readonly busy = signal(false);
  protected readonly asking = signal(false);
  private readonly tried = signal(false);

  private readonly noun = computed(() => (this.kind() === 'card' ? 'tarjeta' : this.kind() === 'concept' ? 'concepto' : 'persona'));
  protected readonly title = computed(() => `${this.item() ? 'Editar' : 'Nueva'} ${this.noun()}`);
  protected readonly nameLabel = computed(() => (this.kind() === 'person' ? 'Nombre' : this.kind() === 'card' ? 'Nombre de la tarjeta' : 'Concepto'));
  /** Tope de caracteres: los conceptos de movimientos eran texto más largo. */
  private readonly maxLength = computed(() => (this.kind() === 'card' ? 40 : this.kind() === 'concept' ? (this.scope() === 'movimiento' ? 200 : 120) : 120));

  protected readonly nameError = computed(() => {
    if (!this.tried()) return '';
    if (!this.name().trim()) return 'Escribe un nombre';
    return this.name().trim().length > this.maxLength() ? `Máximo ${this.maxLength()} caracteres` : '';
  });
  protected readonly dayError = computed(() => (this.tried() && !validDay(Number(this.cutDay())) ? 'El día de corte debe ser del 1 al 31' : ''));
  protected readonly last4Error = computed(() => (this.tried() && !validLast4(this.last4().trim()) ? 'Son 4 dígitos, o déjala vacía' : ''));

  constructor() {
    effect(() => {
      if (!this.open()) return;
      const it = this.item();
      this.name.set(it?.name ?? '');
      const card = it as CreditCard | null;
      this.cutDay.set(card && 'cutDay' in card ? String(card.cutDay) : '');
      this.last4.set(card && 'cutDay' in card ? (card.last4 ?? '') : '');
      this.tried.set(false);
      this.fin.error.set('');
    });
  }

  protected async save() {
    this.tried.set(true);
    const name = this.name().trim();
    if (!name || name.length > this.maxLength() || this.busy()) return;
    const kind = this.kind();
    if (kind === 'card' && (!validDay(Number(this.cutDay())) || !validLast4(this.last4().trim()))) return;
    const it = this.item();
    this.busy.set(true);
    let ok = true;
    if (kind === 'card') {
      const day = Number(this.cutDay());
      const last4 = this.last4().trim();
      if (!it) ok = await this.fin.addCard(name, day, last4);
      else {
        const c = it as CreditCard;
        const patch: Partial<CreditCard> = {};
        if (name !== c.name) patch.name = name;
        if (day !== c.cutDay) patch.cutDay = day;
        if (last4 !== (c.last4 ?? '')) patch.last4 = last4;
        if (Object.keys(patch).length) ok = await this.fin.updateCard(c.id, patch);
      }
    } else if (kind === 'concept') {
      if (!it) ok = await this.fin.addConcept(this.scope() as Concept['scope'], name);
      else if (name !== it.name) ok = await this.fin.updateConcept(it.id, { name });
    } else if (!it) ok = await this.fin.addPerson(this.scope() as Person['scope'], name);
    else if (name !== it.name) ok = await this.fin.updatePerson(it.id, { name });
    this.busy.set(false);
    if (!ok) return; // el error queda a la vista y lo capturado, intacto
    this.toasts.show({ message: it ? 'Cambios guardados' : 'Agregado' });
    this.open.set(false);
  }

  // ── Eliminar: qué más se borra (igual que antes)
  protected readonly related = computed<string[]>(() => {
    const it = this.item();
    if (!it) return [];
    const kind = this.kind();
    if (kind === 'card') {
      const expenses = this.fin.expenses().filter((e) => e.cardId === it.id).length;
      const cuts = this.fin.cuts().filter((x) => x.cardId === it.id).length;
      return [...(expenses ? [plural(expenses, 'gasto', 'gastos')] : []), ...(cuts ? [plural(cuts, 'corte', 'cortes')] : [])];
    }
    const scope = this.scope();
    if (kind === 'concept') {
      if (scope === 'movimiento') {
        const n = debtsWithDependents(this.fin.debts(), (d) => d.conceptId === it.id).length;
        return n ? [`${plural(n, 'movimiento', 'movimientos')} (cargos y abonos)`] : [];
      }
      const n = (scope === 'familia' ? this.fin.family().filter((m) => m.conceptId === it.id) : this.fin.expenses().filter((e) => e.conceptId === it.id)).length;
      return n ? [scope === 'familia' ? plural(n, 'registro de Recibido o Dado', 'registros de Recibido y Dado') : plural(n, 'gasto', 'gastos')] : [];
    }
    if (scope === 'familia') {
      const n = this.fin.family().filter((m) => m.personId === it.id).length;
      return n ? [plural(n, 'registro de Recibido o Dado', 'registros de Recibido y Dado')] : [];
    }
    const n = debtsWithDependents(this.fin.debts(), (d) => d.personId === it.id).length;
    return n ? [`${plural(n, 'movimiento', 'movimientos')} (cargos y abonos)`] : [];
  });
  protected readonly askTitle = computed(() => {
    const k = this.kind();
    const n = this.item()?.name ?? '';
    return k === 'card' ? `¿Eliminar la tarjeta «${n}»?` : k === 'concept' ? `¿Eliminar el concepto «${n}»?` : `¿Eliminar a «${n}»?`;
  });
  protected readonly askMessage = computed(() => {
    const base = this.related().length
      ? 'Se eliminará también todo lo relacionado con esto. Quedará registrado en el historial de cambios.'
      : 'No tiene nada relacionado: solo se elimina este registro. Quedará registrado en el historial de cambios.';
    return `${base} Si solo quieres ocultarla o dejar de usarla, desactívala.`;
  });

  protected async remove() {
    const it = this.item();
    if (!it) return;
    this.busy.set(true);
    const k = this.kind();
    const ok = k === 'card' ? await this.fin.removeCard(it.id) : k === 'concept' ? await this.fin.removeConcept(it.id) : await this.fin.removePerson(it.id);
    this.busy.set(false);
    this.asking.set(false);
    if (!ok) return;
    this.toasts.show({ message: 'Eliminado' });
    this.open.set(false);
  }

  /** "Solo desactivar": la opción se oculta sin perder su historial. */
  protected async deactivate() {
    const it = this.item();
    if (!it) return;
    this.busy.set(true);
    const k = this.kind();
    const ok = k === 'card' ? await this.fin.updateCard(it.id, { active: false }) : k === 'concept' ? await this.fin.updateConcept(it.id, { active: false }) : await this.fin.updatePerson(it.id, { active: false });
    this.busy.set(false);
    this.asking.set(false);
    if (!ok) return;
    this.toasts.show({ message: 'Desactivado' });
    this.open.set(false);
  }
}
