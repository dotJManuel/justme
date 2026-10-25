/** Una compra leída de una alerta del banco. */
export interface Purchase {
  merchant: string;
  /** Últimos 4 dígitos de la tarjeta. */
  last4: string;
  amount: number;
  currency: string;
  /** Momento de la compra, en ISO (UTC). */
  at: string;
}

/**
 * Lee la alerta de compra de Santander México:
 *
 *   Te informamos que se ha realizado una compra en el comercio MERPAGO*TELCEL con tu tarjeta de TDC
 *   terminación **0149, por un monto de $25.00 MXN. El 24/10/2026 a las 10:13:16 hrs.
 *
 * Devuelve null si el texto no es una compra o no se pudo leer completo.
 */
export function parseSantander(raw: string): Purchase | null {
  const t = raw.replace(/\s+/g, ' ');
  const merchant = /en el comercio (.+?) con tu tarjeta/i.exec(t)?.[1]?.trim();
  const last4 = /terminaci[oó]n \**(\d{4})/i.exec(t)?.[1];
  const money = /monto de \$ ?([\d,]+(?:\.\d{1,2})?) ?([A-Z]{3})?/i.exec(t);
  const when = /El (\d{2})\/(\d{2})\/(\d{4}) a las (\d{2}):(\d{2}):(\d{2})/i.exec(t);
  if (!merchant || !last4 || !money || !when) return null;

  const amount = Number(money[1].replace(/,/g, ''));
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const [, dd, mm, yyyy, hh, mi, ss] = when;
  // Hora del centro de México (UTC-6, sin horario de verano desde 2022).
  const at = new Date(`${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}-06:00`);
  if (Number.isNaN(at.getTime())) return null;

  return { merchant, last4, amount, currency: (money[2] ?? 'MXN').toUpperCase(), at: at.toISOString() };
}
