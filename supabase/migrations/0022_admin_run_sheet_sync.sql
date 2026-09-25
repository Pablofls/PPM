-- 0022_admin_run_sheet_sync.sql — El botón "Procesar datos" dispara la
-- sincronización a mano, sin esperar el disparador horario
-- Ver docs/SHEETS_SYNC.md y docs/UI_SCREENS.md
--
-- `import_sheet_rows()` (0015) y `create_student_accounts()` (0014, llamada
-- desde ella en 0021) tienen el `EXECUTE` revocado a `authenticated` a
-- propósito: son el motor de una importación masiva y su único contexto
-- pensado era el Apps Script con `service_role`. El profesor pidió que el
-- botón "Procesar datos" del panel —hoy deshabilitado, ver
-- `src/components/PageHeader.tsx`— también lo dispare, para no depender
-- siempre del disparador de cada hora.
--
-- `admin_run_sheet_sync()` es la puerta: `SECURITY DEFINER` para poder llamar
-- a las dos funciones revocadas —corre con los permisos de quien la creó, el
-- mismo contexto administrativo del SQL Editor, sin importar quién la invoque
-- desde el navegador—, pero a diferencia de una tabla con RLS, una función
-- `SECURITY DEFINER` no tiene una política que la proteja sola: por eso
-- empieza comprobando `is_admin()` ella misma, con el mismo mensaje que usa
-- `guard_profile_role()` (`0001`) para el mismo tipo de rechazo.
--
-- Solo reprocesa lo que ya está en el staging (`sheet_rows`): el panel no
-- puede llegar al Google Sheets —esa parte la hace el Apps Script, que es el
-- único con las credenciales de Google—. Sirve para no esperar la hora del
-- disparador una vez que una fila ya llegó al staging, no para jalar una
-- respuesta que el Sheets todavía no mandó.
create or replace function public.admin_run_sheet_sync()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador puede correr la sincronización';
  end if;

  return public.import_sheet_rows();
end;
$$;

revoke execute on function public.admin_run_sheet_sync() from public, anon;
grant execute on function public.admin_run_sheet_sync() to authenticated;
