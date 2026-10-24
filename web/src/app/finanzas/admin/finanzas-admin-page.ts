import { Component } from '@angular/core';
import { CardsAdmin } from './cards-admin';
import { ConceptsAdmin } from './concepts-admin';

/** Panel de administración de Finanzas: aquí se dan de alta, desactivan y eliminan las opciones. */
@Component({
  selector: 'app-finanzas-admin-page',
  imports: [CardsAdmin, ConceptsAdmin],
  template: `
    <p class="hint">
      Administra las opciones de Finanzas. <b>Desactivar</b> oculta una opción sin perder su historial;
      <b>eliminar</b> la borra por completo, junto con los registros que dependan de ella.
    </p>
    <app-cards-admin data-section />
    <app-concepts-admin data-section scope="gasto" title="Conceptos de gastos" />
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: 18px; min-width: 0; }
    .hint { margin: 0; font-size: 0.85rem; color: var(--muted); }
  `,
})
export class FinanzasAdminPage {}
