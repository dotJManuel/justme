import { dateKey } from '../../habits/streaks';
import { fmtDate, fmtMoney } from '../finanzas.calc';
import { Statement } from '../finanzas.statement';

// Dibuja el estado de cuenta como una "hoja de Excel": cuadrícula, encabezados de color y totales en negritas.
// Es una imagen a propósito (no HTML): lo que se ve es exactamente lo que se comparte por WhatsApp, y siempre en
// colores claros, aunque la app esté en modo oscuro.

const W = 760;
const PAD = 20;
const IW = W - PAD * 2;
const RH = 28;
const SCALE = 2;
/** Límites seguros de un canvas en celulares (lado en píxeles y área total). */
const MAX_SIDE = 16000;
const MAX_AREA = 16_000_000;
const FONT = '"Segoe UI", Calibri, Arial, sans-serif';

const C = {
  paper: '#ffffff',
  accent: '#5a7893',
  accentText: '#e8eef3',
  grid: '#c9d1d9',
  head: '#eaeff3',
  band: '#f8fafb',
  total: '#f1f4f7',
  section: '#dde5ec',
  ink: '#1d2731',
  muted: '#64727f',
  due: '#a85a54',
  dueBg: '#fbe9e7',
  paid: '#2f7a4d',
};

interface Style {
  bg?: string;
  bold?: boolean;
  color?: string;
  align?: 'left' | 'right' | 'center';
  size?: number;
}

/** Recorta el texto con "…" si no cabe en `max` píxeles. */
function fit(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1);
  return `${t}…`;
}

/**
 * Recorre el diseño y devuelve la altura total. Con `ctx` nulo solo mide (así se sabe de qué alto crear la imagen
 * antes de dibujar); con `ctx` dibuja.
 */
function render(ctx: CanvasRenderingContext2D | null, s: Statement): number {
  let y = PAD;

  const font = (o: Style) => `${o.bold ? 'bold ' : ''}${o.size ?? 14}px ${FONT}`;

  const text = (str: string, x: number, cy: number, w: number, o: Style = {}) => {
    if (!ctx) return;
    ctx.font = font(o);
    ctx.fillStyle = o.color ?? C.ink;
    ctx.textBaseline = 'middle';
    const align = o.align ?? 'left';
    ctx.textAlign = align;
    const inner = w - 16;
    const px = align === 'left' ? x + 8 : align === 'right' ? x + w - 8 : x + w / 2;
    ctx.fillText(fit(ctx, str, inner), px, cy);
  };

  /** Una celda de la cuadrícula. */
  const cell = (x: number, top: number, w: number, h: number, str: string, o: Style = {}) => {
    if (!ctx) return;
    ctx.fillStyle = o.bg ?? C.paper;
    ctx.fillRect(x, top, w, h);
    ctx.strokeStyle = C.grid;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, top + 0.5, w - 1, h - 1);
    text(str, x, top + h / 2, w, o);
  };

  /** Una fila de la tabla con sus columnas. */
  const row = (cols: number[], cells: string[], o: (i: number) => Style) => {
    let x = PAD;
    cols.forEach((w, i) => {
      cell(x, y, w, RH, cells[i], o(i));
      x += w;
    });
    y += RH;
  };

  // ── Título
  if (ctx) {
    ctx.fillStyle = C.paper;
    ctx.fillRect(0, 0, W, 100000);
    ctx.fillStyle = C.accent;
    ctx.fillRect(PAD, y, IW, 66);
    text('Estado de cuenta', PAD + 8, y + 26, IW, { size: 20, bold: true, color: '#ffffff' });
    text(`${s.person} · al ${fmtDate(dateKey(s.asOf))}`, PAD + 8, y + 50, IW, { size: 14, color: C.accentText });
  }
  y += 66 + 14;

  // ── Resumen: prestado, pagado y pendiente
  const third = IW / 3;
  const sum3 = [third, third, third];
  row(sum3, ['Prestado', 'Pagado', 'Pendiente'], () => ({ bg: C.head, bold: true, align: 'center', size: 13, color: C.muted }));
  if (ctx) {
    [fmtMoney(s.lent), fmtMoney(s.paid), fmtMoney(s.pending)].forEach((v, i) => {
      cell(PAD + i * third, y, third, 40, v, {
        align: 'center',
        bold: true,
        size: 20,
        bg: i === 2 ? C.dueBg : C.paper,
        color: i === 2 ? C.due : i === 1 ? C.paid : C.ink,
      });
    });
  }
  y += 40 + 18;

  // ── Lo que queda pendiente
  const A = [110, 250, 120, 120, IW - 600];
  const section = (title: string) => {
    if (ctx) {
      cell(PAD, y, IW, 30, title, { bg: C.section, bold: true, size: 15 });
    }
    y += 30;
  };
  const head = (cols: number[], labels: string[], right: number[]) =>
    row(cols, labels, (i) => ({ bg: C.head, bold: true, size: 13, color: C.muted, align: right.includes(i) ? 'right' : 'left' }));

  section('Lo que queda pendiente');
  head(A, ['Fecha', 'Concepto', 'Monto', 'Ya pagó', 'Debe'], [2, 3, 4]);
  if (!s.cargos.length) {
    row([IW], ['No tiene préstamos pendientes.'], () => ({ color: C.muted }));
  }
  s.cargos.forEach((c, i) =>
    row(A, [c.date ? fmtDate(c.date) : 'Sin fecha', c.concept, fmtMoney(c.amount), c.paid ? fmtMoney(c.paid) : '—', fmtMoney(c.balance)], (k) => ({
      bg: i % 2 ? C.band : C.paper,
      align: k >= 2 ? 'right' : 'left',
      bold: k === 4,
      color: k === 4 ? C.due : k === 3 && c.paid ? C.paid : C.ink,
    })),
  );
  if (Math.abs(s.adjust) > 0.004) {
    row([IW - A[4], A[4]], ['Pagos sin asignar a un préstamo (se descuentan)', fmtMoney(s.adjust)], (i) => ({
      bg: C.band,
      align: i ? 'right' : 'left',
      color: C.paid,
    }));
  }
  row([IW - A[4], A[4]], ['Total pendiente', fmtMoney(s.pending)], (i) => ({
    bg: C.total,
    bold: true,
    align: i ? 'right' : 'left',
    color: i ? C.due : C.ink,
  }));
  y += 18;

  // ── Pagos recibidos
  const B = [110, 250, 240, IW - 600];
  section('Pagos recibidos');
  head(B, ['Fecha', 'Concepto', 'Aplicado a', 'Monto'], [3]);
  if (!s.payments.length) {
    row([IW], ['Todavía no hay pagos.'], () => ({ color: C.muted }));
  }
  s.payments.forEach((p, i) =>
    row(B, [p.date ? fmtDate(p.date) : 'Sin fecha', p.concept, p.appliedTo, fmtMoney(p.amount)], (k) => ({
      bg: i % 2 ? C.band : C.paper,
      align: k === 3 ? 'right' : 'left',
      color: k === 3 ? C.paid : k === 2 && p.appliedTo === 'Sin asignar' ? C.muted : C.ink,
    })),
  );
  row([IW - B[3], B[3]], ['Total pagado', fmtMoney(s.paid)], (i) => ({
    bg: C.total,
    bold: true,
    align: i ? 'right' : 'left',
    color: i ? C.paid : C.ink,
  }));
  y += 14;

  // ── Pie
  if (ctx) {
    text(`Generado el ${fmtDate(dateKey(new Date()))} · JustMe`, PAD, y + 8, IW, { size: 11, color: C.muted });
  }
  y += 20;
  return y + PAD;
}

/** Dibuja el estado de cuenta en un canvas (al doble de resolución, para que se lea nítido en el celular). */
export function drawStatement(s: Statement): HTMLCanvasElement {
  const height = render(null, s);
  const canvas = document.createElement('canvas');
  // Con mucha información la imagen es muy alta: se baja la resolución para no pasar el límite del navegador.
  const scale = Math.min(SCALE, MAX_SIDE / height, Math.sqrt(MAX_AREA / (W * height)));
  canvas.width = Math.floor(W * scale);
  canvas.height = Math.floor(height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('El navegador no permite dibujar la imagen');
  ctx.scale(scale, scale);
  render(ctx, s);
  return canvas;
}
