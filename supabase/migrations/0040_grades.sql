-- 0040_grades.sql — Calificaciones de los reportes semanales
-- Ver docs/DATABASE_SCHEMA.md#calificaciones
--
-- El profesor califica el reporte semanal de cada alumno, como en el Grade
-- Center de Blackboard. Cada semana del periodo es una actividad («Reporte
-- semana N»); el reporte que se califica es el que el alumno haya entregado
-- esa semana, sea el de Búsqueda o el de Prácticas (un alumno llena uno u
-- otro según su situación, así que la actividad es la semana, no el
-- formulario).
--
-- Modelo (hasta 4FN):
--   * grade_activities(group_id, week_number, points_possible)
--       Puntos posibles de la semana en ese grupo. Es solo configuración: si
--       no hay fila, la vista usa 100. Cada maestro pone los suyos.
--   * grades(student_id, group_id, week_number, score, comment, graded_by,
--            graded_at)
--       Una calificación por alumno y semana. Sin fila = «sin calificar».
--       Todo depende de la llave completa y no hay hechos multivaluados
--       independientes (comentario y puntaje son del mismo acto de calificar).
--
-- Lo que NO se guarda, porque se puede calcular y guardarlo lo desactualiza:
--   * la entrega calificada (la vista busca la del alumno en esa semana, con
--     el mismo número de semana de las bitácoras, 0029);
--   * el total y el porcentaje (puntos obtenidos / posibles de las actividades
--     ya calificadas, como el Total de Blackboard): los calcula el panel a
--     partir de v_grade_center.
--
-- Se permite una calificación mayor que los puntos posibles (crédito extra),
-- como Blackboard.
--
-- Seguridad: el alumno NO tiene política en estas tablas (todavía no ve sus
-- calificaciones). El maestro lee los grupos que ve (0036) y el coordinador
-- los de sus maestros; la lectura exige además la pantalla `calificaciones`
-- (0038). Nadie escribe directo: se escribe con las funciones de abajo, que
-- exigen «Puede editar» y acotan a los grupos de cada quien.

-- ---------------------------------------------------------------------------
-- Pantalla nueva
-- ---------------------------------------------------------------------------
insert into app_screens (code, max_access, audience)
values ('calificaciones', 'edicion', 'panel');

insert into role_screen_access (role_code, screen_code, access) values
  ('maestro',     'calificaciones', 'edicion'),
  ('coordinador', 'calificaciones', 'lectura');

-- ---------------------------------------------------------------------------
-- grade_activities
-- ---------------------------------------------------------------------------
create table grade_activities (
  group_id        uuid     not null references groups (id) on delete cascade,
  week_number     smallint not null,
  points_possible numeric(6,2) not null,

  primary key (group_id, week_number),
  constraint grade_activities_semana check (week_number between 1 and 53),
  constraint grade_activities_puntos check (points_possible > 0)
);

-- ---------------------------------------------------------------------------
-- grades
-- ---------------------------------------------------------------------------
create table grades (
  student_id  uuid     not null,
  group_id    uuid     not null,
  week_number smallint not null,
  score       numeric(6,2) not null,
  comment     text,
  graded_by   uuid references profiles (id) on delete set null,
  graded_at   timestamptz not null default now(),

  primary key (student_id, group_id, week_number),
  -- Solo se califica a quien está inscrito en ese grupo.
  foreign key (student_id, group_id)
    references student_enrollments (student_id, group_id) on delete cascade,
  constraint grades_semana check (week_number between 1 and 53),
  constraint grades_puntaje check (score >= 0)
);

create index idx_grades_group on grades (group_id, week_number);

-- ---------------------------------------------------------------------------
-- La semana tiene que existir en el periodo del grupo
-- ---------------------------------------------------------------------------
create or replace function public.guard_grade_week()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.groups g
    join public.semester_weeks sw on sw.period_code = g.period_code
    where g.id = new.group_id
      and sw.week_number = new.week_number
  ) then
    raise exception 'La semana % no existe en el periodo de ese grupo.', new.week_number;
  end if;
  return new;
end;
$$;

create trigger grade_activities_guard_week
  before insert or update on grade_activities
  for each row execute function public.guard_grade_week();

create trigger grades_guard_week
  before insert or update on grades
  for each row execute function public.guard_grade_week();

-- ---------------------------------------------------------------------------
-- RLS: lectura por alcance + pantalla; sin escritura directa
-- ---------------------------------------------------------------------------
alter table grade_activities enable row level security;
alter table grades           enable row level security;

create policy grade_activities_select_admin on grade_activities
  for select to authenticated using (public.is_admin());
create policy grade_activities_select_scope on grade_activities
  for select to authenticated using (group_id in (select public.visible_group_ids()));
create policy grade_activities_screen_read on grade_activities
  as restrictive for select to authenticated
  using (public.screen_access('calificaciones') >= 'lectura');

create policy grades_select_admin on grades
  for select to authenticated using (public.is_admin());
create policy grades_select_scope on grades
  for select to authenticated using (group_id in (select public.visible_group_ids()));
create policy grades_screen_read on grades
  as restrictive for select to authenticated
  using (public.screen_access('calificaciones') >= 'lectura');

grant select on grade_activities, grades to authenticated;

-- ---------------------------------------------------------------------------
-- set_grade(): califica (o quita la calificación) de un alumno en una semana
-- ---------------------------------------------------------------------------
-- p_score nulo = quitar la calificación (vuelve a «sin calificar»).
create or replace function public.set_grade(
  p_student_id  uuid,
  p_group_id    uuid,
  p_week_number smallint,
  p_score       numeric,
  p_comment     text default null
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
      and p_student_id in (select public.visible_student_ids())
    )
  ) then
    raise exception 'No tienes permiso para calificar a ese alumno.';
  end if;

  if not exists (
    select 1 from student_enrollments e
    where e.student_id = p_student_id and e.group_id = p_group_id
  ) then
    raise exception 'Ese alumno no está inscrito en ese grupo.';
  end if;

  if p_score is null then
    delete from grades
    where student_id = p_student_id
      and group_id = p_group_id
      and week_number = p_week_number;
    return;
  end if;

  if p_score < 0 then
    raise exception 'La calificación no puede ser negativa.';
  end if;
  if p_score > 9999.99 then
    raise exception 'La calificación es demasiado grande.';
  end if;

  insert into grades (student_id, group_id, week_number, score, comment, graded_by, graded_at)
  values (p_student_id, p_group_id, p_week_number, p_score, nullif(btrim(p_comment), ''), auth.uid(), now())
  on conflict (student_id, group_id, week_number) do update
    set score     = excluded.score,
        comment   = excluded.comment,
        graded_by = excluded.graded_by,
        graded_at = excluded.graded_at;
end;
$$;

revoke execute on function public.set_grade(uuid, uuid, smallint, numeric, text) from public, anon;
grant  execute on function public.set_grade(uuid, uuid, smallint, numeric, text) to authenticated;

-- ---------------------------------------------------------------------------
-- set_grade_activity_points(): puntos posibles de una semana en un grupo
-- ---------------------------------------------------------------------------
-- p_points nulo = volver al valor predeterminado (100).
create or replace function public.set_grade_activity_points(
  p_group_id    uuid,
  p_week_number smallint,
  p_points      numeric
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
    delete from grade_activities
    where group_id = p_group_id and week_number = p_week_number;
    return;
  end if;

  if p_points <= 0 then
    raise exception 'Los puntos posibles tienen que ser mayores que cero.';
  end if;
  if p_points > 9999.99 then
    raise exception 'Los puntos posibles son demasiado grandes.';
  end if;

  insert into grade_activities (group_id, week_number, points_possible)
  values (p_group_id, p_week_number, p_points)
  on conflict (group_id, week_number) do update
    set points_possible = excluded.points_possible;
end;
$$;

revoke execute on function public.set_grade_activity_points(uuid, smallint, numeric) from public, anon;
grant  execute on function public.set_grade_activity_points(uuid, smallint, numeric) to authenticated;

-- ---------------------------------------------------------------------------
-- v_grade_center — alumno × semana
-- ---------------------------------------------------------------------------
-- Una fila por alumno con grupo y por semana de su periodo. `state`:
--   sin_entrega  → no entregó reporte esa semana y no está calificado
--   por_calificar → entregó y falta calificar
--   calificado   → tiene calificación (aunque no haya entregado, p. ej. un 0)
-- Mismas columnas de filtro que las v_panel_* (incluye group_id).
create or replace view v_grade_center as
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
  select x.submission_id, x.form_code, x.submitted_at
  from (
    select submission_id, 'form_busqueda'::text as form_code, submitted_at
    from v_student_job_search_logs
    where student_id = dir.student_id and week_number = sw.week_number
    union all
    select submission_id, 'form_practicas'::text, submitted_at
    from v_student_internship_logs
    where student_id = dir.student_id and week_number = sw.week_number
  ) x
  order by x.submitted_at desc
  limit 1
) rep on true
left join grade_activities ga
  on ga.group_id = dir.group_id and ga.week_number = sw.week_number
left join grades gr
  on gr.student_id = dir.student_id
 and gr.group_id = dir.group_id
 and gr.week_number = sw.week_number
where dir.group_id is not null;

alter view v_grade_center set (security_invoker = on);
grant select on v_grade_center to authenticated;
