// Función "registrar-compra": recibe el texto de una alerta de compra del banco (lo manda el script de Gmail)
// y crea el gasto en la tarjeta. Todo el código está en este archivo para pegarlo en el editor de Supabase.
import { createClient } from 'npm:@supabase/supabase-js@2';

const TOKEN = Deno.env.get('INGEST_TOKEN');
const USER_ID = Deno.env.get('INGEST_USER_ID');
const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** Lee la alerta de compra de Santander México; null si no es una compra o no se pudo leer completa. */
function parseSantander(raw: string) {
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

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'Usa POST' });
  if (!TOKEN || !USER_ID || req.headers.get('x-ingest-token') !== TOKEN) return json(401, { error: 'No autorizado' });

  let body: { id?: unknown; text?: unknown };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'JSON inválido' });
  }
  const id = typeof body.id === 'string' ? body.id.slice(0, 200) : '';
  const text = typeof body.text === 'string' ? body.text.slice(0, 20_000) : '';
  if (!id || !text) return json(400, { error: 'Faltan id o text' });

  // Otras alertas del banco (pagos, retiros, avisos) no son compras: se ignoran.
  if (!/una compra en el comercio/i.test(text)) return json(200, { status: 'ignorada' });

  const p = parseSantander(text);
  if (!p) return json(422, { error: 'No se pudo leer la compra' });
  if (p.currency !== 'MXN') return json(422, { error: `Compra en ${p.currency}: captúrala a mano` });

  const { data: cards, error: cardError } = await db
    .from('fin_cards')
    .select('id')
    .eq('user_id', USER_ID)
    .eq('last4', p.last4)
    .eq('active', true);
  if (cardError) return json(500, { error: 'No se pudo buscar la tarjeta' });
  if (cards.length !== 1) return json(422, { error: `No hay una tarjeta activa con terminación ${p.last4}` });

  const { error } = await db.from('fin_expenses').insert({
    user_id: USER_ID,
    card_id: cards[0].id,
    section: 'tarjeta',
    concept_text: p.merchant.slice(0, 120),
    installment: '',
    total: p.amount,
    amount: p.amount,
    purchased_at: p.at,
    source_id: id,
  });
  if (error?.code === '23505') return json(200, { status: 'repetida' });
  if (error) return json(500, { error: 'No se pudo guardar el gasto' });
  return json(200, { status: 'registrada' });
});
