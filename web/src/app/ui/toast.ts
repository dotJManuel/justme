import { ChangeDetectionStrategy, Component, Injectable, inject, signal } from '@angular/core';
import { Icon } from '../icons/icon';

export interface ToastOptions {
  message: string;
  /** Texto de la acción ("Deshacer"); con él, `onAction` corre al tocarla. */
  actionLabel?: string;
  onAction?: () => void;
  /** `racha` lleva el ícono naranja de XP y admite una segunda línea (`detail`). */
  tone?: 'default' | 'error' | 'racha';
  detail?: string;
  /** Milisegundos en pantalla; por defecto 5 s con acción y 3 s sin ella. */
  duration?: number;
}

interface ToastItem extends ToastOptions {
  id: number;
}

/** Avisos breves ("Gasto guardado · Deshacer"). Solo se ve uno a la vez: el nuevo reemplaza al anterior. */
@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly current = signal<ToastItem | null>(null);
  private timer?: ReturnType<typeof setTimeout>;
  private seq = 0;

  show(options: ToastOptions): number {
    clearTimeout(this.timer);
    const id = ++this.seq;
    this.current.set({ ...options, id });
    const ms = options.duration ?? (options.actionLabel ? 5000 : 3000);
    this.timer = setTimeout(() => this.dismiss(id), ms);
    return id;
  }

  /** Aviso de error con "Reintentar". */
  error(message: string, retry?: () => void) {
    return this.show({ message, tone: 'error', actionLabel: retry ? 'Reintentar' : undefined, onAction: retry, duration: 6000 });
  }

  dismiss(id?: number) {
    if (id !== undefined && this.current()?.id !== id) return;
    clearTimeout(this.timer);
    this.current.set(null);
  }
}

/** Se pone una sola vez en la raíz de la app. */
@Component({
  selector: 'ui-toast-host',
  imports: [Icon],
  template: `
    @if (toasts.current(); as t) {
      <div class="toast" [class.err]="t.tone === 'error'" [attr.role]="t.tone === 'error' ? 'alert' : 'status'">
        @if (t.tone === 'racha') {
          <span class="xp"><app-icon name="bolt" [size]="18" /></span>
        } @else {
          <app-icon [name]="t.tone === 'error' ? 'alert' : 'check'" [size]="18" [stroke]="2.2" />
        }
        <span class="msg">
          @if (t.detail) {
            <b>{{ t.message }}</b>
            <span class="sub">{{ t.detail }}</span>
          } @else {
            {{ t.message }}
          }
        </span>
        @if (t.actionLabel) {
          <button type="button" (click)="act(t.id, t.onAction)">{{ t.actionLabel }}</button>
        }
      </div>
    }
  `,
  styles: `
    :host {
      position: fixed; z-index: 60; left: 0; right: 0; display: flex; justify-content: center; pointer-events: none;
      bottom: calc(var(--nav-h) + var(--safe-b) + 12px); padding: 0 var(--sp-4);
    }
    @media (min-width: 1024px) { :host { bottom: 24px; } }
    .toast {
      pointer-events: auto; display: flex; align-items: center; gap: 10px; width: min(440px, 100%); padding: 6px 8px 6px 14px; min-height: 48px;
      border-radius: var(--rf-3); background: var(--tx); color: var(--bg); box-shadow: var(--sh2); animation: in 0.2s ease-out;
    }
    .toast.err { background: var(--rds); color: var(--rd); box-shadow: inset 0 0 0 1px var(--rd); }
    .msg { display: flex; flex-direction: column; flex: 1; min-width: 0; font-size: 14px; line-height: 20px; font-weight: 500; }
    .msg b { font-weight: 700; }
    .sub { font-size: 13px; line-height: 18px; opacity: 0.8; }
    .xp { display: grid; place-items: center; flex: none; width: 36px; height: 36px; border-radius: var(--rf-3); background: var(--orf); color: var(--ink); }
    .xp app-icon { fill: currentColor; }
    button {
      min-height: var(--touch); padding: 0 12px; border: 0; border-radius: 8px; background: transparent; color: inherit;
      font: inherit; font-size: 14px; font-weight: 600; text-decoration: underline; cursor: pointer;
    }
    @keyframes in { from { opacity: 0; transform: translateY(8px); } }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ToastHost {
  protected readonly toasts = inject(ToastService);

  protected act(id: number, fn?: () => void) {
    this.toasts.dismiss(id);
    fn?.();
  }
}
