-- 0014_student_accounts.sql — Cuentas de alumno
-- Ver docs/DATABASE_SCHEMA.md#autenticación-y-roles y docs/AUTH.md
--
-- Requiere que 0013_role_alumno.sql ya se haya ejecutado (el valor 'alumno' del
-- enum tiene que existir en una transacción anterior).
--
-- Da de alta un usuario de Supabase Auth por cada alumno que contestó el
-- formulario 1.0, con su correo institucional como usuario y su matrícula como
-- contraseña. La lista de alumnos sale de `demographics`: un correo que nunca
-- contestó el 1.0 no tiene matrícula, y sin matrícula no hay contraseña.

-- ---------------------------------------------------------------------------
-- profiles.student_id — el puente entre la cuenta y el alumno
-- ---------------------------------------------------------------------------
-- El correo institucional es la llave natural de `students`, pero enlazar por
-- correo cada vez que el alumno abre una pantalla haría que cambiarle el correo
-- lo desconecte de sus propias entregas. El id es estable.
alter table profiles
  add column if not exists student_id uuid references students (id) on delete set null;

-- Una cuenta por alumno: dos perfiles apuntando al mismo alumno serían dos
-- personas leyendo el mismo expediente.
create unique index if not exists idx_profiles_student
  on profiles (student_id)
  where student_id is not null;

-- ---------------------------------------------------------------------------
-- current_student_id()
-- ---------------------------------------------------------------------------
-- El equivalente de is_admin() para el otro lado del panel: devuelve el alumno
-- que le corresponde a la sesión, o NULL si quien pregunta no es un alumno
-- activo. Todavía no la usa ninguna política —el alumno solo tiene la pantalla
-- de bienvenida—, pero es la pieza sobre la que se escriben: la condición de
-- «mis propias entregas» siempre será `student_id = public.current_student_id()`.
--
-- SECURITY DEFINER por la misma razón que is_admin(): consulta `profiles`, que
-- tiene RLS, y sin esto la política de profiles se dispararía a sí misma.
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
    and p.role = 'alumno'
    and p.is_active;
$$;

revoke execute on function public.current_student_id() from public, anon;
grant execute on function public.current_student_id() to authenticated;

-- ---------------------------------------------------------------------------
-- create_student_accounts()
-- ---------------------------------------------------------------------------
-- Se corre A MANO desde el SQL Editor y devuelve una fila por alumno con lo que
-- pasó, para poder revisar el resultado antes de avisarle a nadie:
--
--   select * from public.create_student_accounts();
--
-- Es idempotente: volver a correrla no toca las cuentas que ya existen ni les
-- cambia la contraseña. Un alumno nuevo en `demographics` se da de alta con
-- solo volver a correrla.
--
-- Por qué escribe directo en auth.users: el alta de usuarios por API necesita la
-- llave `service_role`, que este proyecto no tiene y no debe tener (regla «Los
-- cambios de BD se hacen en la interfaz»). El SQL Editor ya es un contexto
-- administrativo con acceso total, así que el alta se hace ahí. El hash lo
-- calcula pgcrypto con el mismo algoritmo (bcrypt) que usa Supabase Auth; la
-- contraseña en claro no se guarda en ninguna columna.
--
-- search_path incluye `extensions` porque ahí vive pgcrypto en Supabase, y
-- `auth` porque es el esquema que se escribe. No puede ir vacío como en
-- is_admin(); a cambio, la función no es ejecutable por nadie con sesión (ver
-- los REVOKE del final).
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
      -- perfil al alumno; la contraseña no se toca.
      update public.profiles p
         set student_id = alumno.sid,
             full_name  = coalesce(p.full_name, alumno.nombre),
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
           student_id = alumno.sid,
           full_name  = coalesce(full_name, alumno.nombre)
     where id = nuevo_id;

    student_email := alumno.correo;
    outcome := 'creado';
    return next;
  end loop;
end;
$$;

-- Nadie con sesión en el navegador puede llamarla: es un alta masiva de cuentas
-- y su único contexto legítimo es el SQL Editor.
revoke execute on function public.create_student_accounts() from public, anon, authenticated;
