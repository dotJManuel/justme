/** Opción de un catálogo (select) dada de alta en el panel de administración. */
export interface Concept {
  id: string;
  /** Para qué lista sirve: los gastos, los movimientos de dinero que me deben o el dinero con familia. */
  scope: 'gasto' | 'movimiento' | 'familia';
  name: string;
  /** Desactivado: ya no se ofrece al capturar, pero conserva sus registros. */
  active: boolean;
}

/** Persona dada de alta en el panel de administración. */
export interface Person {
  id: string;
  /** Para qué lista sirve: quien me debe o la familia (de quién recibo y para quién doy). */
  scope: 'deudor' | 'familia';
  name: string;
  /** Desactivada: ya no se ofrece al capturar, pero conserva sus movimientos. */
  active: boolean;
}

/** Gasto de una tarjeta de crédito o gasto fijo mensual. */
export type Section = 'tarjeta' | 'fijos';

/** Tarjeta de crédito dada de alta en el panel de administración. */
export interface CreditCard {
  id: string;
  name: string;
  /** Día del mes en que corta (1 a 31; en meses más cortos, el último día). */
  cutDay: number;
  /** Desactivada: se oculta y no suma en el resumen, pero conserva su historial. */
  active: boolean;
}

/** Una fila de tarjeta (compra) o de gastos fijos. */
export interface Expense {
  id: string;
  section: Section;
  /** Tarjeta del gasto; null en gastos fijos. */
  cardId: string | null;
  /** Concepto del catálogo o texto libre: siempre uno de los dos. */
  conceptId: string | null;
  conceptText: string;
  /** "A meses", por ejemplo "05/09". Vacío si es un pago único. */
  installment: string;
  /** Monto total de la compra; null en gastos fijos. */
  total: number | null;
  /** Lo que toca pagar este mes (en gastos fijos, el monto mensual). */
  amount: number;
  /** Fecha y hora de la compra (ISO); solo en tarjetas. */
  purchasedAt: string | null;
}

export interface Cut {
  id: string;
  cardId: string;
  /** Texto del corte, por ejemplo "13 oct a 12 nov". */
  period: string;
  /** AAAA-MM-DD del día de corte; null en los cortes importados del Excel. */
  periodEnd: string | null;
  amount: number;
  paid: number;
}

/** Cargo = dinero que presté; abono = dinero que me pagaron. */
export interface Debt {
  id: string;
  personId: string;
  kind: 'cargo' | 'abono';
  /** Opcional: un movimiento puede no tener concepto (catálogo o texto libre, no los dos). */
  conceptId: string | null;
  conceptText: string;
  amount: number;
  /** AAAA-MM-DD */
  date: string | null;
  /** Solo abonos: id del cargo al que se aplica. */
  appliesTo: string | null;
  /** Abonos de un mismo pago repartido entre varios cargos comparten este id. */
  paymentId?: string | null;
  /** Cargo ya pagado: está en el historial de pagados, junto con sus abonos. */
  archived?: boolean;
}

export interface FamilyMove {
  id: string;
  direction: 'recibido' | 'dado';
  /** Obligatorio en "recibido" (catálogo o texto libre); opcional en "dado". */
  conceptId: string | null;
  conceptText: string;
  /** De quién se recibió (opcional) o para quién se dio (obligatorio en "dado"). */
  personId: string | null;
  date: string | null;
  amount: number;
}
