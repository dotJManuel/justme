// Textos de las advertencias al eliminar: siempre dicen qué más se borra y que queda en el Historial.

export const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/** "a", "a y b", "a, b y c". */
function listJoin(items: string[]): string {
  if (items.length < 2) return items.join('');
  return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`;
}

/**
 * Advertencia al eliminar algo de lo que dependen otros registros (tarjeta, persona, concepto, cargo con abonos).
 * `related` son los registros que se borrarán con él; si no hay ninguno, lo dice.
 */
export function deleteMessage(subject: string, related: string[], tip = ''): string {
  const lines = [
    `⚠ ¿Eliminar ${subject} por completo?`,
    related.length
      ? `Se eliminará también todo lo relacionado con esto: ${listJoin(related)}.`
      : 'No tiene nada relacionado: solo se elimina este registro.',
    'Quedará registrado en la pestaña Historial.',
  ];
  if (tip) lines.push(tip);
  return lines.join('\n\n');
}

/** Advertencia al eliminar un registro suelto (un gasto, un movimiento, un recibido). */
export function deleteRowMessage(subject: string): string {
  return `⚠ ¿Eliminar ${subject}?\n\nQuedará registrado en la pestaña Historial.`;
}

/** Advertencia al borrar líneas del historial (no se borra el movimiento real, solo su historial). */
export function deleteHistoryMessage(n: number): string {
  return [
    `⚠ ¿Eliminar ${plural(n, 'registro', 'registros')} del historial por completo?`,
    'Se borran definitivamente de la base de datos y no se pueden recuperar.',
    'Los movimientos, gastos y demás registros reales no se borran: solo su historial. Si ese historial era la prueba de un pago o cobro, ya no podrás consultarla aquí.',
  ].join('\n\n');
}
