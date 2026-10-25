/**
 * Manda a tu proyecto las alertas de compra del banco que llegan a Gmail, para que se registren como gastos.
 * Se pega en https://script.google.com (proyecto nuevo) con la cuenta de Gmail donde llegan las alertas.
 * Pasos en supabase/functions/registrar-compra/LEEME.md.
 */

// Dirección de la función. Cambia TU-PROYECTO por el id de tu proyecto de Supabase.
const ENDPOINT = 'https://TU-PROYECTO.supabase.co/functions/v1/registrar-compra';

// Alertas de compra de Santander. Para otro banco, agrega otra búsqueda.
const QUERY = 'from:santander@envio.santander.com.mx newer_than:3d';

const REVIEW_LABEL = 'Compras-por-revisar';
const KEEP = 300; // cuántos ids de correos ya enviados se recuerdan

/** Revisa los correos recientes y manda los que todavía no se enviaron. Se ejecuta sola cada 5 minutos. */
function procesar() {
  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty('INGEST_TOKEN');
  if (!token) throw new Error('Falta INGEST_TOKEN en Propiedades de la secuencia de comandos');

  const done = JSON.parse(props.getProperty('hechos') || '[]');
  const seen = new Set(done);
  const since = Date.now() - 3 * 24 * 3600 * 1000;
  let review = null;

  for (const thread of GmailApp.search(QUERY, 0, 30)) {
    // Gmail junta en una conversación las alertas con el mismo asunto: se revisa cada mensaje por separado.
    for (const msg of thread.getMessages()) {
      const id = msg.getId();
      if (seen.has(id) || msg.getDate().getTime() < since) continue;
      const res = UrlFetchApp.fetch(ENDPOINT, {
        method: 'post',
        contentType: 'application/json',
        headers: { 'x-ingest-token': token },
        payload: JSON.stringify({ id: id, text: msg.getPlainBody() }),
        muteHttpExceptions: true,
      });
      const code = res.getResponseCode();
      if (code >= 500 || code === 401 || code === 404) {
        // Falla temporal o de configuración (dirección, token): no se da por atendido, se reintenta luego.
        console.warn(code + ' ' + res.getContentText());
        continue;
      }
      seen.add(id);
      done.push(id);
      if (code !== 200) {
        // No se pudo registrar (por ejemplo, ninguna tarjeta tiene esa terminación): se marca para revisar.
        review = review || GmailApp.getUserLabelByName(REVIEW_LABEL) || GmailApp.createLabel(REVIEW_LABEL);
        thread.addLabel(review);
        console.warn(code + ' ' + res.getContentText());
      }
    }
  }
  props.setProperty('hechos', JSON.stringify(done.slice(-KEEP)));
}

/** Olvida los correos ya enviados: úsala si algo falló y quieres que se vuelvan a mandar (no se duplican). */
function reintentar() {
  PropertiesService.getScriptProperties().deleteProperty('hechos');
}

/** Ejecútala una sola vez: programa la revisión cada 5 minutos. */
function instalar() {
  for (const t of ScriptApp.getProjectTriggers()) ScriptApp.deleteTrigger(t);
  ScriptApp.newTrigger('procesar').timeBased().everyMinutes(5).create();
}
