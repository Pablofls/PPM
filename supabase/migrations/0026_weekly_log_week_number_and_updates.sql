-- 0026_weekly_log_week_number_and_updates.sql — Número de semana + marca de
-- corrección en las dos bitácoras
-- Ver docs/DATABASE_SCHEMA.md#bitácoras-semanales y #semanas-del-semestre
--
-- El expediente del alumno mostraba la "semana" de una bitácora solo como el
-- rango `submissions.week_start`/`week_end`, sin el número que el profesor ya
-- configuró en `semester_weeks` (`0018`). Y no había forma de saber si una
-- entrega de la semana en curso se había corregido (`update_job_search_log`/
-- `update_internship_log`, `0020`): esas funciones pisan el contenido sin
-- dejar ningún rastro de cuándo.
--
-- Esta migración no cambia `submissions.week_start`/`week_end`: siguen siendo
-- la fuente de verdad de qué semana reportó el alumno. Lo que agrega es (1)
-- una columna para guardar cuándo se corrigió una entrega y (2) resolver el
-- número de semana al leer, por mejor esfuerzo contra `semester_weeks`.

-- ---------------------------------------------------------------------------
-- updated_at — cuándo se corrigió una entrega, no cuándo se creó
-- ---------------------------------------------------------------------------
-- Nula hasta la primera corrección: una bitácora que nunca se tocó después de
-- entregarse no tiene "más reciente" que `submitted_at`.
alter table job_search_logs  add column updated_at timestamptz;
alter table internship_logs  add column updated_at timestamptz;

-- ---------------------------------------------------------------------------
-- update_job_search_log() / update_internship_log() — ahora dejan huella
-- ---------------------------------------------------------------------------
-- Misma firma que en 0020: create or replace basta, no hace falta drop.
create or replace function public.update_job_search_log(
  p_submission_id uuid,
  p_activities    text,
  p_applications  text,
  p_interviews    text,
  p_learnings     text,
  p_next_steps    text
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  update job_search_logs
  set
    activities   = nullif(btrim(p_activities),   ''),
    applications = nullif(btrim(p_applications), ''),
    interviews   = nullif(btrim(p_interviews),   ''),
    learnings    = nullif(btrim(p_learnings),    ''),
    next_steps   = nullif(btrim(p_next_steps),   ''),
    updated_at   = now()
  where submission_id = p_submission_id;

  if not found then
    raise exception 'Ya no puedes corregir esa entrega: no es tuya, o su semana ya no es la actual.';
  end if;
end;
$$;

create or replace function public.update_internship_log(
  p_submission_id    uuid,
  p_activities       text,
  p_hours_worked     numeric,
  p_skills_practiced text,
  p_proposal         text
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if p_hours_worked is not null and (p_hours_worked < 0 or p_hours_worked > 168) then
    raise exception 'Las horas de la semana tienen que estar entre 0 y 168.';
  end if;

  update internship_logs
  set
    activities       = nullif(btrim(p_activities), ''),
    hours_worked     = p_hours_worked,
    skills_practiced = nullif(btrim(p_skills_practiced), ''),
    proposal         = nullif(btrim(p_proposal), ''),
    updated_at       = now()
  where submission_id = p_submission_id;

  if not found then
    raise exception 'Ya no puedes corregir esa entrega: no es tuya, o su semana ya no es la actual.';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- v_student_job_search_logs / v_student_internship_logs — + updated_at, + week_number
-- ---------------------------------------------------------------------------
-- CREATE OR REPLACE VIEW no permite reordenar ni insertar en medio de las
-- columnas que ya existían (0012): updated_at y week_number van al final.
--
-- week_number sale de semester_weeks por mejor esfuerzo: se ancla en
-- sub.week_start y busca la semana configurada del periodo del alumno que lo
-- contiene. Una entrega hecha desde la plataforma (new_weekly_submission,
-- 0018) copió su week_start exacto de semester_weeks, así que ahí siempre
-- calza. Una entrega vieja del Google Forms, con week_start tecleado a mano,
-- puede no caer dentro de ninguna semana configurada (semana invertida, de
-- más de un mes, o de antes de que el profesor generara semanas) — en ese
-- caso week_number queda en null y el expediente sigue mostrando nada más el
-- rango de fechas, igual que hoy. No hay pantalla para corregir esas a mano;
-- se decidió no construirla en esta pasada.
--
-- El join a v_students_directory es is_admin()-only (0006/0018): el alumno no
-- va a resolver su propio period_code por aquí. No es un problema porque el
-- alumno ya lee sus propias bitácoras por otro camino —directo contra
-- job_search_logs/internship_logs, con job_search_logs_select_own /
-- internship_logs_select_own de 0016—, nunca por estas dos vistas (mismo
-- razonamiento que la nota de 0019). Estas vistas solo las consulta el panel
-- del profesor, donde is_admin() sí resuelve el join.
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
  sw.week_number
from submissions sub
join job_search_logs jsl on jsl.submission_id = sub.id
left join v_students_directory dir on dir.student_id = sub.student_id
left join semester_weeks sw
  on sw.period_code = dir.period_code
 and sub.week_start between sw.week_start and sw.week_end;

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
  sw.week_number
from submissions sub
join internship_logs il on il.submission_id = sub.id
left join v_students_directory dir on dir.student_id = sub.student_id
left join semester_weeks sw
  on sw.period_code = dir.period_code
 and sub.week_start between sw.week_start and sw.week_end;

-- create or replace view no debería tirar las reloptions, pero se reafirma
-- explícito y no cuesta nada.
alter view v_student_job_search_logs    set (security_invoker = on);
alter view v_student_internship_logs    set (security_invoker = on);
