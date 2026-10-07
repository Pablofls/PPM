-- 0032_groups.sql — Grupos: cada alumno en el grupo de un maestro
-- Ver docs/DATABASE_SCHEMA.md#grupos y docs/UI_SCREENS.md#grupos
--
-- Fase 1 de «varios maestros, coordinadores y administradores». Hasta aquí
-- el panel era de un solo profesor y mezclaba a todos sus alumnos de todos los
-- periodos. Un GRUPO es una clase concreta: un periodo, una frecuencia, un
-- idioma y el maestro que la imparte. El alumno pertenece a un grupo por
-- periodo; el grupo, a un maestro; el maestro tiene N grupos.
--
-- Esta migración NO cambia quién ve qué: todo sigue siendo `is_admin()`.
-- Eso llega en la fase de roles.
--
-- Modelo (4FN):
--   * groups(id, period_code, session_day, language, teacher_id)
--     Llaves candidatas: id y (period_code, session_day, language, teacher_id).
--     Todo atributo depende de una llave → BCNF. Sin atributos multivaluados
--     → 4FN. El nombre del grupo («OT-26 · Lunes · Español») NO se guarda:
--     se deriva de sus columnas.
--   * student_enrollments(student_id, group_id, created_at)
--     Antes llevaba periodo, frecuencia e idioma. Ahora esos tres dependen de
--     `group_id`, que no es llave de la inscripción: dejarlos aquí sería una
--     dependencia transitiva (viola 3FN). Se eliminan.
--     «Un grupo por periodo» se garantiza con un trigger y no copiando el
--     periodo a la inscripción: con `period_code` aquí, group_id → period_code
--     sería una dependencia cuyo determinante no es superllave (viola BCNF).
--
-- Clasificación de los datos actuales: todos los grupos existentes son del
-- único profesor que usa el panel. Se crean los grupos de todas las
-- combinaciones (periodo, frecuencia, idioma) que tienen hoy los alumnos y se
-- inscribe a cada uno en el suyo. Quien no tenga los tres datos queda SIN
-- GRUPO y aparece en la pantalla Grupos para asignarlo a mano.
--
-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │ ANTES DE PEGAR: el maestro de los grupos actuales es el único admin     │
-- │ activo. Si hay MÁS de un admin, descomenta la línea de abajo y pon el   │
-- │ correo del maestro (no se commitea con el correo puesto).               │
-- └─────────────────────────────────────────────────────────────────────────┘
-- select set_config('ppm.maestro_inicial', 'correo.del.maestro@udem.edu', false);

-- ---------------------------------------------------------------------------
-- groups
-- ---------------------------------------------------------------------------
create table groups (
  id          uuid primary key default gen_random_uuid(),
  period_code text        not null references periods (code),
  session_day session_day not null,
  language    language    not null,
  teacher_id  uuid        not null references profiles (id),
  created_at  timestamptz not null default now(),

  unique (period_code, session_day, language, teacher_id)
);

create index idx_groups_teacher on groups (teacher_id);

alter table groups enable row level security;

-- Lectura y borrado para el admin. El alta pasa por admin_create_group() (que
-- valida el periodo y lo agrega al catálogo). Borrar un grupo con alumnos lo
-- impide la llave foránea de student_enrollments.
create policy groups_select_admin on groups
  for select to authenticated using (public.is_admin());

create policy groups_delete_admin on groups
  for delete to authenticated using (public.is_admin());

-- Cambiar de maestro sí es un UPDATE; cambiar periodo, frecuencia o idioma no:
-- sería otro grupo, y movería de clase a todos sus alumnos de golpe. El
-- permiso por columna lo hace imposible, no solo poco probable.
create policy groups_update_admin on groups
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

grant select, delete on groups to authenticated;
grant update (teacher_id) on groups to authenticated;

-- ---------------------------------------------------------------------------
-- Maestro de los grupos actuales
-- ---------------------------------------------------------------------------
create temp table tmp_maestro_inicial as
select p.id
from profiles p
where p.is_active
  and (
    case
      when nullif(current_setting('ppm.maestro_inicial', true), '') is not null
        then p.email = current_setting('ppm.maestro_inicial', true)::citext
      else p.role = 'admin'
    end
  );

do $$
declare n int;
begin
  select count(*) into n from tmp_maestro_inicial;
  if n <> 1 then
    raise exception
      'Se esperaba exactamente un maestro inicial y hay %. Si hay varios admins, '
      'descomenta la línea set_config(''ppm.maestro_inicial'', …) al inicio de '
      '0032_groups.sql con el correo del maestro y vuelve a pegar el archivo.', n;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Clasificación: qué periodo, frecuencia e idioma tiene hoy cada alumno
-- ---------------------------------------------------------------------------
-- Se lee de v_students_directory TAL COMO ESTÁ (0031): el 1.0 manda y la
-- inscripción es el respaldo. Es exactamente lo que el profesor ve hoy.
create temp table tmp_clasificacion as
select
  dir.student_id,
  upper(btrim(dir.period_code)) as period_code,
  dir.session_day,
  dir.language
from v_students_directory dir
where dir.period_code is not null
  and upper(btrim(dir.period_code)) ~ '^[A-Z]{2}-[0-9]{2}$'
  and dir.session_day is not null
  and dir.language is not null;

insert into periods (code)
select distinct period_code from tmp_clasificacion
on conflict do nothing;

insert into groups (period_code, session_day, language, teacher_id)
select distinct t.period_code, t.session_day, t.language, m.id
from tmp_clasificacion t
cross join tmp_maestro_inicial m
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- student_enrollments → (student_id, group_id)
-- ---------------------------------------------------------------------------
alter table student_enrollments
  add column group_id uuid references groups (id);

-- Inscripciones que ya existían (alumnos registrados, 0031).
update student_enrollments e
   set group_id = g.id
  from tmp_clasificacion t
  join groups g
    on g.period_code = t.period_code
   and g.session_day = t.session_day
   and g.language    = t.language
 where t.student_id = e.student_id;

-- Alumnos que llegaron por el 1.0 y nunca tuvieron inscripción.
insert into student_enrollments (student_id, period_code, session_day, language, group_id)
select t.student_id, t.period_code, t.session_day, t.language, g.id
from tmp_clasificacion t
join groups g
  on g.period_code = t.period_code
 and g.session_day = t.session_day
 and g.language    = t.language
where not exists (
  select 1 from student_enrollments e where e.student_id = t.student_id
);

-- Una inscripción sin grupo solo podría ser una con periodo inválido, y
-- admin_register_students() nunca dejó crear una así. Si existiera, el alumno
-- queda «sin grupo» y se asigna a mano desde la pantalla Grupos.
delete from student_enrollments where group_id is null;

-- ---------------------------------------------------------------------------
-- v_current_enrollments — el grupo vigente de cada alumno
-- ---------------------------------------------------------------------------
-- Un alumno puede tener un grupo por periodo; el vigente es el más reciente.
-- Es la pieza sobre la que se arman el directorio, los filtros por grupo y,
-- en la fase de roles, el alcance de cada maestro.
create view v_current_enrollments as
select distinct on (e.student_id)
  e.student_id,
  g.id as group_id,
  g.teacher_id,
  g.period_code,
  g.session_day,
  g.language
from student_enrollments e
join groups g on g.id = e.group_id
order by e.student_id, e.created_at desc;

alter view v_current_enrollments set (security_invoker = on);
grant select on v_current_enrollments to authenticated;

-- ---------------------------------------------------------------------------
-- v_students_directory — ahora el GRUPO manda
-- ---------------------------------------------------------------------------
-- El grupo es la clasificación oficial: si el profesor mueve a un alumno de
-- grupo, sus filtros de periodo/frecuencia/idioma lo siguen. Lo que contestó
-- en el 1.0 queda intacto en `demographics` como historial, y es el respaldo
-- para quien todavía no tiene grupo.
--
-- Mismas columnas, nombre, tipo y orden que en 0031; `group_id` y
-- `teacher_id` van al final (create or replace solo permite agregar al final).
create or replace view v_students_directory as
select
  s.id   as student_id,
  s.institutional_email,
  d.full_name,
  coalesce(d.student_number, s.student_number) as student_number,
  d.personal_email,
  d.birth_date,
  d.birth_country,
  d.gender,
  d.degree_code,
  d.semester,
  coalesce(ce.period_code, d.period_code)      as period_code,
  coalesce(ce.session_day, d.session_day)      as session_day,
  coalesce(ce.language, d.sub_language)        as language,
  ce.group_id,
  ce.teacher_id
from students s
left join lateral (
  select dm.*, sub.language as sub_language
  from submissions sub
  join demographics dm on dm.submission_id = sub.id
  where sub.student_id = s.id
    and sub.form_code = 'form1_0'
  order by sub.submitted_at desc
  limit 1
) d on true
left join v_current_enrollments ce on ce.student_id = s.id;

alter view v_students_directory set (security_invoker = on);

-- Ya nada lee las columnas viejas: fuera.
alter table student_enrollments
  drop column period_code,
  drop column session_day,
  drop column language,
  drop column updated_at,
  drop column id;

alter table student_enrollments
  alter column group_id set not null,
  add primary key (student_id, group_id);

create index idx_student_enrollments_group on student_enrollments (group_id);

drop table tmp_clasificacion;
drop table tmp_maestro_inicial;

-- ---------------------------------------------------------------------------
-- Un grupo por periodo
-- ---------------------------------------------------------------------------
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
  ) then
    raise exception 'El alumno ya está en otro grupo de ese periodo';
  end if;
  return new;
end;
$$;

create trigger student_enrollments_one_group_per_period
  before insert or update on student_enrollments
  for each row
  execute function public.enforce_one_group_per_period();

-- ---------------------------------------------------------------------------
-- v_groups — los grupos con su maestro y cuántos alumnos tienen
-- ---------------------------------------------------------------------------
create view v_groups as
select
  g.id as group_id,
  g.period_code,
  g.session_day,
  g.language,
  g.teacher_id,
  p.full_name as teacher_name,
  p.email     as teacher_email,
  (select count(*) from student_enrollments e where e.group_id = g.id)::int as student_count,
  g.created_at
from groups g
join profiles p on p.id = g.teacher_id;

alter view v_groups set (security_invoker = on);
grant select on v_groups to authenticated;

-- ---------------------------------------------------------------------------
-- El alumno puede leer su propia inscripción y su grupo
-- ---------------------------------------------------------------------------
-- Sin esto, cuando el alumno lee su expediente (v_student_dossier →
-- v_students_directory, 0019) el join con su grupo vendría vacío y vería el
-- periodo de su 1.0 en vez del de su grupo. Misma condición de siempre:
-- «lo mío», nunca `authenticated`.
create policy student_enrollments_select_own on student_enrollments
  for select to authenticated
  using (student_id = public.current_student_id());

create policy groups_select_own on groups
  for select to authenticated
  using (
    exists (
      select 1 from student_enrollments e
      where e.group_id = groups.id
        and e.student_id = public.current_student_id()
    )
  );

-- ---------------------------------------------------------------------------
-- assign_students_to_groups() — clasificación automática
-- ---------------------------------------------------------------------------
-- Inscribe a todo alumno SIN grupo cuyo 1.0 coincide con EXACTAMENTE un grupo
-- (periodo, frecuencia, idioma). Ninguno o varios (dos maestros dan la misma
-- combinación) → se queda sin grupo y lo asigna el admin a mano: adivinar el
-- maestro sería peor que no asignarlo.
--
-- Devuelve cuántos inscribió. Idempotente.
create or replace function public.assign_students_to_groups()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare n int;
begin
  insert into student_enrollments (student_id, group_id)
  select dir.student_id, (array_agg(g.id))[1]
  from v_students_directory dir
  join groups g
    on g.period_code = upper(btrim(dir.period_code))
   and g.session_day = dir.session_day
   and g.language    = dir.language
  where dir.group_id is null
  group by dir.student_id
  having count(*) = 1;

  get diagnostics n = row_count;
  return n;
end;
$$;

revoke execute on function public.assign_students_to_groups() from public, anon, authenticated;

-- La sincronización horaria (import_sheet_rows(), 0015/0021) escribe
-- `demographics` cada vez que llega un 1.0. Un trigger por sentencia sobre esa
-- tabla clasifica a los alumnos nuevos sin tener que reescribir la función de
-- sincronización completa.
create or replace function public.trg_assign_students_to_groups()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assign_students_to_groups();
  return null;
end;
$$;

create trigger demographics_assign_groups
  after insert on demographics
  for each statement
  execute function public.trg_assign_students_to_groups();

-- ---------------------------------------------------------------------------
-- admin_create_group()
-- ---------------------------------------------------------------------------
-- Función y no política de INSERT: el periodo puede ser nuevo y hay que darlo
-- de alta en `periods`, que no tiene política de escritura.
--
-- Mientras no existan los roles de maestro (fase 2), un maestro es un perfil
-- admin activo: hoy es el único tipo de usuario del panel que da clase.
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
    where p.id = p_teacher_id and p.is_active and p.role = 'admin'
  ) then
    raise exception 'El maestro no existe o no está activo';
  end if;

  insert into periods (code) values (v_per) on conflict do nothing;

  insert into groups (period_code, session_day, language, teacher_id)
  values (v_per, p_session_day, p_language, p_teacher_id)
  returning id into v_id;

  -- Un grupo nuevo puede ser justo el que esperaban alumnos sin grupo.
  perform public.assign_students_to_groups();

  return v_id;
exception
  when unique_violation then
    raise exception 'Ese grupo ya existe';
end;
$$;

revoke execute on function public.admin_create_group(text, session_day, language, uuid) from public, anon;
grant execute on function public.admin_create_group(text, session_day, language, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- admin_move_student() — asignar o mover a un alumno de grupo
-- ---------------------------------------------------------------------------
-- Si el alumno ya está en un grupo del mismo periodo, se reemplaza; si no,
-- se inscribe. Los grupos de otros periodos no se tocan.
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
  if not public.is_admin() then
    raise exception 'Solo un administrador puede mover alumnos de grupo';
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

revoke execute on function public.admin_move_student(uuid, uuid) from public, anon;
grant execute on function public.admin_move_student(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- admin_register_students() — ahora inscribe en un GRUPO
-- ---------------------------------------------------------------------------
-- Misma firma y mismo formato de entrada y salida que en 0031 (el Excel no
-- cambia). Lo que cambia: periodo + frecuencia + idioma se resuelven al grupo
-- que tiene esa combinación. Si no hay ninguno, o hay varios (de maestros
-- distintos), la fila falla con un motivo claro: el alumno no se queda en un
-- grupo adivinado.
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
  if not public.is_admin() then
    raise exception 'Solo un administrador puede registrar alumnos';
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

      select array_agg(g.id) into v_grupos
      from groups g
      where g.period_code = v_per
        and g.session_day = v_freq_n
        and g.language    = v_idi_n;

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
