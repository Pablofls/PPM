-- 0018_semester_weeks.sql — El admin define las semanas, el alumno elige un número
-- Ver docs/DATABASE_SCHEMA.md#semanas-del-semestre y docs/AUTH.md
--
-- Hasta aquí el alumno tecleaba a mano el inicio y el final de la semana que
-- reportaba en la bitácora. Era la causa más común de captura mal hecha en el
-- Sheets original (semanas invertidas o de más de un mes, ver
-- docs/DATA_MAPPING.md#bitácoras-semanales). Esta migración le da al profesor
-- una pantalla para definir, una vez por periodo, las semanas del semestre —
-- la semana 1 y cuántas hay, el resto sale de sumar 7 días — y el alumno pasa
-- a elegir un número de semana en vez de escribir fechas.
--
-- `submissions.week_start`/`week_end` se siguen llenando igual que hoy: nada
-- cambia para el profesor ni para las vistas del expediente.

-- ---------------------------------------------------------------------------
-- semester_weeks — las semanas de un periodo, normalizadas
-- ---------------------------------------------------------------------------
-- Llave natural (period_code, week_number): un periodo nuevo (PR-27 después de
-- OT-26) registra sus semanas sin tocar las de los anteriores. Cuántas semanas
-- tiene un periodo es `count(*)`, no una columna: no hay nada que se pueda
-- derivar que se guarde aparte.
create table semester_weeks (
  period_code text     not null,
  week_number smallint not null,
  week_start  date     not null,
  week_end    date     not null,
  created_at  timestamptz not null default now(),

  primary key (period_code, week_number),

  -- Siempre lunes a domingo. La semana 1 tiene que empezar en lunes; el resto
  -- lo hereda por construcción (se generan sumando múltiplos de 7 días), pero
  -- el CHECK las protege igual si algún día se insertan a mano.
  constraint semester_weeks_semana_valida check (week_end = week_start + 6),
  constraint semester_weeks_numero_valido check (week_number between 1 and 53),
  constraint semester_weeks_empieza_lunes check (extract(isodow from week_start) = 1)
);

alter table semester_weeks enable row level security;

-- ---------------------------------------------------------------------------
-- current_student_period()
-- ---------------------------------------------------------------------------
-- El periodo del alumno de la sesión, o NULL si quien pregunta no es un
-- alumno activo. Mismo patrón que current_student_id() (0014): SECURITY
-- DEFINER porque consulta v_students_directory, que es is_admin()-only, y sin
-- esto la política de abajo no podría leerla.
--
-- Se define antes que las políticas de semester_weeks a propósito: una
-- política se valida al crearse, y `semester_weeks_select_own` la usa. Al
-- revés, `create policy` falla con "function ... does not exist".
create or replace function public.current_student_period()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select dir.period_code
  from public.v_students_directory dir
  where dir.student_id = public.current_student_id();
$$;

revoke execute on function public.current_student_period() from public, anon;
grant execute on function public.current_student_period() to authenticated;

-- Segunda tabla (después de form_deadlines, 0017) donde el admin escribe
-- directo desde el navegador: sin función, porque no hay dos tablas que
-- mantener juntas ni una identidad que proteger. Sin política de UPDATE:
-- corregir una fecha de inicio mal puesta es borrar las semanas de ese
-- periodo y generarlas de nuevo, no editar una a la mitad de la serie.
create policy semester_weeks_select_admin on semester_weeks
  for select to authenticated using (public.is_admin());

create policy semester_weeks_insert_admin on semester_weeks
  for insert to authenticated with check (public.is_admin());

create policy semester_weeks_delete_admin on semester_weeks
  for delete to authenticated using (public.is_admin());

-- El alumno necesita ver las semanas de su propio periodo para elegir cuál
-- reporta. `semester_weeks` no tiene datos personales —es nada más un
-- calendario—, pero la condición sigue siendo "lo mío", nunca `authenticated`
-- a secas (regla «Toda pantalla nace protegida»).
create policy semester_weeks_select_own on semester_weeks
  for select to authenticated using (period_code = public.current_student_period());

grant select, insert, delete on semester_weeks to authenticated;

-- ---------------------------------------------------------------------------
-- Las funciones de entrega cambian de firma
-- ---------------------------------------------------------------------------
-- Un archivo ya ejecutado no se edita: 0016 sigue tal cual. Pero
-- `create or replace` con una firma distinta crea un *overload* nuevo y deja
-- el viejo colgado (ejecutable, con parámetros que ya no tienen sentido), así
-- que primero se borran las tres firmas viejas.
drop function if exists public.new_weekly_submission(text, date, date);
drop function if exists public.submit_job_search_log(date, date, text, text, text, text, text);
drop function if exists public.submit_internship_log(date, date, text, numeric, text, text);

-- Lo que las dos comparten: crear la entrega, ahora resolviendo la semana
-- contra semester_weeks en vez de recibir las fechas del cliente.
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

  -- No existir no es lo mismo que "sin fecha configurada" del lado del
  -- profesor: aquí el alumno no puede avanzar sin que alguien configure su
  -- periodo, así que el error se lo dice de frente.
  if not found then
    raise exception 'Esa semana no está configurada para tu periodo. Contacta a tu profesor.';
  end if;

  if v_week.week_start > current_date then
    raise exception 'Todavía no puedes reportar una semana que no ha empezado.';
  end if;

  insert into submissions (student_id, form_code, submitted_at, language, week_start, week_end)
  values (v_student, p_form_code, now(), null, v_week.week_start, v_week.week_end)
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.new_weekly_submission(text, smallint) is
  'Crea la entrega de una bitácora para el alumno de la sesión, resolviendo la semana en semester_weeks. Uso interno de submit_*_log().';

-- ---------------------------------------------------------------------------
-- submit_job_search_log() — Reporte de Búsqueda
-- ---------------------------------------------------------------------------
create or replace function public.submit_job_search_log(
  p_week_number  smallint,
  p_activities   text,
  p_applications text,
  p_interviews   text,
  p_learnings    text,
  p_next_steps   text
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid := public.new_weekly_submission('form_busqueda', p_week_number);
begin
  insert into job_search_logs (
    submission_id, activities, applications, interviews, learnings, next_steps
  )
  values (
    v_id,
    nullif(btrim(p_activities),   ''),
    nullif(btrim(p_applications), ''),
    nullif(btrim(p_interviews),   ''),
    nullif(btrim(p_learnings),    ''),
    nullif(btrim(p_next_steps),   '')
  );

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- submit_internship_log() — Reporte de Prácticas
-- ---------------------------------------------------------------------------
create or replace function public.submit_internship_log(
  p_week_number      smallint,
  p_activities       text,
  p_hours_worked     numeric,
  p_skills_practiced text,
  p_proposal         text
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_hours_worked is not null and (p_hours_worked < 0 or p_hours_worked > 168) then
    raise exception 'Las horas de la semana tienen que estar entre 0 y 168.';
  end if;

  v_id := public.new_weekly_submission('form_practicas', p_week_number);

  insert into internship_logs (
    submission_id, activities, hours_worked, skills_practiced, proposal
  )
  values (
    v_id,
    nullif(btrim(p_activities), ''),
    p_hours_worked,
    nullif(btrim(p_skills_practiced), ''),
    nullif(btrim(p_proposal), '')
  );

  return v_id;
end;
$$;

revoke execute on function public.new_weekly_submission(text, smallint) from public, anon;
revoke execute on function public.submit_job_search_log(smallint, text, text, text, text, text) from public, anon;
revoke execute on function public.submit_internship_log(smallint, text, numeric, text, text) from public, anon;

grant execute on function public.new_weekly_submission(text, smallint) to authenticated;
grant execute on function public.submit_job_search_log(smallint, text, text, text, text, text) to authenticated;
grant execute on function public.submit_internship_log(smallint, text, numeric, text, text) to authenticated;
