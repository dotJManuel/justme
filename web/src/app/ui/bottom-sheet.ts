import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, effect, inject, input, model, viewChild } from '@angular/core';
import { Icon } from '../icons/icon';

/**
 * Hoja inferior en móvil y modal centrado en escritorio (≥ 1024 px). Usa `<dialog>` nativo: el foco queda
 * atrapado dentro, Escape cierra y lo de atrás queda inerte. `open` es de doble vía: `[(open)]="show"`.
 */
@Component({
  selector: 'ui-bottom-sheet',
  imports: [Icon],
  template: `
    <dialog #dlg [attr.aria-labelledby]="'sheet-title'" (click)="backdrop($event)" (close)="open.set(false)">
      <div class="panel">
        <span class="grab" aria-hidden="true"></span>
        <header>
          <h2 id="sheet-title">{{ title() }}</h2>
          <button type="button" aria-label="Cerrar" (click)="open.set(false)"><app-icon name="x" [size]="20" /></button>
        </header>
        <div class="body"><ng-content /></div>
      </div>
    </dialog>
  `,
  styles: `
    dialog {
      position: fixed; inset: 0; width: 100%; height: 100%; max-width: none; max-height: none; margin: 0; padding: 0; border: 0;
      background: var(--ov); color: var(--tx); overscroll-behavior: contain;
    }
    dialog[open] { display: flex; align-items: flex-end; justify-content: center; }
    .panel {
      display: flex; flex-direction: column; width: 100%; max-width: 560px; max-height: 92dvh; background: var(--sf);
      border-radius: var(--rr-2) var(--rr-2) 0 0; box-shadow: var(--sh2); animation: up 0.25s ease-out;
    }
    .grab { align-self: center; width: 36px; height: 4px; margin-top: 8px; border-radius: 2px; background: var(--bd2); }
    header { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 8px 8px var(--sp-4); }
    h2 { font-size: 20px; line-height: 28px; font-weight: 600; letter-spacing: -0.01em; }
    header button {
      display: grid; place-items: center; width: var(--touch); height: var(--touch); border: 0; border-radius: var(--rf-2);
      background: transparent; color: var(--tx2); cursor: pointer;
    }
    header button:hover { background: var(--s2); }
    .body { display: flex; flex-direction: column; gap: 12px; overflow-y: auto; padding: 0 var(--sp-4) calc(var(--sp-4) + var(--safe-b)); }
    @media (min-width: 1024px) {
      dialog[open] { align-items: center; }
      .panel { width: 520px; border-radius: 16px; animation: pop 0.2s ease-out; }
      .grab { display: none; }
      header { padding-top: 16px; }
      .body { padding-bottom: var(--sp-5); }
    }
    @keyframes up { from { transform: translateY(24px); opacity: 0; } }
    @keyframes pop { from { transform: scale(0.97); opacity: 0; } }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BottomSheet {
  readonly open = model(false);
  readonly title = input.required<string>();

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

  /** Tocar fuera del panel (sobre el fondo) cierra. */
  protected backdrop(e: MouseEvent) {
    if (e.target === this.dlg().nativeElement) this.open.set(false);
  }
}
