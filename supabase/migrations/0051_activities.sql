-- 0051_activities.sql — Actividades: publicar, programar y cerrar (estilo Canvas)
-- Ver docs/DATABASE_SCHEMA.md#actividades
--
-- Hasta 0050 una «fecha de entrega» era solo una fecha límite por grupo y
-- formulario (group_deadlines, 0046), y el portal mostraba siempre las dos
-- bitácoras. Ahora cada formulario asignado a un grupo es una ACTIVIDAD, como
-- una tarea de Canvas:
--
--   * is_published     borrador o publicada.
--   * available_from   «Disponible desde»: antes de esa hora el alumno no la ve
--                      (programar la publicación).
--   * due_at           «Fecha de entrega»: lo que llegue después es tardío.
--   * available_until  «Disponible hasta»: después ya no se puede entregar; el
--                      alumno la ve Cerrada, con lo que entregó.
--
-- Todavía no se crean formularios nuevos: las actividades son los formularios
-- del catálogo `forms`. Una por grupo y formulario, sembradas para todos los
-- grupos (y para cada grupo nuevo, con un trigger). Los 12 formularios que se
-- contestan en Google Forms solo usan due_at (Estado de Entregas); en el
-- portal se ven únicamente las que se contestan en el panel.
--
-- Normalización (4FN): llave (group_id, form_code); instrucciones, publicación
-- y las tres fechas dependen de la llave completa y de nada más. «Programada»,
-- «Abierta», «Tardía» y «Cerrada» se DERIVAN de las fechas y de now(); no se
-- guardan (mismo criterio que la entrega tardía de 0043). group_deadlines
-- desaparece: su único dato (due_at) vive ahora aquí, y tenerlo en dos lugares
-- sería guardar el mismo hecho dos veces.
--
-- Permisos: la pantalla «Fechas de entrega» se convierte en «Actividades»
-- (incluye las semanas del semestre). Quien tenía la una tiene la otra;
-- además, maestro y coordinador pueden editar, siempre en sus grupos.
--
-- Al ejecutar nada cambia para el alumno: las bitácoras quedan publicadas y
-- sin ventana, y las fechas existentes se copian tal cual.

-- ---------------------------------------------------------------------------
-- activities
-- ---------------------------------------------------------------------------
create table activities (
  group_id        uuid        not null references groups (id) on delete cascade,
  form_code       text        not null references forms (code),
  instructions    text,
  is_published    boolean     not null default false,
  available_from  timestamptz,
  due_at          timestamptz,
  available_until timestamptz,
  updated_at      timestamptz not null default now(),

  primary key (group_id, form_code),
  constraint activities_instrucciones_largo
    check (instructions is null or char_length(instructions) <= 5000),
  constraint activities_desde_antes_de_entrega
    check (available_from is null or due_at is null or available_from <= due_at),
  constraint activities_entrega_antes_de_hasta
    check (due_at is null or available_until is null or due_at <= available_until),
  constraint activities_desde_antes_de_hasta
    check (available_from is null or available_until is null or available_from < available_until)
);

create index idx_activities_form on activities (form_code);

-- Lo que nace publicado: todo menos el 1.0, que hasta ahora se contestaba
-- solo en Google Forms (se abre en el panel en la fase siguiente).
create or replace function public.default_activity_published(p_form_code text)
returns boolean
language sql
immutable
as $$
  select p_form_code <> 'form1_0'
$$;

-- ---------------------------------------------------------------------------
-- Datos: una actividad por grupo × formulario; las fechas de 0046 se copian
-- ---------------------------------------------------------------------------
insert into activities (group_id, form_code, is_published, due_at)
select g.id, f.code, public.default_activity_published(f.code), gd.due_at
from groups g
cross join forms f
left join group_deadlines gd on gd.group_id = g.id and gd.form_code = f.code;

-- Cada grupo nuevo nace con sus actividades (sin fechas).
create or replace function public.seed_group_activities()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into activities (group_id, form_code, is_published)
  select new.id, f.code, public.default_activity_published(f.code)
  from forms f
  on conflict (group_id, form_code) do nothing;
  return new;
end;
$$;

create trigger groups_seed_activities
  after insert on groups
  for each row execute function public.seed_group_activities();

-- ---------------------------------------------------------------------------
-- RLS — lectura por alcance; el alumno ve las de su grupo ya publicadas
-- ---------------------------------------------------------------------------
-- Sin política restrictiva de pantalla, igual que group_weeks: las fechas no
-- llevan datos personales y las vistas de Estado de Entregas las necesitan.
alter table activities enable row level security;

create policy activities_select_admin on activities
  for select to authenticated using (public.is_admin());
create policy activities_select_scope on activities
  for select to authenticated using (group_id in (select public.visible_group_ids()));
-- «Oculta antes»: antes de available_from la fila no existe para el alumno.
-- Después de available_until la sigue viendo (Cerrada).
create policy activities_select_own on activities
  for select to authenticated using (
    group_id = (select public.current_student_group_id())
    and is_published
    and (available_from is null or available_from <= now())
  );

grant select on activities to authenticated;

-- ---------------------------------------------------------------------------
-- Pantalla «Actividades» en lugar de «Fechas de entrega»
-- ---------------------------------------------------------------------------
insert into app_screens (code, max_access, audience)
values ('actividades', 'edicion', 'panel');

insert into role_screen_access (role_code, screen_code, access)
select role_code, 'actividades', access
from role_screen_access
where screen_code = 'fechas_entrega';

insert into role_screen_access (role_code, screen_code, access)
select r.code, 'actividades', 'edicion'
from (values ('maestro'), ('coordinador')) r(code)
on conflict (role_code, screen_code) do update set access = excluded.access;

insert into user_screen_access (user_id, screen_code, access)
select user_id, 'actividades', access
from user_screen_access
where screen_code = 'fechas_entrega';

-- on delete cascade limpia role_screen_access y user_screen_access.
delete from app_screens where code = 'fechas_entrega';

-- Semanas y actividades: quien edita «Actividades», en sus grupos.
create or replace function public.can_edit_group_dates(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin()
      or (
        public.can_edit_screen('actividades')
        and p_group_id in (select public.visible_group_ids())
      )
$$;

-- ---------------------------------------------------------------------------
-- Escritura: guardar una actividad y publicarla / despublicarla
-- ---------------------------------------------------------------------------
-- Las fechas llegan como hora local de Monterrey (lo que el profesor escribe
-- en el formulario) y aquí se vuelven timestamptz. Así el cliente no tiene
-- que saber el desfase.
create or replace function public.save_activity(
  p_group_id        uuid,
  p_form_code       text,
  p_instructions    text,
  p_is_published    boolean,
  p_available_from  timestamp,
  p_due_at          timestamp,
  p_available_until timestamp
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

  insert into activities (
    group_id, form_code, instructions, is_published,
    available_from, due_at, available_until, updated_at
  )
  values (
    p_group_id, p_form_code, nullif(btrim(p_instructions), ''),
    coalesce(p_is_published, false), v_from, v_due, v_until, now()
  )
  on conflict (group_id, form_code) do update set
    instructions    = excluded.instructions,
    is_published    = excluded.is_published,
    available_from  = excluded.available_from,
    due_at          = excluded.due_at,
    available_until = excluded.available_until,
    updated_at      = now();
end;
$$;

create or replace function public.set_activity_published(
  p_group_id  uuid,
  p_form_code text,
  p_published boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_edit_group_dates(p_group_id) then
    raise exception 'No tienes permiso para configurar las actividades de ese grupo.';
  end if;

  update activities
  set is_published = coalesce(p_published, false), updated_at = now()
  where group_id = p_group_id and form_code = p_form_code;

  if not found then
    raise exception 'Esa actividad no existe.';
  end if;
end;
$$;

revoke execute on function public.save_activity(uuid, text, text, boolean, timestamp, timestamp, timestamp) from public, anon;
revoke execute on function public.set_activity_published(uuid, text, boolean) from public, anon;
grant  execute on function public.save_activity(uuid, text, text, boolean, timestamp, timestamp, timestamp) to authenticated;
grant  execute on function public.set_activity_published(uuid, text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- ¿El alumno de la sesión puede entregar este formulario ahora?
-- ---------------------------------------------------------------------------
-- Publicada, ya empezó y no ha cerrado. Es la única puerta: la usan las
-- políticas de abajo y la interfaz la refleja (Programada / Cerrada).
create or replace function public.activity_is_open(p_form_code text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select a.is_published
       and (a.available_from  is null or a.available_from  <= now())
       and (a.available_until is null or a.available_until >  now())
    from activities a
    where a.group_id = public.current_student_group_id()
      and a.form_code = p_form_code
  ), false)
$$;

revoke execute on function public.activity_is_open(text) from public, anon;
grant  execute on function public.activity_is_open(text) to authenticated;

-- Restrictivas: solo muerden a una sesión de alumno. El staff y la
-- sincronización del Sheets (current_student_id() nulo) no cambian.
create policy submissions_activity_open on submissions
  as restrictive for insert to authenticated
  with check (
    public.current_student_id() is null
    or public.activity_is_open(form_code)
  );

-- Corregir la semana en curso (0020) también exige que la actividad siga abierta.
create policy job_search_logs_activity_open on job_search_logs
  as restrictive for update to authenticated
  using (
    public.current_student_id() is null
    or public.activity_is_open('form_busqueda')
  );

create policy internship_logs_activity_open on internship_logs
  as restrictive for update to authenticated
  using (
    public.current_student_id() is null
    or public.activity_is_open('form_practicas')
  );

-- ---------------------------------------------------------------------------
-- Las fechas límite salen de activities
-- ---------------------------------------------------------------------------
-- Solo cuenta la fecha de una actividad publicada: un borrador no vence.
create or replace function public.group_form_deadline(p_group_id uuid, p_form_code text)
returns timestamptz
language sql
stable
as $$
  select due_at from activities
  where group_id = p_group_id and form_code = p_form_code and is_published
$$;

-- Igual que en 0046, ahora con el 1.0: también tiene fecha de entrega.
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
  select code from forms
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
-- Fuera group_deadlines y sus funciones
-- ---------------------------------------------------------------------------
drop function public.set_group_deadlines(uuid, text[], timestamptz);
drop function public.delete_group_deadline(uuid, text);
drop table group_deadlines;
