import { Component } from '@angular/core';
import { CardsAdmin } from './cards-admin';
import { ConceptsAdmin } from './concepts-admin';
import { PeopleAdmin } from './people-admin';

/** Panel de administración de Finanzas: aquí se dan de alta, desactivan y eliminan las opciones. */
@Component({
  selector: 'app-finanzas-admin-page',
  imports: [CardsAdmin, ConceptsAdmin, PeopleAdmin],
  template: `
    <p class="hint">
      Administra las opciones de Finanzas. <b>Desactivar</b> oculta una opción sin perder su historial;
      <b>eliminar</b> la borra por completo, junto con los registros que dependan de ella.
    </p>
    <app-cards-admin data-section />
    <app-concepts-admin
      data-section
      scope="gasto"
      title="Conceptos de gastos"
      help="Son las opciones del campo Concepto al capturar un gasto. Desactivar un concepto deja de ofrecerlo en gastos nuevos, pero los que ya lo usan se conservan. Eliminarlo lo borra por completo."
    />
    <app-people-admin
      data-section
      scope="deudor"
      title="Personas (dinero que me deben)"
      help="Son las opciones del campo Persona en Pendiente. Una persona desactivada no se ofrece en movimientos nuevos, pero sus movimientos se conservan y lo que te debe sigue contando en el resumen. Eliminarla borra a la persona y todos sus movimientos."
    />
    <app-concepts-admin
      data-section
      scope="movimiento"
      title="Conceptos de movimientos"
      help="Son las opciones del campo Concepto al capturar un cargo o abono en Pendiente. Desactivar un concepto deja de ofrecerlo en movimientos nuevos, pero los que ya lo usan se conservan. Eliminarlo borra también los movimientos que lo usan."
    />
    <app-people-admin
      data-section
      scope="familia"
      title="Personas (familia)"
      help="Son las opciones de De quién (Recibido) y Para quién (Dado). Una persona desactivada no se ofrece en registros nuevos, pero sus registros se conservan. Eliminarla borra a la persona y todos sus registros de Recibido y Dado."
    />
    <app-concepts-admin
      data-section
      scope="familia"
      title="Conceptos de familia"
      help="Son las opciones del campo Concepto en Recibido y Dado. Desactivar un concepto deja de ofrecerlo en registros nuevos, pero los que ya lo usan se conservan. Eliminarlo borra también los registros que lo usan."
    />
    <p class="hint">El tipo de movimiento (cargo o abono) es fijo: de él dependen las cuentas.</p>
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: 18px; min-width: 0; }
    .hint { margin: 0; font-size: 0.85rem; color: var(--muted); }
  `,
})
export class FinanzasAdminPage {}
