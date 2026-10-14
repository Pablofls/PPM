-- 0046_group_deadlines.sql — Las fechas de entrega son de cada grupo
-- Ver docs/DATABASE_SCHEMA.md#fechas-de-entrega-por-grupo
--
-- Hasta 0045 el calendario semanal (semester_weeks, por periodo) y las fechas
-- límite (form_deadlines, por formulario/idioma/frecuencia/periodo) eran de
-- todos. Cada maestro fija las suyas para cada grupo:
--
--   * group_weeks     (group_id, week_number)  → week_start, week_end
--   * group_deadlines (group_id, form_code)    → due_at
--
-- Normalización (4FN): el grupo ya contiene periodo, frecuencia e idioma, así
-- que esas columnas y la regla «la más específica gana» desaparecen. Cada
-- tabla depende solo de su llave completa.
--
-- Los datos actuales se COPIAN a cada grupo (nada cambia al ejecutar). Los
-- grupos nuevos nacen sin fechas: el maestro las configura. semester_weeks y
-- form_deadlines quedan sin uso (se eliminarán en una migración posterior,
-- cuando se confirme en producción); aquí solo se les quitan las escrituras.

-- ---------------------------------------------------------------------------
-- current_student_group_id() — el grupo del alumno de la sesión
-- ---------------------------------------------------------------------------
-- Mismo patrón que current_student_period() (0018): SECURITY DEFINER porque
-- v_students_directory es solo para staff.
create or replace function public.current_student_group_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select dir.group_id
  from public.v_students_directory dir
  where dir.student_id = public.current_student_id();
$$;

revoke execute on function public.current_student_group_id() from public, anon;
grant execute on function public.current_student_group_id() to authenticated;

-- ---------------------------------------------------------------------------
-- group_weeks
-- ---------------------------------------------------------------------------
create table group_weeks (
  group_id    uuid     not null references groups (id) on delete cascade,
  week_number smallint not null,
  week_start  date     not null,
  week_end    date     not null,

  primary key (group_id, week_number),
  constraint group_weeks_semana_valida check (week_end = week_start + 6),
  constraint group_weeks_numero_valido check (week_number between 1 and 53),
  constraint group_weeks_empieza_lunes check (extract(isodow from week_start) = 1)
);

-- ---------------------------------------------------------------------------
-- group_deadlines
-- ---------------------------------------------------------------------------
create table group_deadlines (
  group_id  uuid        not null references groups (id) on delete cascade,
  form_code text        not null references forms (code),
  due_at    timestamptz not null,

  primary key (group_id, form_code)
);

-- ---------------------------------------------------------------------------
-- Datos: lo configurado hasta hoy pasa a cada grupo
-- ---------------------------------------------------------------------------
insert into group_weeks (group_id, week_number, week_start, week_end)
select g.id, sw.week_number, sw.week_start, sw.week_end
from groups g
join semester_weeks sw on sw.period_code = g.period_code;

insert into group_deadlines (group_id, form_code, due_at)
select g.id, f.code,
       public.resolve_form_deadline(f.code, g.language, g.session_day, g.period_code)
from groups g
cross join forms f
where public.resolve_form_deadline(f.code, g.language, g.session_day, g.period_code) is not null;

-- ---------------------------------------------------------------------------
-- RLS — lectura por alcance; escritura solo con las funciones de abajo
-- ---------------------------------------------------------------------------
-- Sin política restrictiva de pantalla, a propósito: las fechas no llevan datos
-- personales y las vistas de Estado de Entregas, Calificaciones y el portal
-- (security_invoker) las necesitan aunque quien las lee no tenga la pantalla
-- «Fechas de entrega».
alter table group_weeks     enable row level security;
alter table group_deadlines enable row level security;

create policy group_weeks_select_admin on group_weeks
  for select to authenticated using (public.is_admin());
create policy group_weeks_select_scope on group_weeks
  for select to authenticated using (group_id in (select public.visible_group_ids()));
create policy group_weeks_select_own on group_weeks
  for select to authenticated using (group_id = public.current_student_group_id());

create policy group_deadlines_select_admin on group_deadlines
  for select to authenticated using (public.is_admin());
create policy group_deadlines_select_scope on group_deadlines
  for select to authenticated using (group_id in (select public.visible_group_ids()));
create policy group_deadlines_select_own on group_deadlines
  for select to authenticated using (group_id = public.current_student_group_id());

grant select on group_weeks, group_deadlines to authenticated;

-- Las tablas viejas ya no se escriben.
drop policy form_deadlines_insert_admin   on form_deadlines;
drop policy form_deadlines_delete_admin   on form_deadlines;
drop policy form_deadlines_insert_screen  on form_deadlines;
drop policy form_deadlines_delete_screen  on form_deadlines;
drop policy semester_weeks_insert_admin   on semester_weeks;
drop policy semester_weeks_delete_admin   on semester_weeks;
drop policy semester_weeks_insert_screen  on semester_weeks;
drop policy semester_weeks_delete_screen  on semester_weeks;

-- ---------------------------------------------------------------------------
-- Escritura: quien edita la pantalla, en sus grupos
-- ---------------------------------------------------------------------------
create or replace function public.can_edit_group_dates(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin()
      or (
        public.can_edit_screen('fechas_entrega')
        and p_group_id in (select public.visible_group_ids())
      )
$$;

revoke execute on function public.can_edit_group_dates(uuid) from public, anon;
grant execute on function public.can_edit_group_dates(uuid) to authenticated;

-- Genera las semanas del grupo: la 1 empieza en p_first_monday, las demás
-- suman 7 días. Si el grupo ya tiene semanas, hay que borrarlas primero.
create or replace function public.create_group_weeks(
  p_group_id     uuid,
  p_first_monday date,
  p_count        integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_edit_group_dates(p_group_id) then
    raise exception 'No tienes permiso para configurar las fechas de ese grupo.';
  end if;
  if p_first_monday is null or extract(isodow from p_first_monday) <> 1 then
    raise exception 'La semana 1 tiene que empezar en lunes.';
  end if;
  if p_count is null or p_count < 1 or p_count > 53 then
    raise exception 'El número de semanas va de 1 a 53.';
  end if;
  if exists (select 1 from group_weeks where group_id = p_group_id) then
    raise exception 'Ese grupo ya tiene semanas configuradas. Bórralas primero si quieres cambiar la fecha de inicio.';
  end if;

  insert into group_weeks (group_id, week_number, week_start, week_end)
  select p_group_id, n, p_first_monday + (n - 1) * 7, p_first_monday + (n - 1) * 7 + 6
  from generate_series(1, p_count) n;
end;
$$;

create or replace function public.delete_group_weeks(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_edit_group_dates(p_group_id) then
    raise exception 'No tienes permiso para configurar las fechas de ese grupo.';
  end if;
  delete from group_weeks where group_id = p_group_id;
end;
$$;

-- Fija (o cambia) la fecha límite de varios formularios de un grupo.
create or replace function public.set_group_deadlines(
  p_group_id   uuid,
  p_form_codes text[],
  p_due_at     timestamptz
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_edit_group_dates(p_group_id) then
    raise exception 'No tienes permiso para configurar las fechas de ese grupo.';
  end if;
  if p_due_at is null or coalesce(array_length(p_form_codes, 1), 0) = 0 then
    raise exception 'Indica la fecha y al menos un formulario.';
  end if;

  insert into group_deadlines (group_id, form_code, due_at)
  select p_group_id, code, p_due_at
  from unnest(p_form_codes) code
  on conflict (group_id, form_code) do update set due_at = excluded.due_at;
end;
$$;

create or replace function public.delete_group_deadline(p_group_id uuid, p_form_code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_edit_group_dates(p_group_id) then
    raise exception 'No tienes permiso para configurar las fechas de ese grupo.';
  end if;
  delete from group_deadlines where group_id = p_group_id and form_code = p_form_code;
end;
$$;

revoke execute on function public.create_group_weeks(uuid, date, integer)     from public, anon;
revoke execute on function public.delete_group_weeks(uuid)                     from public, anon;
revoke execute on function public.set_group_deadlines(uuid, text[], timestamptz) from public, anon;
revoke execute on function public.delete_group_deadline(uuid, text)            from public, anon;
grant  execute on function public.create_group_weeks(uuid, date, integer)     to authenticated;
grant  execute on function public.delete_group_weeks(uuid)                     to authenticated;
grant  execute on function public.set_group_deadlines(uuid, text[], timestamptz) to authenticated;
grant  execute on function public.delete_group_deadline(uuid, text)            to authenticated;

-- ---------------------------------------------------------------------------
-- Funciones que resolvían por periodo: ahora por grupo
-- ---------------------------------------------------------------------------
create or replace function public.group_form_deadline(p_group_id uuid, p_form_code text)
returns timestamptz
language sql
stable
as $$
  select due_at from group_deadlines
  where group_id = p_group_id and form_code = p_form_code
$$;

create or replace function public.best_matching_week_number(
  p_group_id   uuid,
  p_week_start date,
  p_week_end   date
)
returns smallint
language sql
stable
as $$
  select gw.week_number
  from group_weeks gw
  where gw.group_id = p_group_id
    and p_week_start is not null
    and p_week_end   is not null
    and gw.week_start <= p_week_end
    and gw.week_end   >= p_week_start
  order by
    least(p_week_end, gw.week_end) - greatest(p_week_start, gw.week_start) desc,
    gw.week_start
  limit 1
$$;

create or replace function public.resolved_week_number(
  p_group_id   uuid,
  p_week_start date,
  p_week_end   date,
  p_override   smallint
)
returns smallint
language sql
stable
as $$
  select coalesce(p_override, public.best_matching_week_number(p_group_id, p_week_start, p_week_end))
$$;

-- El trigger de calificaciones: la semana debe existir en el calendario del grupo.
create or replace function public.guard_grade_week()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.group_weeks gw
    where gw.group_id = new.group_id
      and gw.week_number = new.week_number
  ) then
    raise exception 'La semana % no está configurada en las fechas de ese grupo.', new.week_number;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Vistas de bitácora: week_number se resuelve contra el calendario del grupo
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
  public.resolved_week_number(dir.group_id, sub.week_start, sub.week_end, jsl.week_number_override) as week_number
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
  public.resolved_week_number(dir.group_id, sub.week_start, sub.week_end, il.week_number_override) as week_number
from submissions sub
join internship_logs il on il.submission_id = sub.id
left join v_students_directory dir on dir.student_id = sub.student_id;

alter view v_student_job_search_logs set (security_invoker = on);
alter view v_student_internship_logs set (security_invoker = on);

-- ---------------------------------------------------------------------------
-- Estado de Entregas (semanal y por formulario)
-- ---------------------------------------------------------------------------
create or replace view v_weekly_submission_status as
select
  dir.student_id,
  gw.week_number,
  gw.week_start,
  gw.week_end,
  wl.submitted_at,
  (gw.week_end + time '23:59:59') at time zone 'America/Monterrey' as due_at,
  public.submission_status(
    (gw.week_end + time '23:59:59') at time zone 'America/Monterrey',
    wl.submitted_at
  ) as state
from v_students_directory dir
join group_weeks gw on gw.group_id = dir.group_id
left join lateral (
  select min(sub.submitted_at) as submitted_at
  from submissions sub
  left join job_search_logs jsl on jsl.submission_id = sub.id
  left join internship_logs il  on il.submission_id  = sub.id
  where sub.student_id = dir.student_id
    and sub.form_code in ('form_busqueda', 'form_practicas')
    and public.resolved_week_number(
          dir.group_id, sub.week_start, sub.week_end,
          coalesce(jsl.week_number_override, il.week_number_override)
        ) = gw.week_number
) wl on true;

alter view v_weekly_submission_status set (security_invoker = on);

create or replace view v_submission_status as
select
  dir.student_id,
  dir.institutional_email,
  dir.full_name,
  dir.degree_code,
  dir.semester,
  dir.period_code,
  dir.session_day,
  lang.language,
  f.code as form_code,
  ls.submitted_at,
  public.group_form_deadline(dir.group_id, f.code) as due_at,
  public.submission_status(
    public.group_form_deadline(dir.group_id, f.code),
    ls.submitted_at
  ) as state,
  dir.group_id
from v_students_directory dir
cross join (
  select code from forms where code <> 'form1_0'
) f
left join lateral (
  select sub.language
  from submissions sub
  where sub.student_id = dir.student_id
    and sub.language is not null
  order by sub.submitted_at desc
  limit 1
) lang on true
left join latest_submissions ls
  on ls.student_id = dir.student_id
 and ls.form_code = f.code;

alter view v_submission_status set (security_invoker = on);

-- ---------------------------------------------------------------------------
-- Entrega secuencial (0043): el calendario es el del grupo del alumno
-- ---------------------------------------------------------------------------
create or replace function public.next_weekly_week_number()
returns smallint
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(
    (select min(s.week_number)
       from v_weekly_submission_status s
      where s.student_id = public.current_student_id()
        and s.submitted_at is null
        and s.week_start <= public.today_monterrey()),
    (select gw.week_number
       from group_weeks gw
      where gw.group_id = public.current_student_group_id()
        and public.today_monterrey() between gw.week_start and gw.week_end)
  )::smallint
$$;

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
  v_group   uuid := public.current_student_group_id();
  v_next    smallint;
  v_week    record;
  v_id      uuid;
begin
  if v_student is null then
    raise exception 'Tu cuenta no está asociada a ningún alumno.';
  end if;

  if p_week_number is null then
    raise exception 'Indica qué semana estás reportando.';
  end if;

  if v_group is null then
    raise exception 'Tu cuenta no tiene un grupo asignado. Contacta a tu profesor.';
  end if;

  select week_start, week_end into v_week
  from group_weeks
  where group_id = v_group
    and week_number = p_week_number;

  if not found then
    raise exception 'Esa semana no está configurada para tu grupo. Contacta a tu profesor.';
  end if;

  v_next := public.next_weekly_week_number();

  if v_next is null then
    raise exception 'Hoy no cae dentro de ninguna semana configurada de tu grupo. Contacta a tu profesor.';
  end if;

  if p_week_number <> v_next then
    if p_week_number > v_next then
      raise exception 'Primero entrega la semana %.', v_next;
    end if;
    raise exception 'La semana % ya está entregada.', p_week_number;
  end if;

  insert into submissions (student_id, form_code, submitted_at, language, week_start, week_end)
  values (v_student, p_form_code, now(), null, v_week.week_start, v_week.week_end)
  returning id into v_id;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- v_grade_center: cuerpo de 0043, con el calendario del grupo
-- ---------------------------------------------------------------------------
create or replace view v_grade_center as
with weekly as (
  select distinct on (dir.student_id, wk.week_number)
    dir.student_id,
    wk.week_number,
    sub.id as submission_id,
    sub.form_code,
    sub.submitted_at
  from v_students_directory dir
  join submissions sub
    on sub.student_id = dir.student_id
   and sub.form_code in ('form_busqueda', 'form_practicas')
  left join job_search_logs jsl on jsl.submission_id = sub.id
  left join internship_logs il  on il.submission_id  = sub.id
  cross join lateral (
    select public.resolved_week_number(
             dir.group_id, sub.week_start, sub.week_end,
             coalesce(jsl.week_number_override, il.week_number_override)
           ) as week_number
  ) wk
  where dir.group_id is not null
  order by dir.student_id, wk.week_number, sub.submitted_at desc, sub.id
)
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
  gw.week_number,
  gw.week_start,
  gw.week_end,
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
  end as state,
  case
    when rep.submitted_at is null then null
    else rep.submitted_at > ((gw.week_end + 1)::timestamp at time zone 'America/Monterrey')
  end as is_late
from v_students_directory dir
join group_weeks gw on gw.group_id = dir.group_id
left join weekly rep
  on rep.student_id = dir.student_id
 and rep.week_number = gw.week_number
left join grade_activities ga on ga.group_id = dir.group_id
left join grades gr
  on gr.student_id = dir.student_id
 and gr.group_id = dir.group_id
 and gr.week_number = gw.week_number
where dir.group_id is not null;

alter view v_grade_center set (security_invoker = on);
grant select on v_grade_center to authenticated;
