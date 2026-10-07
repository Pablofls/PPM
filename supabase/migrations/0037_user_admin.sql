-- 0037_user_admin.sql — El admin gestiona usuarios desde el panel
-- Ver docs/DATABASE_SCHEMA.md#gestión-de-usuarios y docs/AUTH.md
--
-- Fase 3 de «varios maestros, coordinadores y administradores». Hasta aquí,
-- crear un maestro o un coordinador, darle roles o asignarle maestros a un
-- coordinador solo se podía hacer pegando SQL. Esta migración agrega las
-- funciones que usa la pantalla Configuración → Usuarios.
--
-- No hay tablas nuevas: todo se escribe sobre profiles, user_roles y
-- coordinator_teachers (0034–0035), que ya están en 4FN. Ninguna de esas
-- tablas tiene política de escritura para el navegador; la única puerta son
-- estas funciones SECURITY DEFINER, y cada una empieza comprobando is_admin()
-- (mismo patrón que admin_register_students(), 0031). Las reglas de roles
-- —alumno exclusivo, no quitarse el propio admin, no quitar un rol en uso— las
-- siguen haciendo cumplir los triggers de 0035.
--
-- Nombre y apellido de otra cuenta no necesitan función: profiles_update
-- (0001) ya deja al admin editar cualquier fila, y el permiso por columna
-- (0034) lo limita a first_name y last_name.

-- ---------------------------------------------------------------------------
-- admin_create_staff_account()
-- ---------------------------------------------------------------------------
-- Crea la cuenta de un maestro, coordinador o administrador: nombre, apellido,
-- correo, contraseña inicial y sus roles. El usuario la cambia en Mi perfil.
--
-- Escribe directo en auth.users por la misma razón que
-- create_student_accounts() (0014): el alta por API necesita la llave
-- service_role, que este proyecto no tiene. El hash es bcrypt (pgcrypto), el
-- mismo algoritmo de Supabase Auth; la contraseña en claro no se guarda.
create or replace function public.admin_create_staff_account(
  p_email      text,
  p_first_name text,
  p_last_name  text,
  p_password   text,
  p_roles      text[]
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions, auth
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_first text := nullif(btrim(coalesce(p_first_name, '')), '');
  v_last  text := nullif(btrim(coalesce(p_last_name, '')), '');
  v_id    uuid := gen_random_uuid();
  v_role  text;
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador puede crear usuarios';
  end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Correo inválido';
  end if;
  if v_first is null or v_last is null then
    raise exception 'Escribe el nombre y el apellido';
  end if;
  if length(coalesce(p_password, '')) < 8 then
    raise exception 'La contraseña inicial debe tener al menos 8 caracteres';
  end if;
  if p_roles is null or cardinality(p_roles) = 0 then
    raise exception 'Elige al menos un rol';
  end if;
  if exists (
    select 1 from unnest(p_roles) r where r not in ('admin', 'coordinador', 'maestro')
  ) then
    raise exception 'Desde aquí solo se dan roles de administrador, coordinador o maestro';
  end if;
  if exists (select 1 from auth.users u where lower(u.email) = v_email) then
    raise exception 'Ya existe una cuenta con ese correo';
  end if;

  -- Tokens en '' y no NULL: GoTrue los lee como texto (ver 0014).
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  )
  values (
    '00000000-0000-0000-0000-000000000000',
    v_id,
    'authenticated',
    'authenticated',
    v_email,
    crypt(p_password, gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    -- handle_new_user() (0034) toma de aquí nombre y apellido del perfil.
    jsonb_build_object('first_name', v_first, 'last_name', v_last),
    now(), now(),
    '', '', '', ''
  );

  insert into auth.identities (
    id, user_id, provider_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at
  )
  values (
    gen_random_uuid(),
    v_id,
    v_id::text,
    jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true),
    'email',
    now(), now(), now()
  );

  foreach v_role in array p_roles
  loop
    insert into public.user_roles (user_id, role_code)
    values (v_id, v_role)
    on conflict do nothing;
  end loop;

  return v_id;
end;
$$;

revoke execute on function public.admin_create_staff_account(text, text, text, text, text[]) from public, anon;
grant execute on function public.admin_create_staff_account(text, text, text, text, text[]) to authenticated;

-- ---------------------------------------------------------------------------
-- admin_set_user_roles()
-- ---------------------------------------------------------------------------
-- Deja a la cuenta exactamente con los roles del panel recibidos: agrega los
-- que faltan y quita los que sobran. Los quita primero, para que un cambio
-- que deja la cuenta sin un rol en uso falle antes de agregar nada.
-- guard_user_roles() (0035) sigue decidiendo qué se puede: no quitarse el
-- propio admin, no quitar maestro a quien tiene grupos, etc.
--
-- Las cuentas de alumno no se tocan desde aquí: su rol nace con su cuenta.
create or replace function public.admin_set_user_roles(
  p_user_id uuid,
  p_roles   text[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_roles text[] := coalesce(p_roles, '{}');
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador puede cambiar roles';
  end if;
  if not exists (select 1 from profiles where id = p_user_id) then
    raise exception 'La cuenta no existe';
  end if;
  if exists (select 1 from user_roles where user_id = p_user_id and role_code = 'alumno') then
    raise exception 'Es una cuenta de alumno: sus roles no se cambian desde aquí';
  end if;
  if exists (
    select 1 from unnest(v_roles) r where r not in ('admin', 'coordinador', 'maestro')
  ) then
    raise exception 'Desde aquí solo se dan roles de administrador, coordinador o maestro';
  end if;

  delete from user_roles
  where user_id = p_user_id
    and role_code <> all (v_roles);

  insert into user_roles (user_id, role_code)
  select p_user_id, r from unnest(v_roles) r
  on conflict do nothing;
end;
$$;

revoke execute on function public.admin_set_user_roles(uuid, text[]) from public, anon;
grant execute on function public.admin_set_user_roles(uuid, text[]) to authenticated;

-- ---------------------------------------------------------------------------
-- admin_set_user_active()
-- ---------------------------------------------------------------------------
-- Desactivar no borra: la cuenta sigue existiendo con su historial, pero
-- has_role() exige is_active, así que deja de ver cualquier cosa. Un admin no
-- se desactiva a sí mismo (dejaría el panel sin quien lo reactive).
create or replace function public.admin_set_user_active(
  p_user_id uuid,
  p_active  boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador puede activar o desactivar cuentas';
  end if;
  if p_user_id = (select auth.uid()) and not p_active then
    raise exception 'No puedes desactivar tu propia cuenta';
  end if;

  update profiles set is_active = p_active where id = p_user_id;
  if not found then
    raise exception 'La cuenta no existe';
  end if;
end;
$$;

revoke execute on function public.admin_set_user_active(uuid, boolean) from public, anon;
grant execute on function public.admin_set_user_active(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- admin_set_coordinator_teachers()
-- ---------------------------------------------------------------------------
-- Deja al coordinador exactamente con los maestros recibidos.
-- guard_coordinator_teachers() (0035) comprueba que el coordinador tenga ese
-- rol y que cada maestro tenga el de maestro.
create or replace function public.admin_set_coordinator_teachers(
  p_coordinator_id uuid,
  p_teacher_ids    uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids uuid[] := coalesce(p_teacher_ids, '{}');
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador puede asignar maestros a un coordinador';
  end if;

  delete from coordinator_teachers
  where coordinator_id = p_coordinator_id
    and teacher_id <> all (v_ids);

  insert into coordinator_teachers (coordinator_id, teacher_id)
  select p_coordinator_id, t from unnest(v_ids) t
  on conflict do nothing;
end;
$$;

revoke execute on function public.admin_set_coordinator_teachers(uuid, uuid[]) from public, anon;
grant execute on function public.admin_set_coordinator_teachers(uuid, uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- admin_set_user_password()
-- ---------------------------------------------------------------------------
-- Para quien olvidó su contraseña: el admin le pone una nueva y se la pasa;
-- el usuario la cambia en Mi perfil. Solo para cuentas del panel: la del
-- alumno se restablece a su matrícula de otra forma (fuera de esta fase).
create or replace function public.admin_set_user_password(
  p_user_id  uuid,
  p_password text
)
returns void
language plpgsql
security definer
set search_path = public, extensions, auth
as $$
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador puede cambiar contraseñas';
  end if;
  if length(coalesce(p_password, '')) < 8 then
    raise exception 'La contraseña debe tener al menos 8 caracteres';
  end if;
  if exists (
    select 1 from public.user_roles where user_id = p_user_id and role_code = 'alumno'
  ) then
    raise exception 'Es una cuenta de alumno: su contraseña no se cambia desde aquí';
  end if;

  update auth.users
     set encrypted_password = crypt(p_password, gen_salt('bf')),
         updated_at = now()
   where id = p_user_id;
  if not found then
    raise exception 'La cuenta no existe';
  end if;
end;
$$;

revoke execute on function public.admin_set_user_password(uuid, text) from public, anon;
grant execute on function public.admin_set_user_password(uuid, text) to authenticated;
