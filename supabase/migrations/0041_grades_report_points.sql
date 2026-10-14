-- 0041_grades_report_points.sql — Los puntos son del reporte, no de cada semana;
-- y v_grade_center deja de agotar el tiempo
-- Ver docs/DATABASE_SCHEMA.md#calificaciones
--
-- Dos correcciones a 0040, que ya se ejecutó y no se edita:
--
-- 1. Modelo. 0040 guardaba los puntos posibles por semana. Pero el reporte de
--    Búsqueda y el de Prácticas son UNA sola actividad que vale lo mismo y se
--    repite cada semana. Los puntos son entonces una sola cifra por grupo:
--    grade_activities pasa de (group_id, week_number) a (group_id). Sigue en
--    4FN: points_possible depende solo de la llave (el grupo) y no hay
--    ningún hecho multivaluado. Los puntos que se hubieran puesto por semana
--    se pierden a propósito: ya no significan nada; se vuelve a escribir uno.
--
-- 2. Rendimiento. v_grade_center leía v_student_job_search_logs y
--    v_student_internship_logs por cada alumno y semana, y cada lectura
--    recalculaba esas vistas completas (ventanas sobre toda la tabla y el
--    directorio). Con un grupo real excedía el statement timeout. Ahora busca
--    la entrega directo en `submissions` y en las dos bitácoras, con el mismo
--    número de semana (resolved_week_number, 0029) que usa
--    v_weekly_submission_status.

-- ---------------------------------------------------------------------------
-- Fuera lo de 0040 que cambia de forma
-- ---------------------------------------------------------------------------
drop view if exists v_grade_center;
drop function if exists public.set_grade_activity_points(uuid, smallint, numeric);
drop table if exists grade_activities;   -- se lleva su trigger y sus políticas

-- ---------------------------------------------------------------------------
-- grade_activities — los puntos del reporte semanal de un grupo
-- ---------------------------------------------------------------------------
create table grade_activities (
  group_id        uuid primary key references groups (id) on delete cascade,
  points_possible numeric(6,2) not null,

  constraint grade_activities_puntos check (points_possible > 0)
);

alter table grade_activities enable row level security;

create policy grade_activities_select_admin on grade_activities
  for select to authenticated using (public.is_admin());
create policy grade_activities_select_scope on grade_activities
  for select to authenticated using (group_id in (select public.visible_group_ids()));
create policy grade_activities_screen_read on grade_activities
  as restrictive for select to authenticated
  using (public.screen_access('calificaciones') >= 'lectura');

grant select on grade_activities to authenticated;

-- ---------------------------------------------------------------------------
-- set_grade_activity_points(): los puntos del reporte de un grupo
-- ---------------------------------------------------------------------------
-- p_points nulo = volver al valor predeterminado (100).
create or replace function public.set_grade_activity_points(
  p_group_id uuid,
  p_points   numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (
    public.is_admin()
    or (
      public.can_edit_screen('calificaciones')
      and p_group_id in (select public.visible_group_ids())
    )
  ) then
    raise exception 'No tienes permiso para configurar las actividades de ese grupo.';
  end if;

  if p_points is null then
    delete from grade_activities where group_id = p_group_id;
    return;
  end if;

  if p_points <= 0 then
    raise exception 'Los puntos posibles tienen que ser mayores que cero.';
  end if;
  if p_points > 9999.99 then
    raise exception 'Los puntos posibles son demasiado grandes.';
  end if;

  insert into grade_activities (group_id, points_possible)
  values (p_group_id, p_points)
  on conflict (group_id) do update
    set points_possible = excluded.points_possible;
end;
$$;

revoke execute on function public.set_grade_activity_points(uuid, numeric) from public, anon;
grant  execute on function public.set_grade_activity_points(uuid, numeric) to authenticated;

-- ---------------------------------------------------------------------------
-- v_grade_center — alumno × semana (mismas columnas y estados que en 0040)
-- ---------------------------------------------------------------------------
create view v_grade_center as
select
  dir.student_id,
  dir.institutional_email,
  dir.full_name,
  dir.degree_code,
  dir.semester,
  dir.period_code,
  dir.session_day,
  dir.language,
  dir.group_id,
  sw.week_number,
  sw.week_start,
  sw.week_end,
  rep.form_code,
  rep.submission_id,
  rep.submitted_at,
  coalesce(ga.points_possible, 100)::numeric(6,2) as points_possible,
  gr.score,
  gr.comment,
  gr.graded_at,
  case
    when gr.score is not null then 'calificado'
    when rep.submission_id is not null then 'por_calificar'
    else 'sin_entrega'
  end as state
from v_students_directory dir
join semester_weeks sw on sw.period_code = dir.period_code
left join lateral (
  select sub.id as submission_id, sub.form_code, sub.submitted_at
  from submissions sub
  left join job_search_logs jsl on jsl.submission_id = sub.id
  left join internship_logs il  on il.submission_id  = sub.id
  where sub.student_id = dir.student_id
    and sub.form_code in ('form_busqueda', 'form_practicas')
    and public.resolved_week_number(
          dir.period_code, sub.week_start, sub.week_end,
          coalesce(jsl.week_number_override, il.week_number_override)
        ) = sw.week_number
  order by sub.submitted_at desc
  limit 1
) rep on true
left join grade_activities ga on ga.group_id = dir.group_id
left join grades gr
  on gr.student_id = dir.student_id
 and gr.group_id = dir.group_id
 and gr.week_number = sw.week_number
where dir.group_id is not null;

alter view v_grade_center set (security_invoker = on);
grant select on v_grade_center to authenticated;
