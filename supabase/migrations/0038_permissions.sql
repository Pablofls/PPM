-- 0038_permissions.sql — Permisos: qué ve y qué edita cada rol, y cada persona
-- Ver docs/DATABASE_SCHEMA.md#permisos y docs/AUTH.md#permisos
--
-- Fase 4 de «varios maestros, coordinadores y administradores». Hasta aquí,
-- lo que veía cada rol estaba fijo en el código: el maestro y el coordinador
-- leían todo lo de sus grupos y no escribían nada. Ahora el admin decide, en
-- Configuración → Usuarios y permisos, el acceso de cada rol a cada pantalla
-- —Sin acceso, Solo lectura o Puede editar— y puede hacer excepciones para una
-- persona concreta.
--
-- Modelo (4FN):
--   * app_screens(code, max_access, audience)       catálogo de pantallas.
--     El nombre visible vive en la interfaz, igual que el de `roles`.
--   * app_screen_forms(screen_code, form_code)      qué formularios muestra
--     cada pantalla; todo-llave. ADN Profesional (portal) muestra seis.
--   * role_screen_access(role_code, screen_code, access)
--     Llave (role_code, screen_code) → access. Sin fila = Sin acceso: guardar
--     'ninguno' sería tener dos formas de decir lo mismo, así que el CHECK lo
--     prohíbe. El admin no tiene filas: siempre puede todo.
--   * user_screen_access(user_id, screen_code, access)
--     La excepción de una persona; reemplaza lo que le daría su rol. Aquí sí
--     existe 'ninguno': quitarle a alguien una pantalla que su rol tiene.
--   Cada tabla guarda un solo hecho por llave; no hay dependencias
--   multivaluadas independientes mezcladas → 4FN.
--
-- Acceso efectivo de una persona a una pantalla (screen_access()):
--   admin → el máximo de la pantalla; si no, su excepción si la tiene; si no,
--   el mayor que le dé alguno de sus roles; si no, 'ninguno'.
--
-- Dónde se aplica (en la base, no solo en la interfaz):
--   * Lectura: una política RESTRICTIVA por tabla de respuestas exige que el
--     formulario de la entrega esté entre los que la persona puede leer
--     (readable_forms()). Se suma (AND) a las de alcance de 0036.
--   * Escritura del alumno: entregar o corregir una bitácora exige «Puede
--     editar» en ella (restrictivas sobre submissions y las dos bitácoras).
--   * Escritura del staff: Fechas de entrega, Alumnos registrados, Grupos y
--     corregir la semana de una bitácora se abren a quien tenga «Puede
--     editar», y siempre dentro de sus propios grupos y alumnos.
--   * Estado de Entregas se acota solo en la interfaz: son fechas de entrega,
--     no respuestas, y salen de `submissions`, que no lleva contenido.
--
-- Los valores iniciales reproducen exactamente lo de la fase 2: nadie gana
-- ni pierde nada al ejecutar esta migración.

create type access_level as enum ('ninguno', 'lectura', 'edicion');

-- ---------------------------------------------------------------------------
-- app_screens
-- ---------------------------------------------------------------------------
create table app_screens (
  code       text primary key,
  -- Lo más que se puede dar: las pantallas de consulta no tienen qué editar.
  max_access access_level not null,
  -- A qué roles aplica: 'panel' (maestro, coordinador), 'portal' (alumno), 'ambos'.
  audience   text not null,

  constraint app_screens_codigo check (code ~ '^[A-Za-z0-9_]+$'),
  constraint app_screens_max check (max_access <> 'ninguno'),
  constraint app_screens_audience check (audience in ('panel', 'portal', 'ambos'))
);

insert into app_screens (code, max_access, audience) values
  ('form1_0', 'lectura', 'panel'),
  ('form1_1', 'lectura', 'panel'),
  ('form1_2', 'lectura', 'panel'),
  ('form1_3', 'lectura', 'panel'),
  ('form1_4', 'lectura', 'panel'),
  ('form1_5', 'lectura', 'panel'),
  ('form2_1', 'lectura', 'panel'),
  ('form2_2', 'lectura', 'panel'),
  ('form2_4', 'lectura', 'panel'),
  ('form2_5', 'lectura', 'panel'),
  ('form2_7', 'lectura', 'panel'),
  ('formA_1', 'lectura', 'panel'),
  ('formB_1', 'lectura', 'panel'),
  ('form_busqueda',       'edicion', 'ambos'),
  ('form_practicas',      'edicion', 'ambos'),
  ('estado_entregas',     'lectura', 'panel'),
  ('fechas_entrega',      'edicion', 'panel'),
  ('alumnos_registrados', 'edicion', 'panel'),
  ('grupos',              'edicion', 'panel'),
  ('alumno_adn',          'lectura', 'portal'),
  ('alumno_estado',       'lectura', 'portal');

-- ---------------------------------------------------------------------------
-- app_screen_forms
-- ---------------------------------------------------------------------------
create table app_screen_forms (
  screen_code text not null references app_screens (code) on delete cascade,
  form_code   text not null references forms (code),
  primary key (screen_code, form_code)
);

insert into app_screen_forms (screen_code, form_code)
select code, code from app_screens
where code in (select code from forms);

-- ADN Profesional del portal: las secciones I a V del expediente (0019).
insert into app_screen_forms (screen_code, form_code) values
  ('alumno_adn', 'form1_0'), ('alumno_adn', 'form1_1'), ('alumno_adn', 'form1_2'),
  ('alumno_adn', 'form1_3'), ('alumno_adn', 'form1_5'), ('alumno_adn', 'formB_1');

-- ---------------------------------------------------------------------------
-- role_screen_access
-- ---------------------------------------------------------------------------
create table role_screen_access (
  role_code   text not null references roles (code),
  screen_code text not null references app_screens (code) on delete cascade,
  access      access_level not null,
  updated_at  timestamptz not null default now(),

  primary key (role_code, screen_code),
  constraint role_screen_access_no_admin check (role_code <> 'admin'),
  constraint role_screen_access_sin_ninguno check (access <> 'ninguno')
);

-- ---------------------------------------------------------------------------
-- user_screen_access
-- ---------------------------------------------------------------------------
create table user_screen_access (
  user_id     uuid not null references profiles (id) on delete cascade,
  screen_code text not null references app_screens (code) on delete cascade,
  access      access_level not null,
  updated_at  timestamptz not null default now(),

  primary key (user_id, screen_code)
);

create index idx_user_screen_access_screen on user_screen_access (screen_code);

-- Lo que se da no puede pasar del máximo de la pantalla, y a un rol solo se
-- le dan pantallas de su lado (panel o portal).
create or replace function public.guard_screen_access()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_screen public.app_screens%rowtype;
begin
  select * into v_screen from public.app_screens where code = new.screen_code;
  if new.access > v_screen.max_access then
    raise exception 'Esa pantalla no tiene nada que editar: lo más es «Solo lectura»';
  end if;
  if tg_table_name = 'role_screen_access' then
    if new.role_code = 'alumno' and v_screen.audience = 'panel' then
      raise exception 'Esa pantalla es del panel, no del portal del alumno';
    end if;
    if new.role_code <> 'alumno' and v_screen.audience = 'portal' then
      raise exception 'Esa pantalla es del portal del alumno';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger role_screen_access_guard
  before insert or update on role_screen_access
  for each row execute function public.guard_screen_access();

create trigger user_screen_access_guard
  before insert or update on user_screen_access
  for each row execute function public.guard_screen_access();

-- ---------------------------------------------------------------------------
-- Valores iniciales: lo mismo que ya veía cada rol (fase 2)
-- ---------------------------------------------------------------------------
insert into role_screen_access (role_code, screen_code, access)
select r.code, s.code, 'lectura'
from (values ('maestro'), ('coordinador')) r(code)
cross join app_screens s
where s.code in ('form1_0', 'form1_1', 'form1_2', 'form1_3', 'form1_4', 'form1_5', 'form2_1', 'form2_2', 'form2_4', 'form2_5', 'form2_7', 'formA_1', 'formB_1',
                 'form_busqueda', 'form_practicas', 'estado_entregas');

insert into role_screen_access (role_code, screen_code, access) values
  ('alumno', 'alumno_adn',     'lectura'),
  ('alumno', 'alumno_estado',  'lectura'),
  ('alumno', 'form_busqueda',  'edicion'),
  ('alumno', 'form_practicas', 'edicion');

-- ---------------------------------------------------------------------------
-- Acceso efectivo
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER: se llaman desde políticas de tablas con RLS (mismo
-- motivo que is_admin(), 0001).
create or replace function public.screen_access(p_screen text)
returns access_level
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when public.is_admin() then
      coalesce((select s.max_access from public.app_screens s where s.code = p_screen), 'ninguno')
    else coalesce(
      (select usa.access
       from public.user_screen_access usa
       join public.profiles p on p.id = usa.user_id
       where usa.user_id = (select auth.uid())
         and usa.screen_code = p_screen
         and p.is_active),
      (select max(rsa.access)
       from public.role_screen_access rsa
       join public.user_roles ur on ur.role_code = rsa.role_code
       join public.profiles p on p.id = ur.user_id
       where ur.user_id = (select auth.uid())
         and rsa.screen_code = p_screen
         and p.is_active),
      'ninguno'
    )
  end;
$$;

create or replace function public.can_edit_screen(p_screen text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.screen_access(p_screen) = 'edicion';
$$;

-- Los formularios cuyas respuestas puede leer / escribir la sesión.
create or replace function public.readable_forms()
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select distinct sf.form_code
  from public.app_screen_forms sf
  where public.screen_access(sf.screen_code) >= 'lectura';
$$;

create or replace function public.writable_forms()
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select distinct sf.form_code
  from public.app_screen_forms sf
  where public.screen_access(sf.screen_code) = 'edicion';
$$;

revoke execute on function public.screen_access(text)   from public, anon;
revoke execute on function public.can_edit_screen(text) from public, anon;
revoke execute on function public.readable_forms()      from public, anon;
revoke execute on function public.writable_forms()      from public, anon;
grant execute on function public.screen_access(text)   to authenticated;
grant execute on function public.can_edit_screen(text) to authenticated;
grant execute on function public.readable_forms()      to authenticated;
grant execute on function public.writable_forms()      to authenticated;

-- ---------------------------------------------------------------------------
-- RLS de las tablas nuevas
-- ---------------------------------------------------------------------------
alter table app_screens        enable row level security;
alter table app_screen_forms   enable row level security;
alter table role_screen_access enable row level security;
alter table user_screen_access enable row level security;

-- El catálogo y la matriz por rol los lee cualquiera con un rol: la
-- interfaz los necesita para armar el menú. No tienen datos personales.
create policy app_screens_select on app_screens
  for select to authenticated using (public.is_staff() or public.has_role('alumno'));
create policy app_screen_forms_select on app_screen_forms
  for select to authenticated using (public.is_staff() or public.has_role('alumno'));
create policy role_screen_access_select on role_screen_access
  for select to authenticated using (public.is_staff() or public.has_role('alumno'));

-- Las excepciones: cada quien las suyas; el admin, todas.
create policy user_screen_access_select on user_screen_access
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());

-- Escribir permisos es solo del admin.
create policy role_screen_access_write on role_screen_access
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy user_screen_access_write on user_screen_access
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

grant select on app_screens, app_screen_forms to authenticated;
grant select, insert, update, delete on role_screen_access, user_screen_access to authenticated;

-- ---------------------------------------------------------------------------
-- Lectura: políticas RESTRICTIVAS en las tablas de respuestas
-- ---------------------------------------------------------------------------
-- Una política restrictiva se cumple ADEMÁS de alguna permisiva (AND): el
-- alcance de 0036 dice «qué alumnos», esto dice «qué formularios». El admin
-- puede leer todos (readable_forms() lo incluye todo); la sincronización y
-- las funciones SECURITY DEFINER no pasan por RLS.
do $$
declare t text;
begin
  foreach t in array array['demographics', 'holland_results', 'mbti_results', 'disc_results', 'skills_assessment', 'values_results', 'reflections', 'indeed_research', 'internship_applications', 'company_profiles', 'job_search_logs', 'internship_logs']
  loop
    execute format(
      'create policy %I on %I as restrictive for select to authenticated using (
         submission_id in (
           select s.id from public.submissions s
           where s.form_code in (select public.readable_forms())
         )
       )',
      t || '_screen_read', t
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Escritura del alumno: entregar y corregir sus bitácoras
-- ---------------------------------------------------------------------------
-- Solo muerden a una sesión de alumno (current_student_id() no nulo).
create policy submissions_screen_write on submissions
  as restrictive for insert to authenticated
  with check (
    public.current_student_id() is null
    or form_code in (select public.writable_forms())
  );

create policy job_search_logs_screen_write on job_search_logs
  as restrictive for update to authenticated
  using (
    public.current_student_id() is null
    or 'form_busqueda' in (select public.writable_forms())
  );

create policy internship_logs_screen_write on internship_logs
  as restrictive for update to authenticated
  using (
    public.current_student_id() is null
    or 'form_practicas' in (select public.writable_forms())
  );

-- ---------------------------------------------------------------------------
-- Escritura del staff con «Puede editar»
-- ---------------------------------------------------------------------------
-- Fechas de entrega: las reglas son por periodo, frecuencia e idioma, no por
-- grupo; quien recibe «Puede editar» aquí las cambia para todos.
create policy form_deadlines_insert_screen on form_deadlines
  for insert to authenticated with check (public.can_edit_screen('fechas_entrega'));
create policy form_deadlines_delete_screen on form_deadlines
  for delete to authenticated using (public.can_edit_screen('fechas_entrega'));
create policy semester_weeks_insert_screen on semester_weeks
  for insert to authenticated with check (public.can_edit_screen('fechas_entrega'));
create policy semester_weeks_delete_screen on semester_weeks
  for delete to authenticated using (public.can_edit_screen('fechas_entrega'));

-- Grupos: borrar uno de los suyos (vacío) y reasignarlo a un maestro suyo.
create policy groups_delete_screen on groups
  for delete to authenticated
  using (public.can_edit_screen('grupos') and id in (select public.visible_group_ids()));
create policy groups_update_screen on groups
  for update to authenticated
  using (public.can_edit_screen('grupos') and id in (select public.visible_group_ids()))
  with check (teacher_id in (select public.visible_teacher_ids()));

-- Las funciones de escritura: mismas que antes, con el permiso en vez de
-- is_admin() y acotadas a sus grupos y alumnos.

-- admin_register_students(): igual que 0032, más el permiso y el alcance.
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

-- admin_create_group(): igual que 0035, más el permiso y el alcance.
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
  -- El admin, o quien tiene «Puede editar» en Grupos, para sí mismo o para
  -- los maestros que coordina (0038).
  if not (
    public.is_admin()
    or (public.can_edit_screen('grupos') and p_teacher_id in (select public.visible_teacher_ids()))
  ) then
    raise exception 'No tienes permiso para crear grupos para ese maestro';
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

-- admin_move_student(): igual que 0032, más el permiso y el alcance.
create or replace function public.admin_move_student(
  p_student_id uuid,
  p_group_id   uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- El admin, o quien tiene «Puede editar» en Grupos, entre sus propios
  -- grupos y con sus propios alumnos (0038).
  if not (
    public.is_admin()
    or (
      public.can_edit_screen('grupos')
      and p_student_id in (select public.visible_student_ids())
      and p_group_id in (select public.visible_group_ids())
    )
  ) then
    raise exception 'No tienes permiso para mover a ese alumno a ese grupo';
  end if;
  if not exists (select 1 from students where id = p_student_id) then
    raise exception 'El alumno no existe';
  end if;
  if not exists (select 1 from groups where id = p_group_id) then
    raise exception 'El grupo no existe';
  end if;

  delete from student_enrollments e
  using groups g_actual, groups g_nuevo
  where e.student_id = p_student_id
    and g_actual.id = e.group_id
    and g_nuevo.id = p_group_id
    and g_actual.period_code = g_nuevo.period_code
    and e.group_id <> p_group_id;

  insert into student_enrollments (student_id, group_id)
  values (p_student_id, p_group_id)
  on conflict do nothing;
end;
$$;

-- admin_set_weekly_log_week_number(): igual que 0029, más el permiso y el alcance.
create or replace function public.admin_set_weekly_log_week_number(
  p_submission_id uuid,
  p_week_number   smallint
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_form_code text;
begin
  if p_week_number is not null and (p_week_number < 1 or p_week_number > 53) then
    raise exception 'El número de semana tiene que estar entre 1 y 53.';
  end if;

  select form_code into v_form_code from submissions where id = p_submission_id;

  -- El admin, o quien tiene «Puede editar» en esa bitácora, con sus propios
  -- alumnos (0038).
  if not (
    public.is_admin()
    or (
      public.can_edit_screen(v_form_code)
      and exists (
        select 1 from submissions s
        where s.id = p_submission_id
          and s.student_id in (select public.visible_student_ids())
      )
    )
  ) then
    raise exception 'No tienes permiso para clasificar esa semana.';
  end if;

  if v_form_code = 'form_busqueda' then
    update job_search_logs set week_number_override = p_week_number where submission_id = p_submission_id;
  elsif v_form_code = 'form_practicas' then
    update internship_logs set week_number_override = p_week_number where submission_id = p_submission_id;
  else
    raise exception 'Esa entrega no es una bitácora semanal.';
  end if;

  if not found then
    raise exception 'No se encontró esa entrega.';
  end if;
end;
$$;

-- guard_user_roles(): igual que 0035, salvo que quien registra alumnos les
-- puede dar el rol `alumno` al crearles la cuenta.
create or replace function public.guard_user_roles()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Además del admin, quien puede registrar alumnos (0038) les da el rol
  -- `alumno` al crearles la cuenta (create_student_accounts()). Nada más:
  -- ni otro rol, ni quitar.
  if (select auth.uid()) is not null and not public.is_admin()
     and not (
       tg_op = 'INSERT'
       and new.role_code = 'alumno'
       and public.can_edit_screen('alumnos_registrados')
     ) then
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
