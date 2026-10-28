import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, effect, inject, input, model, output, viewChild } from '@angular/core';
import { Button } from './button';

/**
 * Confirmación centrada. Para borrar algo con dependencias, `details` lista cuántos registros se van con él y
 * `alternativeLabel` ofrece la salida segura ("Solo desactivar").
 */
@Component({
  selector: 'ui-confirm-dialog',
  imports: [Button],
  template: `
    <dialog #dlg role="alertdialog" aria-labelledby="cd-title" aria-describedby="cd-msg" (click)="backdrop($event)" (close)="closed()">
      <div class="panel">
        <h2 id="cd-title">{{ title() }}</h2>
        <p id="cd-msg">{{ message() }}</p>
        @if (details().length) {
          <ul>
            @for (d of details(); track d) {
              <li>{{ d }}</li>
            }
          </ul>
        }
        <div class="actions">
          <button uiBtn variant="secondary" type="button" [disabled]="busy()" (click)="open.set(false)">{{ cancelLabel() }}</button>
          @if (alternativeLabel()) {
            <button uiBtn variant="secondary" type="button" [disabled]="busy()" (click)="alternative.emit()">{{ alternativeLabel() }}</button>
          }
          <button uiBtn [variant]="tone() === 'danger' ? 'danger' : 'primary'" type="button" [disabled]="busy()" (click)="confirmed.emit()">{{ confirmLabel() }}</button>
        </div>
      </div>
    </dialog>
  `,
  styles: `
    dialog {
      position: fixed; inset: 0; width: 100%; height: 100%; max-width: none; max-height: none; margin: 0; padding: 0; border: 0;
      background: var(--ov); color: var(--tx);
    }
    dialog[open] { display: flex; align-items: center; justify-content: center; padding: var(--sp-4); }
    .panel {
      display: flex; flex-direction: column; gap: 12px; width: min(420px, 100%); padding: var(--sp-5);
      border-radius: 16px; background: var(--sf); box-shadow: var(--sh2); animation: pop 0.2s ease-out;
    }
    h2 { font-size: 20px; line-height: 28px; font-weight: 600; letter-spacing: -0.01em; }
    p { font-size: 14px; line-height: 20px; color: var(--tx2); }
    ul { margin: 0; padding: 12px 12px 12px 28px; border-radius: var(--rf-2); background: var(--rds); color: var(--rd); font-size: 14px; line-height: 20px; font-weight: 500; }
    .actions { display: flex; flex-direction: column-reverse; gap: 8px; margin-top: 8px; }
    @media (min-width: 480px) { .actions { flex-direction: row; justify-content: flex-end; } }
    @keyframes pop { from { transform: scale(0.97); opacity: 0; } }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfirmDialog {
  readonly open = model(false);
  readonly title = input.required<string>();
  readonly message = input('');
  /** Lo que se borrará junto con esto: "3 gastos", "2 cortes". */
  readonly details = input<string[]>([]);
  readonly confirmLabel = input('Eliminar');
  readonly cancelLabel = input('Cancelar');
  readonly alternativeLabel = input('');
  readonly tone = input<'danger' | 'primary'>('danger');
  /** Mientras se guarda: bloquea los botones. */
  readonly busy = input(false);

  readonly confirmed = output<void>();
  readonly alternative = output<void>();

  private readonly dlg = viewChild.required<ElementRef<HTMLDialogElement>>('dlg');

  constructor() {
    effect(() => {
      const el = this.dlg().nativeElement;
      const wanted = this.open();
      if (wanted && !el.open) el.showModal();
      else if (!wanted && el.open) el.close();
      document.documentElement.style.overflow = wanted ? 'hidden' : '';
    });
    inject(DestroyRef).onDestroy(() => (document.documentElement.style.overflow = ''));
  }

  protected closed() {
    this.open.set(false);
  }

  protected backdrop(e: MouseEvent) {
    if (e.target === this.dlg().nativeElement && !this.busy()) this.open.set(false);
  }
}
