import { MN } from '../habits/habits.config';
import { dateKey, parseKey } from '../habits/streaks';
import { CutPeriod, ageDays } from './finanzas.calc';
import { Expense } from './finanzas.models';

// Cálculos de presentación de las pantallas de Finanzas (sin Angular).

/** "05/09" → pago 5 de 9; null si el texto no tiene esa forma. */
export function parseInstallment(text: string): { k: number; n: number } | null {
  const m = /^\s*(\d{1,3})\s*\/\s*(\d{1,3})\s*$/.exec(text);
  if (!m) return null;
  const k = Number(m[1]);
  const n = Number(m[2]);
  return n > 0 && k >= 0 && k <= n ? { k, n } : null;
}

/** Compras a meses con forma de "pago K de N"; el resto de las compras de tarjeta son de contado. */
export const isMsi = (e: Expense): boolean => e.section === 'tarjeta' && parseInstallment(e.installment) !== null;

/** "Ismael Pérez" → "IP"; "YO" → "YO"; "mm" → "MM". */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  return (words.length === 1 ? words[0].slice(0, 2) : words[0][0] + words[1][0]).toUpperCase();
}

/** Días que faltan para el corte (0 = hoy). */
export const daysUntil = (endKey: string, today: Date): number => 0 - ageDays(endKey, today) || 0;

export function cutText(days: number): string {
  return days <= 0 ? 'Corte hoy' : days === 1 ? 'Corte mañana' : `Corte en ${days} días`;
}

/** "2026-11-12" → "12 nov". */
export function shortDate(key: string): string {
  const d = parseKey(key);
  return `${d.getDate()} ${MN[d.getMonth()]}`;
}

/** Qué tanto del periodo de corte ya pasó, de 0 a 100. */
export function cutProgress(period: CutPeriod, today: Date): number {
  const start = parseKey(period.start).getTime();
  const end = parseKey(period.end).getTime();
  const now = parseKey(dateKey(today)).getTime();
  if (end <= start) return 100;
  return Math.max(0, Math.min(100, Math.round(((now - start) / (end - start)) * 100)));
}

/** Parte de `amount` en el total, en porcentaje entero (0 si no hay total). */
export const percent = (amount: number, total: number): number => (total > 0 ? Math.round((amount / total) * 100) : 0);

/** Opacidad del acento para el tramo `i` de la barra apilada (cada tramo, más tenue que el anterior). */
export const stackOpacity = (i: number): number => [1, 0.55, 0.28, 0.14][Math.min(i, 3)];
