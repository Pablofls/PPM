-- 0035_roles.sql — Varios roles por persona: maestro, coordinador, administrador
-- Ver docs/DATABASE_SCHEMA.md#roles y docs/AUTH.md
--
-- Fase 2 de «varios maestros, coordinadores y administradores». Hasta aquí
-- cada cuenta tenía UN rol en `profiles.role` (admin, alumno, pendiente).
-- Ahora una persona puede tener varios —René es administrador Y maestro— y
-- aparecen dos roles nuevos:
--
--   * maestro      imparte grupos (groups.teacher_id).
--   * coordinador  supervisa a los maestros que el admin le asigna.
--   * admin        ve todo y administra.
--   * alumno       su portal. Es EXCLUSIVO: no se combina con otro rol.
--
-- «Pendiente» deja de ser un valor: es no tener ningún rol.
--
-- Modelo (4FN):
--   * roles(code)                         catálogo; el nombre visible vive en la interfaz.
--   * user_roles(user_id, role_code)      llave = las dos columnas, sin atributos
--     propios → todo-llave, BCNF. Los roles de una persona son UN hecho
--     multivaluado (user ↠ role) y es lo único que guarda la tabla, así que no
--     hay dos dependencias multivaluadas independientes mezcladas: 4FN.
--   * coordinator_teachers(coordinator_id, teacher_id)   todo-llave, igual.
--     Va en su propia tabla y no en user_roles a propósito: «A coordina a B»
--     es independiente de «A tiene los roles X, Y»; juntarlos en una tabla
--     (user, role, teacher) sería justo la violación de 4FN de dos MVD
--     independientes.
--   * profiles.role se ELIMINA (y el tipo app_role): sería el mismo hecho
--     guardado dos veces.
--
-- Esta migración define el modelo y las funciones de alcance. Las políticas
-- que dejan a maestros y coordinadores leer a SUS alumnos van en 0036.

-- ---------------------------------------------------------------------------
-- roles
-- ---------------------------------------------------------------------------
create table roles (
  code text primary key,
  constraint roles_codigo_valido check (code ~ '^[a-z_]+$')
);

insert into roles (code) values ('admin'), ('coordinador'), ('maestro'), ('alumno');

alter table roles enable row level security;

-- ---------------------------------------------------------------------------
-- user_roles
-- ---------------------------------------------------------------------------
create table user_roles (
  user_id    uuid not null references profiles (id) on delete cascade,
  role_code  text not null references roles (code),
  created_at timestamptz not null default now(),

  primary key (user_id, role_code)
);

create index idx_user_roles_role on user_roles (role_code);

alter table user_roles enable row level security;

-- Backfill: el rol que cada quien tenía. 'pendiente' no se copia: es no tener rol.
insert into user_roles (user_id, role_code)
select id, role::text from profiles where role::text in ('admin', 'alumno');

-- Quien imparte grupos (0032) es maestro: hoy, René.
insert into user_roles (user_id, role_code)
select distinct teacher_id, 'maestro' from groups
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- coordinator_teachers
-- ---------------------------------------------------------------------------
create table coordinator_teachers (
  coordinator_id uuid not null references profiles (id) on delete cascade,
  teacher_id     uuid not null references profiles (id) on delete cascade,
  created_at     timestamptz not null default now(),

  primary key (coordinator_id, teacher_id),
  constraint coordinator_teachers_distintos check (coordinator_id <> teacher_id)
);

create index idx_coordinator_teachers_teacher on coordinator_teachers (teacher_id);

alter table coordinator_teachers enable row level security;

-- ---------------------------------------------------------------------------
-- Funciones de rol
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER por la misma razón que is_admin() en 0001: las consultan
-- políticas de tablas con RLS, y sin esto se dispararían a sí mismas.

create or replace function public.has_role(p_role text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.profiles p on p.id = ur.user_id
    where ur.user_id = (select auth.uid())
      and ur.role_code = p_role
      and p.is_active
  );
$$;

revoke execute on function public.has_role(text) from public, anon;
grant execute on function public.has_role(text) to authenticated;

-- Misma firma que en 0001: las ~40 políticas que la usan no cambian.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_role('admin');
$$;

-- Cualquiera de los tres roles del panel.
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_role('admin') or public.has_role('coordinador') or public.has_role('maestro');
$$;

revoke execute on function public.is_staff() from public, anon;
grant execute on function public.is_staff() to authenticated;

-- Misma firma que en 0014; ahora el rol sale de user_roles.
create or replace function public.current_student_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.student_id
  from public.profiles p
  where p.id = (select auth.uid())
    and p.is_active
    and public.has_role('alumno');
$$;

-- ---------------------------------------------------------------------------
-- Alcance: qué grupos, alumnos y maestros ve quien enseña o coordina
-- ---------------------------------------------------------------------------
-- No incluyen el camino del admin: el admin ya lo ve todo por sus políticas
-- `*_select_admin`. Estas alimentan las políticas `*_select_scope` de 0036.

-- Los maestros que «me tocan»: yo, si soy maestro, y los que coordino.
create or replace function public.visible_teacher_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) where public.has_role('maestro')
  union
  select ct.teacher_id
  from public.coordinator_teachers ct
  where ct.coordinator_id = (select auth.uid())
    and public.has_role('coordinador');
$$;

create or replace function public.visible_group_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select g.id
  from public.groups g
  where g.teacher_id in (select public.visible_teacher_ids());
$$;

create or replace function public.visible_student_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select distinct e.student_id
  from public.student_enrollments e
  where e.group_id in (select public.visible_group_ids());
$$;

revoke execute on function public.visible_teacher_ids() from public, anon;
revoke execute on function public.visible_group_ids()   from public, anon;
revoke execute on function public.visible_student_ids() from public, anon;
grant execute on function public.visible_teacher_ids() to authenticated;
grant execute on function public.visible_group_ids()   to authenticated;
grant execute on function public.visible_student_ids() to authenticated;

-- ---------------------------------------------------------------------------
-- Reglas de los roles (antes guard_profile_role(), 0001)
-- ---------------------------------------------------------------------------
-- RLS dice qué filas; esto dice qué combinaciones son válidas.
--
-- auth.uid() nulo = SQL Editor o service_role (la sincronización): contextos
-- administrativos, como en 0001. Es la única forma de dar el primer rol.
create or replace function public.guard_user_roles()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null and not public.is_admin() then
    raise exception 'Solo un administrador puede asignar o quitar roles';
  end if;

  if tg_op = 'INSERT' then
    if new.role_code = 'alumno' and exists (
      select 1 from public.user_roles
      where user_id = new.user_id and role_code <> 'alumno'
    ) then
      raise exception 'Una cuenta de alumno no puede tener otro rol';
    end if;
    if new.role_code <> 'alumno' and exists (
      select 1 from public.user_roles
      where user_id = new.user_id and role_code = 'alumno'
    ) then
      raise exception 'Una cuenta de alumno no puede tener otro rol';
    end if;
    return new;
  end if;

  -- DELETE
  if old.role_code = 'admin' and old.user_id = (select auth.uid()) then
    raise exception 'Un administrador no puede quitarse su propio rol de administrador';
  end if;
  if old.role_code = 'maestro' and exists (
    select 1 from public.groups where teacher_id = old.user_id
  ) then
    raise exception 'El maestro todavía tiene grupos: reasígnalos antes de quitarle el rol';
  end if;
  if old.role_code = 'maestro' and exists (
    select 1 from public.coordinator_teachers where teacher_id = old.user_id
  ) then
    raise exception 'El maestro todavía está asignado a un coordinador';
  end if;
  if old.role_code = 'coordinador' and exists (
    select 1 from public.coordinator_teachers where coordinator_id = old.user_id
  ) then
    raise exception 'El coordinador todavía tiene maestros asignados';
  end if;
  return old;
end;
$$;

create trigger user_roles_guard
  before insert or delete on user_roles
  for each row
  execute function public.guard_user_roles();

-- Sin UPDATE: cambiar de rol es quitar uno y poner otro.
revoke update on user_roles from authenticated;

-- Un grupo solo lo imparte un maestro; un coordinador solo coordina maestros.
create or replace function public.guard_groups_teacher()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.user_roles
    where user_id = new.teacher_id and role_code = 'maestro'
  ) then
    raise exception 'El maestro del grupo tiene que tener el rol de maestro';
  end if;
  return new;
end;
$$;

create trigger groups_teacher_is_maestro
  before insert or update of teacher_id on groups
  for each row
  execute function public.guard_groups_teacher();

create or replace function public.guard_coordinator_teachers()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null and not public.is_admin() then
    raise exception 'Solo un administrador puede asignar maestros a un coordinador';
  end if;
  if not exists (
    select 1 from public.user_roles
    where user_id = new.coordinator_id and role_code = 'coordinador'
  ) then
    raise exception 'Solo se le asignan maestros a quien tiene el rol de coordinador';
  end if;
  if not exists (
    select 1 from public.user_roles
    where user_id = new.teacher_id and role_code = 'maestro'
  ) then
    raise exception 'Solo se pueden asignar cuentas con el rol de maestro';
  end if;
  return new;
end;
$$;

create trigger coordinator_teachers_guard
  before insert on coordinator_teachers
  for each row
  execute function public.guard_coordinator_teachers();

-- ---------------------------------------------------------------------------
-- RLS de las tablas nuevas
-- ---------------------------------------------------------------------------
-- Sin políticas de escritura: las escriben el SQL Editor y, en la fase de
-- usuarios, funciones SECURITY DEFINER.
create policy roles_select_staff on roles
  for select to authenticated using (public.is_staff());

create policy user_roles_select on user_roles
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());

create policy coordinator_teachers_select on coordinator_teachers
  for select to authenticated
  using (
    coordinator_id = (select auth.uid())
    or teacher_id = (select auth.uid())
    or public.is_admin()
  );

grant select on roles, user_roles, coordinator_teachers to authenticated;

-- ---------------------------------------------------------------------------
-- profiles.role y app_role, fuera
-- ---------------------------------------------------------------------------
drop trigger profiles_guard_role on profiles;
drop function public.guard_profile_role();

-- updated_at lo mantenía guard_profile_role(); se conserva con su propio trigger.
create or replace function public.touch_profile()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch
  before update on profiles
  for each row
  execute function public.touch_profile();

alter table profiles drop column role;   -- se lleva idx_profiles_admins
drop type app_role;

-- ---------------------------------------------------------------------------
-- v_users — cada cuenta con sus roles
-- ---------------------------------------------------------------------------
-- Derivada al leer: `roles` es un arreglo armado de user_roles, no se guarda.
-- Con security_invoker cada quien ve lo que RLS le deja: el admin, a todos;
-- el resto, su propia fila y los maestros que le tocan.
create view v_users as
select
  p.id,
  p.email,
  p.first_name,
  p.last_name,
  p.is_active,
  p.student_id,
  coalesce(
    (select array_agg(ur.role_code order by ur.role_code)
     from user_roles ur where ur.user_id = p.id),
    '{}'
  ) as roles
from profiles p;

alter view v_users set (security_invoker = on);
grant select on v_users to authenticated;

-- ---------------------------------------------------------------------------
-- admin_create_group() — el maestro tiene que tener el rol de maestro
-- ---------------------------------------------------------------------------
-- Igual que en 0032; antes un «maestro» era cualquier admin activo.
create or replace function public.admin_create_group(
  p_period_code text,
  p_session_day session_day,
  p_language    language,
  p_teacher_id  uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_per text := upper(btrim(coalesce(p_period_code, '')));
  v_id  uuid;
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador puede crear grupos';
  end if;
  if v_per !~ '^[A-Z]{2}-[0-9]{2}$' then
    raise exception 'Periodo inválido (formato PR-26)';
  end if;
  if p_session_day is null or p_language is null then
    raise exception 'Faltan la frecuencia o el idioma';
  end if;
  if not exists (
    select 1 from profiles p
    join user_roles ur on ur.user_id = p.id and ur.role_code = 'maestro'
    where p.id = p_teacher_id and p.is_active
  ) then
    raise exception 'El maestro no existe, no está activo o no tiene el rol de maestro';
  end if;

  insert into periods (code) values (v_per) on conflict do nothing;

  insert into groups (period_code, session_day, language, teacher_id)
  values (v_per, p_session_day, p_language, p_teacher_id)
  returning id into v_id;

  perform public.assign_students_to_groups();

  return v_id;
exception
  when unique_violation then
    raise exception 'Ese grupo ya existe';
end;
$$;

-- ---------------------------------------------------------------------------
-- create_student_accounts() — el rol `alumno` va a user_roles
-- ---------------------------------------------------------------------------
-- Igual que en 0034 salvo eso. Una cuenta que ya tiene un rol del panel (la
-- del profesor, si su correo coincide con el de un alumno) no recibe `alumno`.
create or replace function public.create_student_accounts()
returns table (student_email text, outcome text)
language plpgsql
security definer
set search_path = public, extensions, auth
as $$
declare
  alumno   record;
  nuevo_id uuid;
begin
  for alumno in
    select
      dir.student_id                        as sid,
      dir.institutional_email::text         as correo,
      nullif(btrim(dir.student_number), '') as matricula,
      dir.full_name                         as nombre
    from public.v_students_directory dir
    order by dir.institutional_email
  loop
    -- Sin matrícula no hay contraseña. Se reporta en vez de inventarle una:
    -- una contraseña por omisión sería la misma para todos.
    if alumno.matricula is null then
      student_email := alumno.correo;
      outcome := 'omitido: sin matrícula en el 1.0';
      return next;
      continue;
    end if;

    if exists (select 1 from auth.users u where u.email = alumno.correo) then
      -- La cuenta ya existe (o es la del profesor). Solo se reengancha el
      -- perfil al alumno; la contraseña no se toca. El nombre ya no se copia
      -- al perfil (0034): el del alumno vive en `demographics`.
      update public.profiles p
         set student_id = alumno.sid
       where p.email = alumno.correo;

      -- Rol `alumno`, salvo que la cuenta ya tenga un rol del panel (la del
      -- profesor): un alumno no puede tener otro rol (0035).
      insert into public.user_roles (user_id, role_code)
      select p.id, 'alumno'
      from public.profiles p
      where p.email = alumno.correo
        and not exists (
          select 1 from public.user_roles ur
          where ur.user_id = p.id and ur.role_code <> 'alumno'
        )
      on conflict do nothing;

      student_email := alumno.correo;
      outcome := 'ya existía: perfil enlazado';
      return next;
      continue;
    end if;

    nuevo_id := gen_random_uuid();

    -- email_confirmed_at con valor: son correos institucionales que el profesor
    -- da de alta, no registros abiertos. Sin esto el alumno no podría entrar
    -- hasta hacer clic en un correo de confirmación que nadie le mandó.
    --
    -- Las columnas de token se ponen en '' y no en NULL: GoTrue las lee como
    -- texto y un NULL le revienta el inicio de sesión.
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change
    )
    values (
      '00000000-0000-0000-0000-000000000000',
      nuevo_id,
      'authenticated',
      'authenticated',
      alumno.correo,
      crypt(alumno.matricula, gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', alumno.nombre),
      now(), now(),
      '', '', '', ''
    );

    -- Supabase Auth exige una identidad del proveedor `email`; sin esta fila el
    -- usuario existe pero signInWithPassword() lo rechaza.
    insert into auth.identities (
      id, user_id, provider_id, identity_data, provider,
      last_sign_in_at, created_at, updated_at
    )
    values (
      gen_random_uuid(),
      nuevo_id,
      nuevo_id::text,
      jsonb_build_object('sub', nuevo_id::text, 'email', alumno.correo, 'email_verified', true),
      'email',
      now(), now(), now()
    );

    -- El trigger on_auth_user_created ya creó el perfil, sin roles. Aquí se le
    -- pone el alumno que le toca y el rol `alumno` (0035). guard_user_roles()
    -- deja pasar el alta: o no hay sesión (SQL Editor, sincronización), o la
    -- sesión es la de un admin (admin_register_students()).
    update public.profiles
       set student_id = alumno.sid
     where id = nuevo_id;

    insert into public.user_roles (user_id, role_code)
    values (nuevo_id, 'alumno')
    on conflict do nothing;

    student_email := alumno.correo;
    outcome := 'creado';
    return next;
  end loop;
end;
$$;

revoke execute on function public.create_student_accounts() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Corrección de 0032: «un grupo por periodo» y el UPDATE
-- ---------------------------------------------------------------------------
-- En un UPDATE que cambia al alumno de grupo dentro del mismo periodo, la
-- fila que se está actualizando sigue existiendo con su grupo viejo cuando
-- corre el trigger BEFORE, y la función la tomaba por «otro grupo del mismo
-- periodo». admin_register_students() (0032) mueve así a un alumno que se
-- vuelve a registrar con otra frecuencia o idioma, y fallaba. Ahora se excluye
-- la fila vieja. admin_move_student() no lo sufría: borra e inserta.
create or replace function public.enforce_one_group_per_period()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.student_enrollments e
    join public.groups g_otro  on g_otro.id  = e.group_id
    join public.groups g_nuevo on g_nuevo.id = new.group_id
    where e.student_id = new.student_id
      and e.group_id <> new.group_id
      and g_otro.period_code = g_nuevo.period_code
      and not (tg_op = 'UPDATE' and e.student_id = old.student_id and e.group_id = old.group_id)
  ) then
    raise exception 'El alumno ya está en otro grupo de ese periodo';
  end if;
  return new;
end;
$$;
