-- 0048_admin_usage_stats.sql — Cuánto del plan gratuito de Supabase se usa
-- Ver docs/DATABASE_SCHEMA.md#uso-del-plan-de-supabase
--
-- Configuración → Uso de Supabase (solo admin) compara lo que ocupa el
-- proyecto contra los límites del plan Free, para saber con tiempo cuándo
-- habrá que pagar.
--
-- Lo que se puede medir desde la base:
--   * tamaño de la BD           pg_database_size()            (límite 500 MB)
--   * tamaño de Storage         storage.objects.metadata.size (límite 1 GB)
--   * usuarios activos (MAU)    auth.users.last_sign_in_at    (límite 50 000)
--   * conexiones abiertas       pg_stat_activity / max_connections
--   * las tablas más pesadas y el ritmo de entregas de los últimos 30 días,
--     para proyectar cuándo se llenaría la BD
--
-- Lo que NO se ve desde aquí: egress, peticiones a la API e invocaciones de
-- Edge Functions. Solo los da la Management API, que exige un token personal
-- con acceso a toda la cuenta; la pantalla manda al panel de Supabase.
--
-- No crea tablas ni columnas: es una función de solo lectura. Nada que
-- normalizar. SECURITY DEFINER porque lee auth.users, storage.objects y las
-- estadísticas del servidor; la primera línea rechaza a quien no sea admin.

create or replace function public.admin_usage_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador puede ver el uso de Supabase.'
      using errcode = '42501';
  end if;

  select jsonb_build_object(
    'generated_at', now(),
    'database_bytes', pg_database_size(current_database()),
    'public_bytes', (
      select coalesce(sum(pg_total_relation_size(c.oid)), 0)
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'm')
    ),
    'storage_bytes', (
      select coalesce(sum((o.metadata ->> 'size')::bigint), 0)
      from storage.objects o
    ),
    'storage_objects', (select count(*) from storage.objects),
    'auth_users', (select count(*) from auth.users),
    'monthly_active_users', (
      select count(*) from auth.users u
      where u.last_sign_in_at >= now() - interval '30 days'
    ),
    'connections', (
      select count(*) from pg_catalog.pg_stat_activity
      where datname = current_database()
    ),
    'max_connections', current_setting('max_connections')::int,
    'submissions', (select count(*) from public.submissions),
    'submissions_last_30_days', (
      select count(*) from public.submissions s
      where s.created_at >= now() - interval '30 days'
    ),
    'tables', (
      select coalesce(jsonb_agg(t order by t.bytes desc), '[]'::jsonb)
      from (
        select c.relname as name,
               pg_total_relation_size(c.oid) as bytes,
               coalesce(st.n_live_tup, 0) as row_count
        from pg_catalog.pg_class c
        join pg_catalog.pg_namespace n on n.oid = c.relnamespace
        left join pg_catalog.pg_stat_user_tables st on st.relid = c.oid
        where n.nspname = 'public' and c.relkind = 'r'
        order by pg_total_relation_size(c.oid) desc
        limit 10
      ) t
    )
  ) into result;

  return result;
end;
$$;

revoke execute on function public.admin_usage_stats() from public, anon;
grant execute on function public.admin_usage_stats() to authenticated;
