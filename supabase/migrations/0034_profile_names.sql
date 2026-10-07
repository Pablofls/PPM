-- 0034_profile_names.sql — Nombre y apellido por separado en el perfil
-- Ver docs/DATABASE_SCHEMA.md#profiles y docs/AUTH.md
--
-- La pantalla «Mi perfil» deja que cada usuario del panel capture su nombre y
-- su apellido, y en la fase de usuarios un admin o coordinador registrará a un
-- maestro con nombre, apellido y correo. Las tarjetas de Mis grupos muestran
-- el nombre del maestro en vez de su correo.
--
-- Normalización (4FN):
--   * profiles(id, email, first_name, last_name, role, is_active, student_id…)
--     Llaves candidatas: id y email. first_name y last_name son hechos
--     atómicos de un solo valor que dependen solo de la llave → BCNF/4FN.
--   * `full_name` se ELIMINA: guardarlo junto a nombre y apellido sería un
--     atributo derivado (id → first_name, last_name → full_name), una
--     dependencia transitiva. El nombre completo se arma al leer (v_groups,
--     la interfaz), nunca se guarda.
--   * El nombre de un ALUMNO no va en su perfil: ya vive en `demographics`
--     (lo que contestó en el 1.0). Copiarlo a `profiles` —como hacía
--     create_student_accounts() desde 0014— lo duplicaba en dos tablas. Desde
--     aquí los perfiles de alumno quedan con nombre y apellido vacíos.
--
-- Datos existentes: el `full_name` de los perfiles que no son de alumno se
-- parte en la primera palabra (nombre) y el resto (apellido). Es una
-- aproximación —«José Luis Pérez» quedaría «José» / «Luis Pérez»—; cada quien
-- lo corrige en Mi perfil.

-- ---------------------------------------------------------------------------
-- Columnas nuevas
-- ---------------------------------------------------------------------------
alter table profiles
  add column first_name text,
  add column last_name  text,
  add constraint profiles_first_name_no_vacio check (first_name is null or btrim(first_name) <> ''),
  add constraint profiles_last_name_no_vacio  check (last_name  is null or btrim(last_name)  <> '');

update profiles
   set first_name = nullif(split_part(btrim(full_name), ' ', 1), ''),
       last_name  = nullif(btrim(substr(btrim(full_name), length(split_part(btrim(full_name), ' ', 1)) + 1)), '')
 where role <> 'alumno'
   and nullif(btrim(full_name), '') is not null;

-- ---------------------------------------------------------------------------
-- v_groups — el nombre del maestro sale de nombre + apellido
-- ---------------------------------------------------------------------------
-- Se tira y se recrea (nada depende de ella) porque usaba profiles.full_name,
-- que se elimina abajo. Mismas columnas que en 0032: `teacher_name` sigue
-- existiendo, pero ahora es derivado al leer.
drop view v_groups;

alter table profiles drop column full_name;

create view v_groups as
select
  g.id as group_id,
  g.period_code,
  g.session_day,
  g.language,
  g.teacher_id,
  nullif(concat_ws(' ', p.first_name, p.last_name), '') as teacher_name,
  p.email as teacher_email,
  (select count(*) from student_enrollments e where e.group_id = g.id)::int as student_count,
  g.created_at
from groups g
join profiles p on p.id = g.teacher_id;

alter view v_groups set (security_invoker = on);
grant select on v_groups to authenticated;

-- ---------------------------------------------------------------------------
-- Qué puede editar cada quien de su perfil
-- ---------------------------------------------------------------------------
-- La política profiles_update (0001) deja que cada quien edite SU fila, y
-- guard_profile_role() frena el cambio de rol. Pero RLS no limita columnas:
-- con ella, un usuario podía cambiar también su `email`, `is_active` o
-- `student_id`. Desde aquí, desde el navegador solo se escriben nombre y
-- apellido. Lo demás lo cambian funciones SECURITY DEFINER (alta de cuentas,
-- y la gestión de usuarios de la fase siguiente), que no dependen de estos
-- permisos.
revoke update on profiles from authenticated;
grant update (first_name, last_name) on profiles to authenticated;

-- ---------------------------------------------------------------------------
-- handle_new_user() — el perfil nace con nombre y apellido si vienen
-- ---------------------------------------------------------------------------
-- Misma lógica que 0001; lee `first_name` y `last_name` de los metadatos del
-- alta en vez de `full_name`.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, first_name, last_name)
  values (
    new.id,
    new.email,
    nullif(btrim(new.raw_user_meta_data ->> 'first_name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'last_name'), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- create_student_accounts() — ya no copia el nombre del alumno al perfil
-- ---------------------------------------------------------------------------
-- Idéntica a 0014 salvo eso. Firma sin cambios, así que basta create or
-- replace; import_sheet_rows() (0021) y admin_register_students() (0032) la
-- siguen llamando igual.
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
         set student_id = alumno.sid,
             role       = case when p.role = 'admin' then p.role else 'alumno' end
       where p.email = alumno.correo;

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

    -- El trigger on_auth_user_created ya creó el perfil con rol 'pendiente'.
    -- Aquí se le pone el rol y el alumno que le toca. El trigger
    -- guard_profile_role() deja pasar el cambio de rol porque en el SQL Editor
    -- no hay sesión y auth.uid() es NULL.
    update public.profiles
       set role       = 'alumno',
           student_id = alumno.sid
     where id = nuevo_id;

    student_email := alumno.correo;
    outcome := 'creado';
    return next;
  end loop;
end;
$$;

revoke execute on function public.create_student_accounts() from public, anon, authenticated;
