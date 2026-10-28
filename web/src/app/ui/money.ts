const fmt = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** "$1,000.00". Con `signed`, siempre lleva signo: "+$1,000.00" o "−$249.00" (menos real, no guion). */
export function money(n: number, signed = false): string {
  const abs = fmt.format(Math.abs(n));
  const sign = !signed || n === 0 ? (n < 0 ? '−' : '') : n < 0 ? '−' : '+';
  return `${sign}$${abs}`;
}

/** Color semántico de un monto: solo ingresos (verde) y gastos (rojo); lo demás, neutro. */
export type MoneyTone = 'income' | 'expense' | 'neutral';
