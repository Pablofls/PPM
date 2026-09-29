-- 0029_weekly_log_manual_week_override.sql — El profesor puede corregir el
-- número de semana a mano
-- Ver docs/DATABASE_SCHEMA.md#semanas-del-semestre
--
-- `best_matching_week_number()` (`0028`) es mejor esfuerzo, no perfecto: sigue
-- sin poder clasificar una entrega cuyo rango viene corrupto de origen —el
-- propio comentario de `0011_weekly_logs.sql` ya advertía que 6 de 183
-- entregas reales traen el rango invertido y 12 más duran entre 12 y 365
-- días, "errores de captura del alumno" que a propósito no se validan al
-- importar—. Esas simplemente no calzan con ninguna semana configurada y se
-- quedan sin número, mostrando solo la fecha cruda tal como se enviaron. El
-- profesor las reconoce a simple vista y sabe a qué semana pertenecen; esta
-- migración le da dónde ponerlo.
--
-- También cubre el caso contrario: una entrega que sí calzó con una semana,
-- pero con la equivocada (el mejor traslape no siempre es el correcto si dos
-- rangos corridos se pisan). El profesor corrige el número, no solo lo pone
-- donde faltaba.

-- ---------------------------------------------------------------------------
-- week_number_override — gana sobre lo que resuelve best_matching_week_number()
-- ---------------------------------------------------------------------------
-- Nula por default: la mayoría de las entregas nunca necesita una corrección
-- manual. Vive en la tabla de respuesta (no en `submissions`) porque es una
-- decisión sobre CÓMO se lee esta bitácora en particular, no un dato de la
-- entrega en sí — el mismo criterio de `updated_at` en `0026`.
alter table job_search_logs
  add column week_number_override smallint
    constraint job_search_logs_semana_valida check (week_number_override between 1 and 53);

alter table internship_logs
  add column week_number_override smallint
    constraint internship_logs_semana_valida check (week_number_override between 1 and 53);

-- ---------------------------------------------------------------------------
-- resolved_week_number() — el número que se muestra, no solo el calculado
-- ---------------------------------------------------------------------------
create or replace function public.resolved_week_number(
  p_period_code text,
  p_week_start  date,
  p_week_end    date,
  p_override    smallint
)
returns smallint
language sql
stable
as $$
  select coalesce(p_override, public.best_matching_week_number(p_period_code, p_week_start, p_week_end))
$$;

comment on function public.resolved_week_number(text, date, date, smallint) is
  'El número de semana que se le muestra al profesor: la corrección manual si existe, si no el mejor traslape contra semester_weeks.';

-- ---------------------------------------------------------------------------
-- admin_set_weekly_log_week_number() — la puerta para corregir
-- ---------------------------------------------------------------------------
-- No hay política de UPDATE directa sobre job_search_logs/internship_logs
-- para el admin —la única que existe es la del alumno, acotada a su propia
-- semana en curso (`0020`)—: esta función es la única forma de tocar
-- `week_number_override`, y por eso valida `is_admin()` ella misma en vez de
-- apoyarse en RLS, mismo patrón que `admin_run_sheet_sync()` (`0022`).
create or replace function public.admin_set_weekly_log_week_number(
  p_submission_id uuid,
  p_week_number   smallint
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_form_code text;
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador puede clasificar una semana.';
  end if;

  if p_week_number is not null and (p_week_number < 1 or p_week_number > 53) then
    raise exception 'El número de semana tiene que estar entre 1 y 53.';
  end if;

  select form_code into v_form_code from submissions where id = p_submission_id;

  if v_form_code = 'form_busqueda' then
    update job_search_logs set week_number_override = p_week_number where submission_id = p_submission_id;
  elsif v_form_code = 'form_practicas' then
    update internship_logs set week_number_override = p_week_number where submission_id = p_submission_id;
  else
    raise exception 'Esa entrega no es una bitácora semanal.';
  end if;

  if not found then
    raise exception 'No se encontró esa entrega.';
  end if;
end;
$$;

revoke execute on function public.admin_set_weekly_log_week_number(uuid, smallint) from public, anon;
grant execute on function public.admin_set_weekly_log_week_number(uuid, smallint) to authenticated;

-- ---------------------------------------------------------------------------
-- Las tres vistas pasan a resolver el número con resolved_week_number()
-- ---------------------------------------------------------------------------
create or replace view v_student_job_search_logs as
select
  sub.student_id,
  sub.id as submission_id,
  sub.submitted_at,
  sub.language,
  sub.week_start,
  sub.week_end,
  jsl.activities,
  jsl.applications,
  jsl.interviews,
  jsl.learnings,
  jsl.next_steps,
  jsl.updated_at,
  public.resolved_week_number(dir.period_code, sub.week_start, sub.week_end, jsl.week_number_override) as week_number
from submissions sub
join job_search_logs jsl on jsl.submission_id = sub.id
left join v_students_directory dir on dir.student_id = sub.student_id;

create or replace view v_student_internship_logs as
select
  sub.student_id,
  sub.id as submission_id,
  sub.submitted_at,
  sub.language,
  sub.week_start,
  sub.week_end,
  il.activities,
  il.hours_worked,
  il.skills_practiced,
  il.proposal,
  sum(coalesce(il.hours_worked, 0)) over (
    partition by sub.student_id
    order by sub.week_start nulls first, sub.submitted_at
    rows between unbounded preceding and current row
  ) as cumulative_hours,
  sum(coalesce(il.hours_worked, 0)) over (partition by sub.student_id) as total_hours,
  il.updated_at,
  public.resolved_week_number(dir.period_code, sub.week_start, sub.week_end, il.week_number_override) as week_number
from submissions sub
join internship_logs il on il.submission_id = sub.id
left join v_students_directory dir on dir.student_id = sub.student_id;

alter view v_student_job_search_logs    set (security_invoker = on);
alter view v_student_internship_logs    set (security_invoker = on);

create or replace view v_weekly_submission_status as
select
  dir.student_id,
  sw.week_number,
  sw.week_start,
  sw.week_end,
  wl.submitted_at,
  (sw.week_end + time '23:59:59') at time zone 'America/Monterrey' as due_at,
  public.submission_status(
    (sw.week_end + time '23:59:59') at time zone 'America/Monterrey',
    wl.submitted_at
  ) as state
from v_students_directory dir
join semester_weeks sw on sw.period_code = dir.period_code
left join lateral (
  select min(sub.submitted_at) as submitted_at
  from submissions sub
  left join job_search_logs jsl on jsl.submission_id = sub.id
  left join internship_logs il  on il.submission_id  = sub.id
  where sub.student_id = dir.student_id
    and sub.form_code in ('form_busqueda', 'form_practicas')
    and public.resolved_week_number(
          dir.period_code, sub.week_start, sub.week_end,
          coalesce(jsl.week_number_override, il.week_number_override)
        ) = sw.week_number
) wl on true;

alter view v_weekly_submission_status set (security_invoker = on);
