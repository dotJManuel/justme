-- Permite borrar registros del historial desde la app (pestaña Historial: seleccionar uno o varios y eliminar).
-- Ejecutar una vez en Supabase > SQL Editor, después de 13_historial.sql.
--
-- Qué cambia: hasta ahora el historial era solo de lectura. Con esta política, cada usuario puede borrar SUS
-- propios registros del historial (nunca los de otro). Borrar del historial elimina solo esa línea de la
-- tabla fin_audit, por completo y sin forma de recuperarla: NO borra el movimiento, gasto o registro real.
-- Insertar o editar líneas del historial sigue sin ser posible desde la app: solo las crea la base de datos.

create policy "borrar mi historial" on public.fin_audit
  for delete to authenticated
  using ((select auth.uid()) = user_id);

grant delete on public.fin_audit to authenticated;
