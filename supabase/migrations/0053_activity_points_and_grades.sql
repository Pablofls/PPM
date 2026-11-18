-- 0053_activity_points_and_grades.sql — Puntos en cada actividad y calificar
-- los formularios que se contestan en la plataforma
-- Ver docs/DATABASE_SCHEMA.md#calificar-las-actividades
--
-- Dos cambios que pidió el profesor:
--
-- 1. Los puntos posibles se configuran en la actividad (Actividades → editar),
--    no en Calificaciones → Configurar actividades, que desaparece.
--      * Reportes semanales: Búsqueda y Prácticas valen LO MISMO. El valor
--        sigue en grade_activities(group_id → points_possible) (0041): es un
--        solo hecho por grupo, y copiarlo a las dos filas de `activities`
--        guardaría el mismo dato dos veces. El editor de cualquiera de los dos
--        escribe esa misma fila.
--      * Las demás actividades: columna nueva activities.points_possible. La
--        llave de activities es (group_id, form_code) y los puntos dependen de
--        la llave completa y de nada más. En las dos bitácoras es NULL a
--        propósito (check): su valor vive en grade_activities.
--
-- 2. Los formularios que se contestan en la plataforma se califican como los
--    reportes. Hoy es el 1.0; mañana los que se vayan pasando.
--      * forms.answered_in_panel: hecho del formulario (¿se contesta en el
--        portal?). Pasar un formulario a la plataforma es ponerlo en true; con
--        eso ya es calificable.
--      * activity_grades(student_id, group_id, form_code → score, comment,
--        graded_by, graded_at): una calificación por alumno y actividad. Es
--        una tabla aparte de `grades` (alumno × semana) porque la cosa
--        calificada es otra: juntarlas obligaría a dejar week_number o
--        form_code en NULL según el caso. Sin hechos multivaluados.
--      * activity_grade_reads(student_id, group_id, form_code → read_at):
--        cuándo vio el alumno su calificación, espejo de grade_reads (0050).
--
-- Lo que NO se guarda (se deriva): la entrega calificada (la más reciente,
-- latest_submissions), el estado (sin_entrega / por_calificar / calificado),
-- si fue tardía (submitted_at > due_at) y el total.
--
-- Seguridad: igual que grades / grade_reads (0040, 0049, 0050). Lectura del
-- staff por alcance y pantalla `calificaciones`; el alumno lo suyo con
-- `alumno_calificaciones`. Nadie escribe directo: set_activity_grade() y
-- mark_activity_grade_read().

-- ---------------------------------------------------------------------------
-- forms.answered_in_panel
-- ---------------------------------------------------------------------------
alter table forms add column answered_in_panel boolean not null default false;

update forms set answered_in_panel = true
where code in ('form1_0', 'form_busqueda', 'form_practicas');

-- ---------------------------------------------------------------------------
-- activities.points_possible
-- ---------------------------------------------------------------------------
alter table activities add column points_possible numeric(6,2);

update activities set points_possible = 100
where form_code not in ('form_busqueda', 'form_practicas');

alter table activities
  add constraint activities_puntos_solo_no_semanales
    check ((form_code in ('form_busqueda', 'form_practicas')) = (points_possible is null)),
  add constraint activities_puntos_rango
    check (points_possible is null or (points_possible > 0 and points_possible <= 9999.99));

-- Cada grupo nuevo nace con sus actividades: 100 puntos, salvo las bitácoras.
create or replace function public.seed_group_activities()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into activities (group_id, form_code, is_published, points_possible)
  select new.id, f.code, public.default_activity_published(f.code),
         case when f.code in ('form_busqueda', 'form_practicas') then null else 100 end
  from forms f
  on conflict (group_id, form_code) do nothing;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- save_activity(): ahora también guarda los puntos posibles
-- ---------------------------------------------------------------------------
drop function public.save_activity(uuid, text, text, boolean, timestamp, timestamp, timestamp);
drop function public.set_grade_activity_points(uuid, numeric);

-- p_points nulo = 100 (el valor de siempre).
create or replace function public.save_activity(
  p_group_id        uuid,
  p_form_code       text,
  p_instructions    text,
  p_is_published    boolean,
  p_available_from  timestamp,
  p_due_at          timestamp,
  p_available_until timestamp,
  p_points          numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_weekly boolean;
  v_from   timestamptz := p_available_from  at time zone 'America/Monterrey';
  v_due    timestamptz := p_due_at          at time zone 'America/Monterrey';
  v_until  timestamptz := p_available_until at time zone 'America/Monterrey';
  v_points numeric(6,2) := coalesce(p_points, 100);
begin
  if not public.can_edit_group_dates(p_group_id) then
    raise exception 'No tienes permiso para configurar las actividades de ese grupo.';
  end if;

  select module_code = 'W' into v_weekly from forms where code = p_form_code;
  if v_weekly is null then
    raise exception 'Esa actividad no existe.';
  end if;
  -- Las bitácoras vencen semana por semana (group_weeks), no en una fecha.
  if v_weekly then
    v_due := null;
  end if;

  if v_from is not null and v_due is not null and v_from > v_due then
    raise exception '«Disponible desde» tiene que ser antes de la fecha de entrega.';
  end if;
  if v_due is not null and v_until is not null and v_due > v_until then
    raise exception 'La fecha de entrega tiene que ser antes de «Disponible hasta».';
  end if;
  if v_from is not null and v_until is not null and v_from >= v_until then
    raise exception '«Disponible desde» tiene que ser antes de «Disponible hasta».';
  end if;
  if v_points <= 0 then
    raise exception 'Los puntos posibles tienen que ser mayores que cero.';
  end if;
  if v_points > 9999.99 then
    raise exception 'Los puntos posibles son demasiado grandes.';
  end if;

  insert into activities (
    group_id, form_code, instructions, is_published,
    available_from, due_at, available_until, points_possible, updated_at
  )
  values (
    p_group_id, p_form_code, nullif(btrim(p_instructions), ''),
    coalesce(p_is_published, false), v_from, v_due, v_until,
    case when v_weekly then null else v_points end, now()
  )
  on conflict (group_id, form_code) do update set
    instructions    = excluded.instructions,
    is_published    = excluded.is_published,
    available_from  = excluded.available_from,
    due_at          = excluded.due_at,
    available_until = excluded.available_until,
    points_possible = excluded.points_possible,
    updated_at      = now();

  -- Búsqueda y Prácticas comparten un solo valor por grupo.
  if v_weekly then
    insert into grade_activities (group_id, points_possible)
    values (p_group_id, v_points)
    on conflict (group_id) do update
      set points_possible = excluded.points_possible;
  end if;
end;
$$;

revoke execute on function public.save_activity(uuid, text, text, boolean, timestamp, timestamp, timestamp, numeric) from public, anon;
grant  execute on function public.save_activity(uuid, text, text, boolean, timestamp, timestamp, timestamp, numeric) to authenticated;

-- El maestro que edita Actividades necesita leer los puntos del reporte aunque
-- no tenga la pantalla Calificaciones.
drop policy grade_activities_screen_read on grade_activities;
create policy grade_activities_screen_read on grade_activities
  as restrictive for select to authenticated
  using (
    (select public.screen_access('calificaciones')) >= 'lectura'
    or (select public.screen_access('actividades')) >= 'lectura'
    or (
      group_id = (select public.current_student_group_id())
      and (select public.screen_access('alumno_calificaciones')) >= 'lectura'
    )
  );

-- ---------------------------------------------------------------------------
-- activity_grades
-- ---------------------------------------------------------------------------
create table activity_grades (
  student_id uuid not null,
  group_id   uuid not null,
  form_code  text not null,
  score      numeric(6,2) not null,
  comment    text,
  graded_by  uuid references profiles (id) on delete set null,
  graded_at  timestamptz not null default now(),

  primary key (student_id, group_id, form_code),
  foreign key (student_id, group_id)
    references student_enrollments (student_id, group_id) on delete cascade,
  foreign key (group_id, form_code)
    references activities (group_id, form_code) on delete cascade,
  constraint activity_grades_puntaje check (score >= 0 and score <= 9999.99)
);

create index idx_activity_grades_group on activity_grades (group_id, form_code);

-- Solo se califica lo que se contesta en la plataforma y no es bitácora (las
-- bitácoras se califican por semana, en `grades`).
create or replace function public.guard_activity_grade_form()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.forms f
    where f.code = new.form_code
      and f.answered_in_panel
      and f.module_code <> 'W'
  ) then
    raise exception 'Esa actividad no se califica en la plataforma.';
  end if;
  return new;
end;
$$;

create trigger activity_grades_guard_form
  before insert or update on activity_grades
  for each row execute function public.guard_activity_grade_form();

-- ---------------------------------------------------------------------------
-- activity_grade_reads
-- ---------------------------------------------------------------------------
create table activity_grade_reads (
  student_id uuid not null,
  group_id   uuid not null,
  form_code  text not null,
  read_at    timestamptz not null default now(),

  primary key (student_id, group_id, form_code),
  foreign key (student_id, group_id, form_code)
    references activity_grades (student_id, group_id, form_code) on delete cascade
);

-- ---------------------------------------------------------------------------
-- RLS: como grades y grade_reads
-- ---------------------------------------------------------------------------
alter table activity_grades      enable row level security;
alter table activity_grade_reads enable row level security;

create policy activity_grades_select_admin on activity_grades
  for select to authenticated using ((select public.is_admin()));
create policy activity_grades_select_scope on activity_grades
  for select to authenticated using (group_id in (select public.visible_group_ids()));
create policy activity_grades_select_own on activity_grades
  for select to authenticated using (student_id = (select public.current_student_id()));
create policy activity_grades_screen_read on activity_grades
  as restrictive for select to authenticated
  using (
    (select public.screen_access('calificaciones')) >= 'lectura'
    or (
      student_id = (select public.current_student_id())
      and (select public.screen_access('alumno_calificaciones')) >= 'lectura'
    )
  );

create policy activity_grade_reads_select_admin on activity_grade_reads
  for select to authenticated using ((select public.is_admin()));
create policy activity_grade_reads_select_own on activity_grade_reads
  for select to authenticated using (student_id = (select public.current_student_id()));
create policy activity_grade_reads_select_scope on activity_grade_reads
  for select to authenticated
  using (
    (select public.screen_access('calificaciones')) >= 'lectura'
    and group_id in (select public.visible_group_ids())
  );

grant select on activity_grades, activity_grade_reads to authenticated;

-- ---------------------------------------------------------------------------
-- set_activity_grade(): califica (o quita la calificación de) una actividad
-- ---------------------------------------------------------------------------
-- p_score nulo = quitar la calificación (vuelve a «sin calificar»).
create or replace function public.set_activity_grade(
  p_student_id uuid,
  p_group_id   uuid,
  p_form_code  text,
  p_score      numeric,
  p_comment    text default null
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
    delete from activity_grades
    where student_id = p_student_id
      and group_id = p_group_id
      and form_code = p_form_code;
    return;
  end if;

  if p_score < 0 then
    raise exception 'La calificación no puede ser negativa.';
  end if;
  if p_score > 9999.99 then
    raise exception 'La calificación es demasiado grande.';
  end if;

  insert into activity_grades (student_id, group_id, form_code, score, comment, graded_by, graded_at)
  values (p_student_id, p_group_id, p_form_code, p_score, nullif(btrim(p_comment), ''), auth.uid(), now())
  on conflict (student_id, group_id, form_code) do update
    set score     = excluded.score,
        comment   = excluded.comment,
        graded_by = excluded.graded_by,
        graded_at = excluded.graded_at;
end;
$$;

revoke execute on function public.set_activity_grade(uuid, uuid, text, numeric, text) from public, anon;
grant  execute on function public.set_activity_grade(uuid, uuid, text, numeric, text) to authenticated;

-- ---------------------------------------------------------------------------
-- El alumno marca como vista SU calificación
-- ---------------------------------------------------------------------------
create or replace function public.mark_activity_grade_read(p_group_id uuid, p_form_code text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into activity_grade_reads (student_id, group_id, form_code, read_at)
  select g.student_id, g.group_id, g.form_code, now()
  from activity_grades g
  where g.student_id = public.current_student_id()
    and g.group_id = p_group_id
    and g.form_code = p_form_code
  on conflict (student_id, group_id, form_code) do update
    set read_at = excluded.read_at;
$$;

revoke execute on function public.mark_activity_grade_read(uuid, text) from public, anon;
grant  execute on function public.mark_activity_grade_read(uuid, text) to authenticated;

create or replace function public.mark_all_notifications_read()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student uuid := public.current_student_id();
begin
  if v_student is null then
    return;
  end if;

  update notice_recipients
  set read_at = now()
  where student_id = v_student and read_at is null;

  insert into grade_reads (student_id, group_id, week_number, read_at)
  select g.student_id, g.group_id, g.week_number, now()
  from grades g
  where g.student_id = v_student
  on conflict (student_id, group_id, week_number) do update
    set read_at = excluded.read_at;

  insert into activity_grade_reads (student_id, group_id, form_code, read_at)
  select g.student_id, g.group_id, g.form_code, now()
  from activity_grades g
  where g.student_id = v_student
  on conflict (student_id, group_id, form_code) do update
    set read_at = excluded.read_at;
end;
$$;

-- El alumno ve también el nombre de quien le calificó una actividad.
create or replace function public.notification_sender_name(p_profile_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select nullif(concat_ws(' ', p.first_name, p.last_name), '')
  from public.profiles p
  where p.id = p_profile_id
    and (
      public.is_staff()
      or exists (
        select 1
        from public.notices n
        join public.notice_recipients r on r.notice_id = n.id
        where n.sender_id = p_profile_id
          and r.student_id = public.current_student_id()
      )
      or exists (
        select 1 from public.grades g
        where g.graded_by = p_profile_id
          and g.student_id = public.current_student_id()
      )
      or exists (
        select 1 from public.activity_grades g
        where g.graded_by = p_profile_id
          and g.student_id = public.current_student_id()
      )
    );
$$;

-- ---------------------------------------------------------------------------
-- v_activity_grade_center — alumno × actividad calificable
-- ---------------------------------------------------------------------------
-- Las actividades publicadas del grupo que se contestan en la plataforma y no
-- son bitácora. Mismas columnas de filtro que v_grade_center.
create or replace view v_activity_grade_center as
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
  a.form_code,
  f.display_order,
  a.due_at,
  ls.id            as submission_id,
  ls.submitted_at,
  a.points_possible,
  ag.score,
  ag.comment,
  ag.graded_at,
  case
    when ag.score is not null then 'calificado'
    when ls.id is not null then 'por_calificar'
    else 'sin_entrega'
  end as state,
  coalesce(ls.submitted_at > a.due_at, false) as is_late,
  case when agr.read_at >= ag.graded_at then agr.read_at end as seen_at
from v_students_directory dir
join activities a
  on a.group_id = dir.group_id
 and a.is_published
join forms f
  on f.code = a.form_code
 and f.answered_in_panel
 and f.module_code <> 'W'
left join latest_submissions ls
  on ls.student_id = dir.student_id
 and ls.form_code = a.form_code
left join activity_grades ag
  on ag.student_id = dir.student_id
 and ag.group_id = dir.group_id
 and ag.form_code = a.form_code
left join activity_grade_reads agr
  on agr.student_id = ag.student_id
 and agr.group_id = ag.group_id
 and agr.form_code = ag.form_code
where dir.group_id is not null;

alter view v_activity_grade_center set (security_invoker = on);
grant select on v_activity_grade_center to authenticated;

-- ---------------------------------------------------------------------------
-- v_my_notifications — suma las calificaciones de actividades
-- ---------------------------------------------------------------------------
-- Mismas columnas que 0050 y `form_code` al final (nulo en avisos y reportes).
create or replace view v_my_notifications as
select
  'aviso'::text                       as kind,
  r.student_id,
  n.id                                as notice_id,
  null::uuid                          as group_id,
  null::smallint                      as week_number,
  n.subject                           as title,
  n.body,
  null::numeric(6,2)                  as score,
  null::numeric(6,2)                  as points_possible,
  n.sent_at                           as created_at,
  r.read_at,
  public.notification_sender_name(n.sender_id) as sender_name,
  exists (select 1 from notice_groups ng where ng.notice_id = n.id) as to_group,
  null::text                          as form_code
from notice_recipients r
join notices n on n.id = r.notice_id
union all
select
  'calificacion'::text,
  g.student_id,
  null::uuid,
  g.group_id,
  g.week_number,
  'Reporte semana ' || g.week_number,
  g.comment,
  g.score,
  coalesce(ga.points_possible, 100)::numeric(6,2),
  g.graded_at,
  case when gr.read_at >= g.graded_at then gr.read_at end,
  public.notification_sender_name(g.graded_by),
  false,
  null::text
from grades g
left join grade_activities ga on ga.group_id = g.group_id
left join grade_reads gr
  on gr.student_id = g.student_id
 and gr.group_id = g.group_id
 and gr.week_number = g.week_number
union all
select
  'calificacion'::text,
  g.student_id,
  null::uuid,
  g.group_id,
  null::smallint,
  f.name_es,
  g.comment,
  g.score,
  coalesce(a.points_possible, 100)::numeric(6,2),
  g.graded_at,
  case when gr.read_at >= g.graded_at then gr.read_at end,
  public.notification_sender_name(g.graded_by),
  false,
  g.form_code
from activity_grades g
join forms f on f.code = g.form_code
left join activities a
  on a.group_id = g.group_id
 and a.form_code = g.form_code
left join activity_grade_reads gr
  on gr.student_id = g.student_id
 and gr.group_id = g.group_id
 and gr.form_code = g.form_code;

alter view v_my_notifications set (security_invoker = on);
grant select on v_my_notifications to authenticated;
