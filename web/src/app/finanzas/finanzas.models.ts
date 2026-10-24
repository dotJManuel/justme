/** Opción de un catálogo (select) dada de alta en el panel de administración. */
export interface Concept {
  id: string;
  /** Para qué lista sirve: los gastos o los movimientos de dinero que me deben. */
  scope: 'gasto' | 'movimiento';
  name: string;
  /** Desactivado: ya no se ofrece al capturar, pero conserva sus registros. */
  active: boolean;
}

/** Persona dada de alta en el panel de administración. */
export interface Person {
  id: string;
  /** Para qué lista sirve: hoy solo quien me debe. */
  scope: 'deudor';
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
  conceptId: string;
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
  /** Opcional: un movimiento puede no tener concepto. */
  conceptId: string | null;
  amount: number;
  /** AAAA-MM-DD */
  date: string | null;
  /** Solo abonos: id del cargo al que se aplica. */
  appliesTo: string | null;
}

export interface FamilyMove {
  id: string;
  direction: 'recibido' | 'dado';
  /** Concepto (recibido) o para quién (dado). */
  name: string;
  /** De quién se recibió el dinero; solo en "recibido" (vacío si no se indicó). */
  person: string;
  date: string | null;
  amount: number;
}
