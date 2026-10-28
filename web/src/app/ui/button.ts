import { ChangeDetectionStrategy, Component, ViewEncapsulation, booleanAttribute, input } from '@angular/core';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'pill';

/**
 * Botón o enlace con el estilo del sistema: `<button uiBtn variant="primary">Guardar</button>`.
 * Se usa sobre el elemento nativo para conservar teclado, foco y semántica.
 */
@Component({
  selector: 'button[uiBtn], a[uiBtn]',
  host: {
    class: 'ui-btn',
    '[class.ui-btn--primary]': "variant() === 'primary'",
    '[class.ui-btn--secondary]': "variant() === 'secondary'",
    '[class.ui-btn--ghost]': "variant() === 'ghost'",
    '[class.ui-btn--danger]': "variant() === 'danger'",
    '[class.ui-btn--pill]': "variant() === 'pill'",
    '[class.ui-btn--block]': 'block()',
    '[class.ui-btn--sm]': 'small()',
  },
  template: '<ng-content />',
  styles: `
    .ui-btn {
      display: inline-flex; align-items: center; justify-content: center; gap: 8px;
      min-height: var(--touch); padding: 0 18px; border: 0; border-radius: var(--rf-2);
      font: inherit; font-size: 15px; line-height: 20px; font-weight: 600; text-decoration: none; white-space: nowrap;
      cursor: pointer; transition: background-color 0.15s, transform 0.1s;
    }
    .ui-btn--sm { min-height: var(--touch); padding: 0 14px; font-size: 14px; border-radius: 8px; }
    .ui-btn--block { display: flex; width: 100%; }
    .ui-btn--primary { background: var(--ac); color: var(--onac); }
    .ui-btn--primary:hover { background: var(--ach); }
    .ui-btn--primary:active { background: var(--ach); transform: scale(0.97); box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.25); }
    .ui-btn--secondary { background: var(--sf); color: var(--tx); box-shadow: inset 0 0 0 1px var(--bd2); }
    .ui-btn--secondary:hover { background: var(--s2); }
    .ui-btn--secondary:active { transform: scale(0.97); }
    .ui-btn--ghost { background: transparent; color: var(--ac); padding: 0 14px; }
    .ui-btn--ghost:hover { background: var(--acs); }
    .ui-btn--danger { background: var(--rds); color: var(--rd); }
    .ui-btn--danger:hover { box-shadow: inset 0 0 0 1px var(--rd); }
    .ui-btn--pill { background: var(--orf); color: var(--ink); border-radius: var(--rr-pill); padding: 0 20px; font-weight: 700; }
    .ui-btn--pill:hover { filter: brightness(1.05); }
    .ui-btn--pill:active { transform: scale(0.97); }
    .ui-btn:disabled, .ui-btn[aria-disabled='true'] { background: var(--s2); color: var(--tx3); box-shadow: none; cursor: not-allowed; transform: none; filter: none; }
  `,
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Button {
  readonly variant = input<ButtonVariant>('primary');
  readonly block = input(false, { transform: booleanAttribute });
  readonly small = input(false, { transform: booleanAttribute });
}
