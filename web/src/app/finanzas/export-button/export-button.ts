import { Component, input } from '@angular/core';

/**
 * Botón "Exportar a Excel". No hace nada por sí solo: quien lo usa escucha el clic (`(click)`) y descarga el archivo.
 * Toma el color de la sección en la que está (--sec).
 */
@Component({
  selector: 'app-export-button',
  template: `
    <button type="button" [disabled]="busy()" [attr.aria-label]="label() === 'Excel' ? 'Exportar a Excel' : label()" title="Descargar en Excel (.xlsx)">
      <span aria-hidden="true">⬇</span> {{ busy() ? 'Preparando…' : label() }}
    </button>
  `,
  styles: `
    :host { display: inline-block; }
    button {
      font: inherit; font-weight: 700; font-size: 0.78rem; padding: 5px 10px; white-space: nowrap; cursor: pointer;
      border: 2px solid var(--line); border-radius: 999px; background: var(--bg); color: var(--muted);
    }
    button:hover:not(:disabled) { border-color: var(--sec, var(--accent)); color: var(--ink); }
    button:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }
    button:disabled { opacity: 0.6; cursor: default; }
  `,
})
export class ExportButton {
  /** Texto del botón; el nombre accesible agrega "a Excel". */
  readonly label = input('Excel');
  readonly busy = input(false);
}
