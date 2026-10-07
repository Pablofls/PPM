-- 0039_user_admin_rules.sql — Reglas de Usuarios y permisos que faltaban
-- Ver docs/DATABASE_SCHEMA.md#gestión-de-usuarios
--
-- Fase 5. Revisión de los casos borde de crear y editar cuentas (0037):
--
--   1. Crear un COORDINADOR ya con sus maestros, en el mismo paso y en la
--      misma transacción: antes había que crearlo y luego entrar a «Editar».
--   2. Crear con el correo de una cuenta PENDIENTE (se registró sola y no
--      tiene roles): antes fallaba con «ya existe una cuenta»; ahora se le
--      asignan los roles y se le pone el nombre. Su contraseña no se toca.
--      Si el correo es de un alumno, el mensaje lo dice.
--   3. Quitar un rol con asignaciones: antes fallaba («el coordinador todavía
--      tiene maestros asignados»). Ahora quitar «Coordinador» suelta sus
--      maestros, y quitar «Maestro» lo saca de los coordinadores que lo
--      supervisaban: esas asignaciones solo tienen sentido con el rol. Quitar
--      «Maestro» a quien todavía tiene GRUPOS sigue bloqueado (0035): sus
--      alumnos se quedarían sin maestro; hay que reasignarlos antes.
--   4. Registrar alumnos sin ser admin en un grupo que existe pero es de
--      otro maestro decía «no existe un grupo…: créalo», y crearlo fallaba
--      («Ese grupo ya existe»). Ahora dice que es de otro maestro.
--
-- Sin tablas nuevas. admin_create_staff_account cambia de firma (un
-- parámetro más y devuelve jsonb), así que se tira y se vuelve a crear.

drop function if exists public.admin_create_staff_account(text, text, text, text, text[]);

-- ---------------------------------------------------------------------------
-- admin_create_staff_account()
-- ---------------------------------------------------------------------------
-- Devuelve {"id": uuid, "existia": boolean}. `existia` = era una cuenta
-- pendiente y solo se le dieron roles (la contraseña recibida no se usa).
create or replace function public.admin_create_staff_account(
  p_email       text,
  p_first_name  text,
  p_last_name   text,
  p_password    text,
  p_roles       text[],
  p_teacher_ids uuid[] default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, auth
as $$
declare
  v_email    text := lower(btrim(coalesce(p_email, '')));
  v_first    text := nullif(btrim(coalesce(p_first_name, '')), '');
  v_last     text := nullif(btrim(coalesce(p_last_name, '')), '');
  v_teachers uuid[] := coalesce(p_teacher_ids, '{}');
  v_id       uuid;
  v_existia  boolean := false;
  v_role     text;
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
  if p_roles is null or cardinality(p_roles) = 0 then
    raise exception 'Elige al menos un rol';
  end if;
  if exists (
    select 1 from unnest(p_roles) r where r not in ('admin', 'coordinador', 'maestro')
  ) then
    raise exception 'Desde aquí solo se dan roles de administrador, coordinador o maestro';
  end if;
  if cardinality(v_teachers) > 0 and not ('coordinador' = any (p_roles)) then
    raise exception 'Solo a un coordinador se le asignan maestros';
  end if;

  select u.id into v_id from auth.users u where lower(u.email) = v_email;

  if v_id is not null then
    -- La cuenta ya existe: solo se acepta si está pendiente (sin roles).
    if exists (select 1 from public.user_roles where user_id = v_id and role_code = 'alumno') then
      raise exception 'Ese correo es de una cuenta de alumno';
    end if;
    if exists (select 1 from public.user_roles where user_id = v_id) then
      raise exception 'Ya existe una cuenta con ese correo: edítala en la lista';
    end if;
    update public.profiles
       set first_name = v_first, last_name = v_last
     where id = v_id;
    v_existia := true;
  else
    if length(coalesce(p_password, '')) < 8 then
      raise exception 'La contraseña inicial debe tener al menos 8 caracteres';
    end if;

    v_id := gen_random_uuid();

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
  end if;

  -- Los roles antes que los maestros: guard_coordinator_teachers() (0035)
  -- exige que el coordinador ya tenga su rol.
  foreach v_role in array p_roles
  loop
    insert into public.user_roles (user_id, role_code)
    values (v_id, v_role)
    on conflict do nothing;
  end loop;

  insert into public.coordinator_teachers (coordinator_id, teacher_id)
  select v_id, t from unnest(v_teachers) t
  on conflict do nothing;

  return jsonb_build_object('id', v_id, 'existia', v_existia);
end;
$$;

revoke execute on function public.admin_create_staff_account(text, text, text, text, text[], uuid[]) from public, anon;
grant execute on function public.admin_create_staff_account(text, text, text, text, text[], uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- admin_set_user_roles() — quitar un rol suelta sus asignaciones
-- ---------------------------------------------------------------------------
-- Igual que 0037, más la limpieza de coordinator_teachers. Si al quitar
-- «Maestro» todavía tiene grupos, guard_user_roles() (0035) lo rechaza y nada
-- de esto se queda (es una sola transacción).
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

  if not ('coordinador' = any (v_roles)) then
    delete from coordinator_teachers where coordinator_id = p_user_id;
  end if;
  if not ('maestro' = any (v_roles)) then
    if exists (select 1 from groups where teacher_id = p_user_id) then
      raise exception 'Todavía imparte % grupo(s): reasígnalos en Administrar grupos antes de quitarle el rol de maestro',
        (select count(*) from groups where teacher_id = p_user_id);
    end if;
    delete from coordinator_teachers where teacher_id = p_user_id;
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
-- admin_register_students() — el grupo de otro maestro no es «no existe»
-- ---------------------------------------------------------------------------
-- Igual que 0038, salvo ese mensaje.
create or replace function public.admin_register_students(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  fila      jsonb;
  n         int := 0;
  salida    jsonb := '[]'::jsonb;
  v_correo  text;
  v_mat     text;
  v_per     text;
  v_freq    text;
  v_idi     text;
  v_freq_n  session_day;
  v_idi_n   language;
  v_grupos  uuid[];
  v_grupo   uuid;
  v_actual  uuid;
  s_id      uuid;
  s_mat     text;
  d_mat     text;
  resultado text;
  cuentas   jsonb := '{}'::jsonb;
  cuenta    record;
  i         int;
begin
  if not (public.is_admin() or public.can_edit_screen('alumnos_registrados')) then
    raise exception 'No tienes permiso para registrar alumnos';
  end if;

  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Se esperaba un arreglo de alumnos';
  end if;
  if jsonb_array_length(p_rows) > 500 then
    raise exception 'Máximo 500 alumnos por importación';
  end if;

  for fila in select * from jsonb_array_elements(p_rows)
  loop
    n := n + 1;
    resultado := null;
    d_mat := null;
    s_id := null;
    s_mat := null;
    v_actual := null;
    v_correo := lower(btrim(coalesce(fila->>'correo', '')));

    begin
      v_mat  := btrim(coalesce(fila->>'matricula', ''));
      v_per  := upper(btrim(coalesce(fila->>'periodo', '')));
      v_freq := lower(translate(btrim(coalesce(fila->>'frecuencia', '')), 'áéíóúÁÉÍÓÚ', 'aeiouaeiou'));
      v_idi  := lower(translate(btrim(coalesce(fila->>'idioma', '')), 'áéíóúÁÉÍÓÚ', 'aeiouaeiou'));

      if v_correo !~ '^[^@[:space:]]+@([a-z0-9-]+\.)*udem\.edu(\.mx)?$' then
        raise exception 'correo institucional inválido';
      end if;
      if v_mat !~ '^[A-Za-z0-9]+$' then
        raise exception 'matrícula inválida';
      end if;
      if v_per !~ '^[A-Z]{2}-[0-9]{2}$' then
        raise exception 'periodo inválido (formato PR-26)';
      end if;

      v_freq_n := case v_freq
        when 'lunes' then 'lunes'::session_day
        when 'miercoles' then 'miercoles'::session_day
        else null end;
      if v_freq_n is null then
        raise exception 'frecuencia inválida (lunes o miércoles)';
      end if;

      v_idi_n := case v_idi
        when 'es' then 'es'::language
        when 'espanol' then 'es'::language
        when 'en' then 'en'::language
        when 'ingles' then 'en'::language
        when 'english' then 'en'::language
        else null end;
      if v_idi_n is null then
        raise exception 'idioma inválido (español o inglés)';
      end if;

      -- Quien no es admin solo inscribe en los grupos que le tocan (0038).
      select array_agg(g.id) into v_grupos
      from groups g
      where g.period_code = v_per
        and g.session_day = v_freq_n
        and g.language    = v_idi_n
        and (public.is_admin() or g.id in (select public.visible_group_ids()));

      if v_grupos is null then
        -- Quien no es admin puede toparse con un grupo que sí existe pero es
        -- de otro maestro: decirle «no existe» lo mandaría a crearlo de nuevo.
        if not public.is_admin() and exists (
          select 1 from groups g
          where g.period_code = v_per and g.session_day = v_freq_n and g.language = v_idi_n
        ) then
          raise exception 'el grupo % · % · % es de otro maestro', v_per, v_freq_n, v_idi_n;
        end if;
        raise exception 'no existe un grupo % · % · %: créalo en Grupos',
          v_per, v_freq_n, v_idi_n;
      end if;
      if array_length(v_grupos, 1) > 1 then
        raise exception 'hay varios grupos % · % · %: asígnalo desde Grupos',
          v_per, v_freq_n, v_idi_n;
      end if;
      v_grupo := v_grupos[1];

      select st.id, st.student_number into s_id, s_mat
      from students st where st.institutional_email = v_correo::citext;

      if found then
        -- Si el alumno ya contestó el 1.0, su matrícula es la que vale.
        select dm.student_number into d_mat
        from submissions sub
        join demographics dm on dm.submission_id = sub.id
        where sub.student_id = s_id and sub.form_code = 'form1_0'
        order by sub.submitted_at desc
        limit 1;
        d_mat := nullif(btrim(d_mat), '');
        if d_mat is not null and d_mat <> v_mat then
          raise exception 'el alumno ya tiene otra matrícula en el 1.0';
        end if;
      end if;

      -- La matrícula no puede ser de otro alumno, la tenga en students o en el 1.0.
      if exists (
        select 1 from public.v_students_directory dir
        where dir.student_number = v_mat
          and dir.student_id is distinct from s_id
      ) then
        raise exception 'la matrícula ya pertenece a otro alumno';
      end if;

      if s_id is null then
        insert into students (institutional_email, student_number)
        values (v_correo::citext, v_mat)
        returning id into s_id;
        resultado := 'creado';
      elsif s_mat is distinct from v_mat then
        update students set student_number = v_mat, updated_at = now() where id = s_id;
        resultado := 'actualizado';
      else
        resultado := 'sin cambios';
      end if;

      select e.group_id into v_actual
      from student_enrollments e
      join groups g on g.id = e.group_id
      where e.student_id = s_id and g.period_code = v_per;

      -- Sacar a un alumno del grupo de otro maestro no es «registrarlo».
      if v_actual is not null and not public.is_admin()
         and v_actual not in (select public.visible_group_ids()) then
        raise exception 'el alumno ya está en un grupo de otro maestro';
      end if;

      if v_actual is null then
        insert into student_enrollments (student_id, group_id)
        values (s_id, v_grupo);
        if resultado = 'sin cambios' then resultado := 'actualizado'; end if;
      elsif v_actual <> v_grupo then
        update student_enrollments
           set group_id = v_grupo
         where student_id = s_id and group_id = v_actual;
        if resultado = 'sin cambios' then resultado := 'actualizado'; end if;
      end if;

    exception
      when unique_violation then
        resultado := 'error: dato repetido (correo o matrícula)';
      when others then
        resultado := 'error: ' || sqlerrm;
    end;

    salida := salida || jsonb_build_object(
      'fila', n, 'correo', v_correo, 'resultado', resultado, 'cuenta', null);
  end loop;

  -- Un solo pase de alta de cuentas para todos (idempotente, 0014).
  for cuenta in select * from public.create_student_accounts()
  loop
    cuentas := cuentas || jsonb_build_object(lower(cuenta.student_email), cuenta.outcome);
  end loop;

  for i in 0 .. jsonb_array_length(salida) - 1
  loop
    if salida->i->>'resultado' not like 'error:%' then
      salida := jsonb_set(salida, array[i::text, 'cuenta'],
        coalesce(cuentas->(salida->i->>'correo'), 'null'::jsonb) );
    end if;
  end loop;

  return salida;
end;
$$;

revoke execute on function public.admin_register_students(jsonb) from public, anon;
grant execute on function public.admin_register_students(jsonb) to authenticated;
