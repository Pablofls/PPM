-- 0050_notices.sql — Notificaciones internas: avisos del profesor y calificaciones
-- Ver docs/DATABASE_SCHEMA.md#avisos-y-notificaciones
--
-- El portal del alumno tiene una campanita arriba a la derecha. Le llegan dos
-- cosas:
--   1. Sus calificaciones: cada vez que el profesor guarda una (con o sin
--      comentario) en Calificar, le aparece con su puntaje y el comentario.
--      Si la vuelve a calificar, aparece otra vez como nueva.
--   2. Avisos: un mensaje (asunto y texto) que el profesor le manda a un
--      alumno desde su ADN Profesional, o a todo un grupo desde «Avisos».
--
-- Modelo (hasta 4FN):
--   * notices(id → sender_id, subject, body, sent_at)
--       El aviso. Todo depende de la llave.
--   * notice_recipients(notice_id, student_id → read_at)
--       A quién le llegó y cuándo lo leyó. read_at depende de la llave
--       completa (lo lee cada alumno por su lado).
--   * notice_groups(notice_id, group_id)            todo-llave
--       A qué grupo se dirigió, si fue a un grupo.
--     Destinatarios y grupos son dos hechos MULTIVALUADOS INDEPENDIENTES del
--     aviso: guardarlos en una sola tabla (notice_id, student_id, group_id)
--     obligaría a repetir cada combinación, que es justo lo que prohíbe la
--     4FN. Por eso son dos tablas. Los destinatarios se fijan al enviar:
--     quien entra al grupo después no recibe avisos viejos (como un correo),
--     así que no se pueden derivar del grupo y se guardan.
--   * grade_reads(student_id, group_id, week_number → read_at)
--       Cuándo vio el alumno su calificación. Misma llave que `grades`, con
--       FK a ella: si se quita la calificación, se va con ella.
--
-- Lo que NO se guarda, porque se deriva:
--   * la notificación de una calificación: ES la fila de `grades` (puntaje,
--     comentario, graded_at). Guardar una copia la desfasaría al recalificar.
--   * «sin leer» de una calificación: no hay grade_reads, o read_at <
--     graded_at (set_grade actualiza graded_at en cada guardado, así que
--     recalificar la vuelve nueva).
--
-- Al ejecutar esta migración, las calificaciones que ya existen se marcan
-- como vistas: el alumno las encuentra en Calificaciones (0049) y no le
-- llegan de golpe veinte notificaciones viejas.
--
-- Seguridad:
--   * Nadie escribe directo en estas tablas: no hay políticas de INSERT,
--     UPDATE ni DELETE. Se escribe con las funciones de abajo.
--   * Enviar: admin, o «Puede editar» en la pantalla nueva `avisos`, y solo a
--     sus alumnos y grupos (visible_*_ids(), 0036).
--   * El alumno lee lo suyo (current_student_id()) y solo marca como leído lo
--     suyo, con funciones acotadas a sí mismo. En «Ver como Alumno» el admin
--     no tiene current_student_id(): no marca nada.
--   * El staff lee lo de sus alumnos/grupos con la pantalla `avisos`
--     (y grade_reads con `calificaciones`), para ver quién ya lo leyó.

-- ---------------------------------------------------------------------------
-- Pantalla nueva del panel
-- ---------------------------------------------------------------------------
insert into app_screens (code, max_access, audience)
values ('avisos', 'edicion', 'panel');

insert into role_screen_access (role_code, screen_code, access) values
  ('maestro',     'avisos', 'edicion'),
  ('coordinador', 'avisos', 'lectura');

-- ---------------------------------------------------------------------------
-- notices
-- ---------------------------------------------------------------------------
create table notices (
  id        uuid primary key default gen_random_uuid(),
  sender_id uuid references profiles (id) on delete set null,
  subject   text not null,
  body      text not null,
  sent_at   timestamptz not null default now(),

  constraint notices_asunto check (char_length(btrim(subject)) between 1 and 150),
  constraint notices_mensaje check (char_length(btrim(body)) between 1 and 5000)
);

create index idx_notices_sender on notices (sender_id);

-- ---------------------------------------------------------------------------
-- notice_recipients
-- ---------------------------------------------------------------------------
create table notice_recipients (
  notice_id  uuid not null references notices (id) on delete cascade,
  student_id uuid not null references students (id) on delete cascade,
  read_at    timestamptz,

  primary key (notice_id, student_id)
);

create index idx_notice_recipients_student on notice_recipients (student_id, read_at);

-- ---------------------------------------------------------------------------
-- notice_groups
-- ---------------------------------------------------------------------------
create table notice_groups (
  notice_id uuid not null references notices (id) on delete cascade,
  group_id  uuid not null references groups (id) on delete cascade,

  primary key (notice_id, group_id)
);

create index idx_notice_groups_group on notice_groups (group_id);

-- ---------------------------------------------------------------------------
-- grade_reads
-- ---------------------------------------------------------------------------
create table grade_reads (
  student_id  uuid     not null,
  group_id    uuid     not null,
  week_number smallint not null,
  read_at     timestamptz not null default now(),

  primary key (student_id, group_id, week_number),
  foreign key (student_id, group_id, week_number)
    references grades (student_id, group_id, week_number) on delete cascade
);

-- Lo ya calificado no llega como notificación nueva (ver encabezado).
insert into grade_reads (student_id, group_id, week_number, read_at)
select student_id, group_id, week_number, now() from grades;

-- ---------------------------------------------------------------------------
-- RLS: lectura por alcance; sin escritura directa
-- ---------------------------------------------------------------------------
alter table notices           enable row level security;
alter table notice_recipients enable row level security;
alter table notice_groups     enable row level security;
alter table grade_reads       enable row level security;

-- notice_recipients (las demás se apoyan en esta)
create policy notice_recipients_select_admin on notice_recipients
  for select to authenticated using ((select public.is_admin()));
create policy notice_recipients_select_own on notice_recipients
  for select to authenticated using (student_id = (select public.current_student_id()));
create policy notice_recipients_select_scope on notice_recipients
  for select to authenticated
  using (
    (select public.screen_access('avisos')) >= 'lectura'
    and student_id in (select public.visible_student_ids())
  );

-- notices: lo ve quien ve alguno de sus destinatarios, y quien lo mandó.
create policy notices_select_admin on notices
  for select to authenticated using ((select public.is_admin()));
create policy notices_select_own on notices
  for select to authenticated
  using (
    exists (
      select 1 from notice_recipients r
      where r.notice_id = notices.id
        and r.student_id = (select public.current_student_id())
    )
  );
create policy notices_select_scope on notices
  for select to authenticated
  using (
    (select public.screen_access('avisos')) >= 'lectura'
    and (
      sender_id = (select auth.uid())
      or exists (
        select 1 from notice_recipients r
        where r.notice_id = notices.id
          and r.student_id in (select public.visible_student_ids())
      )
    )
  );

-- notice_groups
create policy notice_groups_select_admin on notice_groups
  for select to authenticated using ((select public.is_admin()));
create policy notice_groups_select_own on notice_groups
  for select to authenticated
  using (
    exists (
      select 1 from notice_recipients r
      where r.notice_id = notice_groups.notice_id
        and r.student_id = (select public.current_student_id())
    )
  );
create policy notice_groups_select_scope on notice_groups
  for select to authenticated
  using (
    (select public.screen_access('avisos')) >= 'lectura'
    and group_id in (select public.visible_group_ids())
  );

-- grade_reads: el maestro ve si el alumno ya vio su calificación.
create policy grade_reads_select_admin on grade_reads
  for select to authenticated using ((select public.is_admin()));
create policy grade_reads_select_own on grade_reads
  for select to authenticated using (student_id = (select public.current_student_id()));
create policy grade_reads_select_scope on grade_reads
  for select to authenticated
  using (
    (select public.screen_access('calificaciones')) >= 'lectura'
    and group_id in (select public.visible_group_ids())
  );

grant select on notices, notice_recipients, notice_groups, grade_reads to authenticated;

-- ---------------------------------------------------------------------------
-- send_notice(): manda un aviso a alumnos y/o grupos
-- ---------------------------------------------------------------------------
-- Destinatarios = los alumnos dados ∪ los inscritos en los grupos dados.
-- Devuelve el id del aviso.
create or replace function public.send_notice(
  p_subject     text,
  p_body        text,
  p_student_ids uuid[] default null,
  p_group_ids   uuid[] default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_subject  text := btrim(coalesce(p_subject, ''));
  v_body     text := btrim(coalesce(p_body, ''));
  v_students uuid[] := coalesce(p_student_ids, '{}');
  v_groups   uuid[] := coalesce(p_group_ids, '{}');
  v_id       uuid;
  v_count    integer;
begin
  if not (public.is_admin() or public.can_edit_screen('avisos')) then
    raise exception 'No tienes permiso para enviar avisos.';
  end if;

  if v_subject = '' then
    raise exception 'Escribe el asunto del aviso.';
  end if;
  if char_length(v_subject) > 150 then
    raise exception 'El asunto no puede pasar de 150 caracteres.';
  end if;
  if v_body = '' then
    raise exception 'Escribe el mensaje del aviso.';
  end if;
  if char_length(v_body) > 5000 then
    raise exception 'El mensaje no puede pasar de 5000 caracteres.';
  end if;
  if cardinality(v_students) = 0 and cardinality(v_groups) = 0 then
    raise exception 'Elige a quién mandar el aviso.';
  end if;

  if not public.is_admin() then
    if exists (
      select 1 from unnest(v_students) s(id)
      where s.id not in (select public.visible_student_ids())
    ) then
      raise exception 'Solo puedes mandar avisos a tus alumnos.';
    end if;
    if exists (
      select 1 from unnest(v_groups) g(id)
      where g.id not in (select public.visible_group_ids())
    ) then
      raise exception 'Solo puedes mandar avisos a tus grupos.';
    end if;
  end if;

  insert into notices (sender_id, subject, body)
  values (auth.uid(), v_subject, v_body)
  returning id into v_id;

  insert into notice_groups (notice_id, group_id)
  select distinct v_id, g.id
  from unnest(v_groups) g(id)
  join groups on groups.id = g.id;

  insert into notice_recipients (notice_id, student_id)
  select v_id, x.student_id
  from (
    select s.id as student_id from unnest(v_students) s(id)
    union
    select e.student_id from student_enrollments e where e.group_id = any (v_groups)
  ) x
  join students st on st.id = x.student_id;

  get diagnostics v_count = row_count;
  if v_count = 0 then
    raise exception 'Ese grupo todavía no tiene alumnos inscritos.';
  end if;

  return v_id;
end;
$$;

revoke execute on function public.send_notice(text, text, uuid[], uuid[]) from public, anon;
grant  execute on function public.send_notice(text, text, uuid[], uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Marcar como leído: solo lo del alumno de la sesión
-- ---------------------------------------------------------------------------
create or replace function public.mark_notice_read(p_notice_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update notice_recipients
  set read_at = now()
  where notice_id = p_notice_id
    and student_id = public.current_student_id()
    and read_at is null;
$$;

create or replace function public.mark_grade_read(p_group_id uuid, p_week_number smallint)
returns void
language sql
security definer
set search_path = public
as $$
  insert into grade_reads (student_id, group_id, week_number, read_at)
  select g.student_id, g.group_id, g.week_number, now()
  from grades g
  where g.student_id = public.current_student_id()
    and g.group_id = p_group_id
    and g.week_number = p_week_number
  on conflict (student_id, group_id, week_number) do update
    set read_at = excluded.read_at;
$$;

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
end;
$$;

revoke execute on function public.mark_notice_read(uuid)                 from public, anon;
revoke execute on function public.mark_grade_read(uuid, smallint)        from public, anon;
revoke execute on function public.mark_all_notifications_read()          from public, anon;
grant  execute on function public.mark_notice_read(uuid)                 to authenticated;
grant  execute on function public.mark_grade_read(uuid, smallint)        to authenticated;
grant  execute on function public.mark_all_notifications_read()          to authenticated;

-- ---------------------------------------------------------------------------
-- notification_sender_name(): quién manda el aviso o puso la calificación
-- ---------------------------------------------------------------------------
-- El alumno no lee `profiles` (0001). Esta función le da SOLO el nombre, y
-- solo de quien le mandó un aviso o lo calificó; al staff, de cualquiera.
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
    );
$$;

revoke execute on function public.notification_sender_name(uuid) from public, anon;
grant  execute on function public.notification_sender_name(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- v_my_notifications — la campanita: avisos + calificaciones
-- ---------------------------------------------------------------------------
-- Una fila por notificación. El alumno ve solo lo suyo por RLS; el admin en
-- «Ver como Alumno» filtra por student_id.
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
  exists (select 1 from notice_groups ng where ng.notice_id = n.id) as to_group
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
  false
from grades g
left join grade_activities ga on ga.group_id = g.group_id
left join grade_reads gr
  on gr.student_id = g.student_id
 and gr.group_id = g.group_id
 and gr.week_number = g.week_number;

alter view v_my_notifications set (security_invoker = on);
grant select on v_my_notifications to authenticated;

-- ---------------------------------------------------------------------------
-- v_sent_notices — los avisos enviados, para el profesor
-- ---------------------------------------------------------------------------
-- Por aviso: a qué grupos se dirigió, en qué grupos están sus destinatarios
-- (para filtrar por el grupo elegido), cuántos lo recibieron y cuántos lo
-- leyeron. Con RLS, el maestro cuenta solo a sus alumnos.
create or replace view v_sent_notices as
select
  n.id                                          as notice_id,
  n.subject,
  n.body,
  n.sent_at,
  n.sender_id,
  public.notification_sender_name(n.sender_id)  as sender_name,
  coalesce(
    (select array_agg(ng.group_id) from notice_groups ng where ng.notice_id = n.id),
    '{}'
  )                                             as target_group_ids,
  coalesce(
    (select array_agg(distinct e.group_id)
     from notice_recipients r2
     join student_enrollments e on e.student_id = r2.student_id
     where r2.notice_id = n.id),
    '{}'
  )                                             as recipient_group_ids,
  array_agg(r.student_id)                       as student_ids,
  count(*)                                      as recipient_count,
  count(r.read_at)                              as read_count
from notices n
join notice_recipients r on r.notice_id = n.id
group by n.id;

alter view v_sent_notices set (security_invoker = on);
grant select on v_sent_notices to authenticated;

-- ---------------------------------------------------------------------------
-- v_grade_center — agrega al final `seen_at` (cuándo vio el alumno la
-- calificación vigente; nulo si no la ha visto). Mismas columnas que 0046.
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
  end as is_late,
  case when grr.read_at >= gr.graded_at then grr.read_at end as seen_at
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
left join grade_reads grr
  on grr.student_id = gr.student_id
 and grr.group_id = gr.group_id
 and grr.week_number = gr.week_number
where dir.group_id is not null;

alter view v_grade_center set (security_invoker = on);
grant select on v_grade_center to authenticated;
