// Recibe el texto de una alerta de compra del banco (lo manda el script de Gmail) y crea el gasto en la tarjeta.
// Respuestas: 200 = registrada, repetida o ignorada (no era una compra); 401 = token incorrecto;
// 422 = parece una compra pero no se pudo registrar (el script deja el correo marcado para revisar).
import { createClient } from 'npm:@supabase/supabase-js@2';
import { parseSantander } from './parse.ts';

const TOKEN = Deno.env.get('INGEST_TOKEN');
const USER_ID = Deno.env.get('INGEST_USER_ID');
const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

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
