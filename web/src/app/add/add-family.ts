import { ChangeDetectionStrategy, Component, computed, inject, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { dateKey } from '../habits/streaks';
import { parseMoney, resolveConcept } from '../finanzas/finanzas.calc';
import { FinanzasService } from '../finanzas/finanzas.service';
import { Button } from '../ui/button';
import { Amount, Choice, Option, Select } from '../ui/fields';
import { Input } from '../ui/input';
import { ErrorState } from '../ui/states';
import { ToastService } from '../ui/toast';
import { ConceptInput } from './concept-input';

const DIRECTIONS: Option[] = [
  { value: 'recibido', label: 'Recibí' },
  { value: 'dado', label: 'Di' },
];

/**
 * Dinero con familia. Un recibido siempre lleva concepto (y de quién es opcional); un dado siempre lleva persona,
 * "para quién" (y el concepto es opcional).
 */
@Component({
  selector: 'app-add-family',
  imports: [Amount, Button, Choice, ConceptInput, ErrorState, Input, RouterLink, Select],
  template: `
    <form (submit)="$event.preventDefault(); save()" novalidate>
      <ui-choice label="¿Qué pasó?" [options]="directions" [(value)]="direction" columns="repeat(2, minmax(0, 1fr))" />
      <ui-amount [(value)]="amount" [error]="amountError()" />
      <app-concept-input
        [label]="received() ? 'Concepto' : 'Concepto (opcional)'" [options]="conceptOptions()" [(text)]="concept" [error]="conceptError()"
        placeholder="Ej. Quincena"
      />
      @if (people().length || received()) {
        <ui-select
          [label]="received() ? 'De quién (opcional)' : 'Para quién'" [placeholder]="received() ? 'Nadie en particular' : 'Elige a quién'"
          [options]="people()" [(value)]="person"
        />
        @if (personError()) {
          <p class="err" role="alert">{{ personError() }}</p>
        }
      } @else {
        <p class="note">Aún no hay personas de familia. Agrégalas en <a routerLink="/perfil/catalogos">Catálogos</a>.</p>
      }
      <ui-input label="Fecha" type="date" [(value)]="date" />

      @if (fin.error()) {
        <ui-error-state [inline]="true" [message]="fin.error()" (retry)="save()" />
      }
      <button uiBtn block type="submit" [disabled]="busy()">{{ busy() ? 'Guardando…' : 'Guardar' }}</button>
    </form>
  `,
  styles: `
    :host { display: block; }
    form { display: flex; flex-direction: column; gap: 16px; }
    .note { font-size: 14px; line-height: 20px; color: var(--tx2); }
    .note a { color: var(--ac); font-weight: 600; }
    .err { margin-top: -10px; font-size: 12px; color: var(--rd); font-weight: 500; }
    button[type='submit'] { min-height: 52px; font-size: 16px; font-weight: 700; border-radius: var(--rf-3); }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AddFamily {
  protected readonly fin = inject(FinanzasService);
  private readonly toasts = inject(ToastService);

  readonly saved = output<void>();
  protected readonly directions = DIRECTIONS;

  protected readonly direction = signal<string>('recibido');
  protected readonly amount = signal('');
  protected readonly concept = signal('');
  protected readonly person = signal('');
  protected readonly date = signal(dateKey(new Date()));
  protected readonly busy = signal(false);
  protected readonly tried = signal(false);

  protected readonly received = computed(() => this.direction() === 'recibido');
  protected readonly people = computed<Option[]>(() =>
    this.fin.people().filter((p) => p.scope === 'familia' && p.active).map((p) => ({ value: p.id, label: p.name })),
  );
  protected readonly conceptOptions = computed(() => this.fin.concepts().filter((c) => c.scope === 'familia'));

  private readonly parsed = computed(() => parseMoney(this.amount()));
  protected readonly amountError = computed(() =>
    this.tried() && !(this.parsed() && this.parsed()! > 0) ? 'Escribe un monto mayor a cero' : '',
  );
  protected readonly conceptError = computed(() =>
    this.tried() && this.received() && !this.concept().trim() ? 'Escribe un concepto para continuar' : '',
  );
  protected readonly personError = computed(() => (this.tried() && !this.received() && !this.person() ? 'Elige para quién' : ''));

  protected async save() {
    this.tried.set(true);
    const amount = this.parsed();
    if (!amount || amount <= 0 || this.busy()) return;
    if (this.received() ? !this.concept().trim() : !this.person()) return;
    const typed = resolveConcept(this.conceptOptions(), this.concept());
    this.busy.set(true);
    const ok = await this.fin.addFamily({
      direction: this.received() ? 'recibido' : 'dado',
      conceptId: typed.id,
      conceptText: typed.text,
      personId: this.person() || null,
      date: this.date() || null,
      amount,
    });
    this.busy.set(false);
    if (!ok) return;
    this.toasts.show({ message: this.received() ? 'Recibido guardado' : 'Dado guardado' });
    this.saved.emit();
  }
}
