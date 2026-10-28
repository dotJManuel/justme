import { ChangeDetectionStrategy, Component, ElementRef, effect, inject, viewChild } from '@angular/core';
import { HabitsStore } from '../habits/habits.store';

/** "¡Racha asegurada!": se abre sola al cumplir la meta del día (la pide `HabitsStore.complete`). Se pone una vez en la raíz. */
@Component({
  selector: 'app-celebration',
  template: `
    <dialog #dlg aria-labelledby="cel-title" (close)="store.celebrating.set(null)" (click)="backdrop($event)">
      <div class="panel">
        <i class="c c1" aria-hidden="true"></i><i class="c c2" aria-hidden="true"></i>
        <i class="c c3" aria-hidden="true"></i><i class="c c4" aria-hidden="true"></i>
        <div class="flame">
          <svg width="96" height="96" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2c1.2 3.8 6 6 6 11a6 6 0 0 1-12 0c0-2.5 1.2-4.2 2.4-5.4 0 2.4 1.2 3.6 2.4 3.6 0-3.6-1.2-6 1.2-9.2z" /></svg>
          <span class="n num">{{ store.celebrating() }}</span>
        </div>
        <h2 id="cel-title">¡Racha asegurada!</h2>
        <p>{{ text() }}</p>
        <button type="button" (click)="close()">Seguir</button>
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
      position: relative; overflow: hidden; display: flex; flex-direction: column; align-items: center; gap: 10px; width: min(340px, 100%);
      padding: 32px 24px 24px; border-radius: var(--rr-2); background: var(--ors); text-align: center; box-shadow: var(--sh2);
      animation: pop 0.3s ease-out;
    }
    .flame { position: relative; width: 96px; height: 96px; animation: bump 0.5s ease-out 0.15s both; }
    .flame path { fill: var(--orf); }
    .n { position: absolute; left: 0; right: 0; bottom: 14px; font-size: 26px; font-weight: 800; color: var(--ink); text-align: center; }
    h2 { font-size: 18px; line-height: 24px; font-weight: 800; }
    p { font-size: 13px; line-height: 18px; color: var(--tx2); }
    button {
      margin-top: 4px; min-height: var(--touch); padding: 0 24px; border: 0; border-radius: var(--rr-pill);
      background: var(--tx); color: var(--bg); font: inherit; font-size: 14px; font-weight: 700; cursor: pointer;
    }
    .c { position: absolute; display: block; animation: drop 0.9s ease-out both; }
    .c1 { top: 22px; left: 28px; width: 8px; height: 8px; border-radius: 2px; background: var(--orf); transform: rotate(20deg); }
    .c2 { top: 46px; right: 30px; width: 6px; height: 10px; border-radius: 2px; background: var(--orf2); transform: rotate(-30deg); animation-delay: 0.1s; }
    .c3 { top: 96px; left: 18px; width: 6px; height: 6px; border-radius: 50%; background: var(--grf); animation-delay: 0.2s; }
    .c4 { top: 18px; right: 64px; width: 6px; height: 6px; border-radius: 50%; background: var(--ac); animation-delay: 0.15s; }
    @keyframes pop { from { transform: scale(0.94); opacity: 0; } }
    @keyframes bump { 0% { transform: scale(0.8); } 60% { transform: scale(1.1); } 100% { transform: scale(1); } }
    @keyframes drop { from { transform: translateY(-14px) rotate(0); opacity: 0; } }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Celebration {
  protected readonly store = inject(HabitsStore);
  private readonly dlg = viewChild.required<ElementRef<HTMLDialogElement>>('dlg');

  constructor() {
    effect(() => {
      const el = this.dlg().nativeElement;
      const open = this.store.celebrating() !== null;
      if (open && !el.open) el.showModal();
      else if (!open && el.open) el.close();
    });
  }

  protected text(): string {
    const n = this.store.celebrating() ?? 0;
    return n <= 1 ? 'Empezaste tu racha. ¡Sigue mañana!' : `${n} días seguidos.`;
  }

  protected close() {
    this.store.celebrating.set(null);
  }

  protected backdrop(e: MouseEvent) {
    if (e.target === this.dlg().nativeElement) this.close();
  }
}
