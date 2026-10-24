import { fmtDate, fmtMoney } from './finanzas.calc';

// Historial de Finanzas: convierte los registros de auditoría (copias de cada fila antes y después de un cambio)
// en líneas legibles. Sin Angular ni Supabase, para poder probarlo.

export type AuditTable =
  | 'fin_settings'
  | 'fin_cards'
  | 'fin_concepts'
  | 'fin_people'
  | 'fin_expenses'
  | 'fin_cuts'
  | 'fin_debts'
  | 'fin_family';

export type AuditAction = 'insert' | 'update' | 'delete';

type Row = Record<string, unknown>;

export interface AuditEntry {
  id: number;
  /** Momento en que se registró el cambio (ISO). */
  at: string;
  table: AuditTable;
  action: AuditAction;
  rowId: string;
  old: Row | null;
  new: Row | null;
}

export type HistoryArea = 'movimientos' | 'familia' | 'gastos' | 'catalogos';

export const HISTORY_AREAS: { key: HistoryArea; label: string; tables: AuditTable[]; tone: string }[] = [
  { key: 'movimientos', label: 'Movimientos', tables: ['fin_debts'], tone: 's-violet' },
  { key: 'familia', label: 'Familia', tables: ['fin_family'], tone: 's-sage' },
  { key: 'gastos', label: 'Gastos y cortes', tables: ['fin_expenses', 'fin_cuts'], tone: 's-steel' },
  { key: 'catalogos', label: 'Ajustes', tables: ['fin_cards', 'fin_concepts', 'fin_people', 'fin_settings'], tone: 's-teal' },
];

/** Nombre de una tarjeta, concepto o persona a partir de su id ('' si no hay id). */
export type NameOf = (id: string | null | undefined) => string;

export interface HistoryChange {
  label: string;
  from: string;
  to: string;
}

export interface HistoryLine {
  id: number;
  at: string;
  action: AuditAction;
  /** Qué es el registro: Cargo, Abono, Recibido, Dado, Gasto, Corte, Tarjeta, Concepto, Persona o Ingreso. */
  badge: string;
  kind: 'cargo' | 'abono' | null;
  /** Persona, tarjeta o lista a la que pertenece. */
  who: string;
  what: string;
  amount: number | null;
  /** Fecha propia del movimiento (la que escribiste), ya formateada. */
  when: string;
  changes: HistoryChange[];
}

const SKIP = new Set(['id', 'user_id', 'created_at', 'updated_at']);

const LABELS: Record<string, string> = {
  person_id: 'Persona',
  kind: 'Tipo',
  direction: 'Tipo',
  amount: 'Monto',
  total: 'Monto total',
  paid: 'Pagado',
  date: 'Fecha',
  applies_to: 'Aplica a',
  installment: 'A meses',
  purchased_at: 'Fecha y hora',
  card_id: 'Tarjeta',
  period: 'Periodo',
  period_end: 'Fin del corte',
  section: 'Sección',
  name: 'Nombre',
  cut_day: 'Día de corte',
  active: 'Activo',
  monthly_income: 'Ingreso mensual',
  scope: 'Lista',
};

const MONEY = new Set(['amount', 'total', 'paid', 'monthly_income']);

const TYPE: Record<string, string> = {
  cargo: 'Cargo (préstamo)',
  abono: 'Abono (pago recibido)',
  recibido: 'Recibido',
  dado: 'Dado',
  tarjeta: 'Tarjeta',
  fijos: 'Gastos fijos',
};

const SCOPE: Record<string, string> = { gasto: 'Gastos', movimiento: 'Movimientos', familia: 'Familia', deudor: 'Quien me debe' };

const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v));
const num = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number(v));

/** Fecha y hora legibles, por ejemplo "24 oct 2026, 16:52". */
export function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('es-MX', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const fmtDay = (iso: string): string =>
  new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });

/** Concepto de una fila: su texto libre o, si no, el del catálogo. */
const conceptOf = (row: Row, nameOf: NameOf): string => str(row['concept_text']) || nameOf(str(row['concept_id']) || null);

function show(key: string, value: unknown, nameOf: NameOf): string {
  if (value === null || value === undefined || value === '') return '—';
  if (MONEY.has(key)) return fmtMoney(Number(value));
  if (key === 'date' || key === 'period_end') return fmtDate(String(value));
  if (key === 'purchased_at') return fmtDateTime(String(value));
  if (key === 'person_id' || key === 'card_id') return nameOf(String(value));
  if (key === 'applies_to') return 'un cargo';
  if (key === 'kind' || key === 'direction' || key === 'section') return TYPE[String(value)] ?? String(value);
  if (key === 'scope') return SCOPE[String(value)] ?? String(value);
  if (key === 'active') return value ? 'Sí' : 'No';
  return String(value);
}

function changesOf(e: AuditEntry, nameOf: NameOf): HistoryChange[] {
  if (e.action !== 'update' || !e.old || !e.new) return [];
  const out: HistoryChange[] = [];
  let conceptDone = false;
  for (const key of new Set([...Object.keys(e.old), ...Object.keys(e.new)])) {
    if (SKIP.has(key) || JSON.stringify(e.old[key]) === JSON.stringify(e.new[key])) continue;
    if (key === 'concept_id' || key === 'concept_text') {
      // El concepto puede cambiar de catálogo a texto libre: se cuenta como un solo cambio.
      if (conceptDone) continue;
      conceptDone = true;
      out.push({ label: 'Concepto', from: conceptOf(e.old, nameOf) || '—', to: conceptOf(e.new, nameOf) || '—' });
      continue;
    }
    out.push({ label: LABELS[key] ?? key, from: show(key, e.old[key], nameOf), to: show(key, e.new[key], nameOf) });
  }
  return out;
}

export function describeEntry(e: AuditEntry, nameOf: NameOf): HistoryLine {
  // Al borrar solo queda la copia "antes"; en los demás casos, la de "después".
  const row = (e.new ?? e.old ?? {}) as Row;
  const line: HistoryLine = {
    id: e.id,
    at: e.at,
    action: e.action,
    badge: '',
    kind: null,
    who: '',
    what: '',
    amount: null,
    when: '',
    changes: changesOf(e, nameOf),
  };
  switch (e.table) {
    case 'fin_debts':
      line.kind = row['kind'] === 'abono' ? 'abono' : 'cargo';
      line.badge = line.kind === 'abono' ? 'Abono' : 'Cargo';
      line.who = nameOf(str(row['person_id']) || null);
      line.what = conceptOf(row, nameOf) || 'Sin concepto';
      line.amount = num(row['amount']);
      line.when = row['date'] ? fmtDate(str(row['date'])) : '';
      break;
    case 'fin_family':
      line.badge = row['direction'] === 'dado' ? 'Dado' : 'Recibido';
      line.who = nameOf(str(row['person_id']) || null) || '—';
      line.what = conceptOf(row, nameOf) || 'Sin concepto';
      line.amount = num(row['amount']);
      line.when = row['date'] ? fmtDate(str(row['date'])) : '';
      break;
    case 'fin_expenses':
      line.badge = 'Gasto';
      line.who = row['card_id'] ? nameOf(str(row['card_id'])) : 'Gastos fijos';
      line.what = conceptOf(row, nameOf) || 'Sin concepto';
      line.amount = num(row['amount']);
      line.when = row['purchased_at'] ? fmtDay(str(row['purchased_at'])) : '';
      break;
    case 'fin_cuts':
      line.badge = 'Corte';
      line.who = nameOf(str(row['card_id']) || null);
      line.what = str(row['period']);
      line.amount = num(row['amount']);
      break;
    case 'fin_cards':
      line.badge = 'Tarjeta';
      line.what = str(row['name']);
      break;
    case 'fin_concepts':
      line.badge = 'Concepto';
      line.who = SCOPE[str(row['scope'])] ?? '';
      line.what = str(row['name']);
      break;
    case 'fin_people':
      line.badge = 'Persona';
      line.who = SCOPE[str(row['scope'])] ?? '';
      line.what = str(row['name']);
      break;
    case 'fin_settings':
      line.badge = 'Ingreso';
      line.what = 'Ingreso mensual';
      line.amount = num(row['monthly_income']);
      break;
  }
  return line;
}
