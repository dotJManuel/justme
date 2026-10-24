export type Section = 'santander' | 'bbva' | 'fijos';
export type Card = 'santander' | 'bbva';

/** Una fila de tarjeta (compra) o de gastos fijos. */
export interface Expense {
  id: string;
  section: Section;
  concept: string;
  /** "A meses", por ejemplo "05/09". Vacío si es un pago único. */
  installment: string;
  /** Monto total de la compra; null en gastos fijos. */
  total: number | null;
  /** Lo que toca pagar este mes (en gastos fijos, el monto mensual). */
  amount: number;
}

export interface Cut {
  id: string;
  card: Card;
  period: string;
  amount: number;
  paid: number;
}

/** Cargo = dinero que presté; abono = dinero que me pagaron. */
export interface Debt {
  id: string;
  person: string;
  kind: 'cargo' | 'abono';
  concept: string;
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
  date: string | null;
  amount: number;
}
