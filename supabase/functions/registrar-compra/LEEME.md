# Compras automáticas desde el correo del banco

Cada alerta de compra de Santander que llega a Gmail se convierte en un gasto de la tarjeta correspondiente.

```
Gmail  →  script de Google (cada 5 min)  →  función de Supabase  →  tabla fin_expenses
```

La función lee el comercio, el monto, la fecha y hora y los últimos 4 dígitos de la tarjeta. El gasto queda con ese
comercio como concepto y en un solo pago. Si el mismo correo llega dos veces, no se duplica.

## Qué hace falta

1. **Correr el SQL** `supabase/16_compras_automaticas.sql` en Supabase > SQL Editor.
2. **Capturar la terminación de cada tarjeta** en la app: Finanzas > Administrar > Tarjetas de crédito, columna
   "Terminación" (los 4 últimos dígitos; en tu alerta aparece como `terminación **0149`).
3. **Inventar un token** (una clave larga al azar, por ejemplo 40 letras y números). Sirve para que solo tu script pueda
   registrar gastos.
4. **Averiguar tu id de usuario**: en Supabase > Authentication > Users, columna *UID* de tu cuenta.
5. **Publicar la función.** Con la CLI de Supabase, desde la carpeta `justme`:

   ```bash
   supabase secrets set INGEST_TOKEN=tu-token INGEST_USER_ID=tu-uid
   supabase functions deploy registrar-compra --no-verify-jwt
   ```

   (`--no-verify-jwt` porque quien la llama es tu script, no la app con sesión; la protege el token.)
6. **Crear el script de Gmail**: en <https://script.google.com> crea un proyecto nuevo, pega `supabase/gmail/compras.gs`
   y cambia `TU-PROYECTO` por el id de tu proyecto de Supabase (lo ves en su dirección, `https://ID.supabase.co`).
   Después, en *Configuración del proyecto > Propiedades de la secuencia de comandos*, agrega `INGEST_TOKEN` con el
   mismo token. Ejecuta una vez la función `instalar` (te pide permisos de Gmail y de conexión externa) y listo:
   revisa cada 5 minutos. Para probar ya, ejecuta `procesar`.

## Si algo no se registra

- Una compra que no se pudo registrar (por ejemplo, ninguna tarjeta activa tiene esa terminación, o fue en dólares)
  deja el correo con la etiqueta **Compras-por-revisar** en Gmail. Corrige la causa y captúrala a mano en Gastos.
- Las alertas que no son compras (pagos, avisos) se ignoran.
- Los correos de más de 3 días no se procesan.

## Pendiente

- Solo se leen las alertas de compra de Santander. BBVA necesita su propio lector cuando tengas un correo de ejemplo.
- Las compras a meses, cancelaciones y reembolsos no se manejan todavía.
- Si capturas a mano una compra que también llega por correo, quedará duplicada: bórrala o deja de capturarla.
