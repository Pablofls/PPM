-- 0030_weekly_log_monterrey_today.sql — "Hoy" de las bitácoras semanales es la
-- fecha de Monterrey, no la de UTC
-- Ver docs/DATABASE_SCHEMA.md#bitácoras-semanales
--
-- Bug: 0020 comparaba la semana con `current_date`, y en Supabase `current_date`
-- sigue la zona de la sesión (UTC). Monterrey va 5–6 h atrás de UTC, así que a
-- partir de las ~7–8 pm del último día de la semana ya era "mañana" para la
-- base y el alumno recibía «Solo puedes entregar la semana en curso.» con la
-- semana todavía abierta. Para el alumno la semana termina a las 23:59:59 hora
-- de Monterrey (igual que `due_at` en 0027).

create or replace function public.today_monterrey()
returns date
language sql
stable
set search_path = public
as $$
  select (now() at time zone 'America/Monterrey')::date
$$;

comment on function public.today_monterrey() is
  'Fecha de hoy en America/Monterrey. Usar en vez de current_date para todo lo que compare contra semester_weeks / submissions.week_start|week_end.';

grant execute on function public.today_monterrey() to authenticated;

-- ---------------------------------------------------------------------------
-- new_weekly_submission(): misma función de 0020, con today_monterrey()
-- ---------------------------------------------------------------------------
create or replace function public.new_weekly_submission(
  p_form_code   text,
  p_week_number smallint
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_student uuid := public.current_student_id();
  v_period  text := public.current_student_period();
  v_week    record;
  v_id      uuid;
begin
  if v_student is null then
    raise exception 'Tu cuenta no está asociada a ningún alumno.';
  end if;

  if p_week_number is null then
    raise exception 'Indica qué semana estás reportando.';
  end if;

  if v_period is null then
    raise exception 'Tu cuenta no tiene un periodo asignado. Contacta a tu profesor.';
  end if;

  select week_start, week_end into v_week
  from semester_weeks
  where period_code = v_period
    and week_number = p_week_number;

  if not found then
    raise exception 'Esa semana no está configurada para tu periodo. Contacta a tu profesor.';
  end if;

  if public.today_monterrey() < v_week.week_start
     or public.today_monterrey() > v_week.week_end then
    raise exception 'Solo puedes entregar la semana en curso.';
  end if;

  insert into submissions (student_id, form_code, submitted_at, language, week_start, week_end)
  values (v_student, p_form_code, now(), null, v_week.week_start, v_week.week_end)
  returning id into v_id;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Políticas de corrección (0020): mismo cuerpo, today_monterrey()
-- ---------------------------------------------------------------------------
drop policy job_search_logs_update_own_current_week on job_search_logs;
drop policy internship_logs_update_own_current_week on internship_logs;

create policy job_search_logs_update_own_current_week on job_search_logs
  for update to authenticated
  using (
    exists (
      select 1 from submissions sub
      where sub.id = job_search_logs.submission_id
        and sub.student_id = public.current_student_id()
        and sub.form_code = 'form_busqueda'
        and public.today_monterrey() between sub.week_start and sub.week_end
    )
  )
  with check (
    exists (
      select 1 from submissions sub
      where sub.id = job_search_logs.submission_id
        and sub.student_id = public.current_student_id()
        and sub.form_code = 'form_busqueda'
        and public.today_monterrey() between sub.week_start and sub.week_end
    )
  );

create policy internship_logs_update_own_current_week on internship_logs
  for update to authenticated
  using (
    exists (
      select 1 from submissions sub
      where sub.id = internship_logs.submission_id
        and sub.student_id = public.current_student_id()
        and sub.form_code = 'form_practicas'
        and public.today_monterrey() between sub.week_start and sub.week_end
    )
  )
  with check (
    exists (
      select 1 from submissions sub
      where sub.id = internship_logs.submission_id
        and sub.student_id = public.current_student_id()
        and sub.form_code = 'form_practicas'
        and public.today_monterrey() between sub.week_start and sub.week_end
    )
  );
