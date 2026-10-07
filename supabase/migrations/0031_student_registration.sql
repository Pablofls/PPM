-- 0031_student_registration.sql — Alta de alumnos por el profesor (sin 1.0)
-- Ver docs/DATABASE_SCHEMA.md#registro-de-alumnos y docs/AUTH.md
--
-- Hasta ahora una cuenta de alumno solo nacía si el alumno contestaba el
-- formulario 1.0: la matrícula (su contraseña inicial) viene de `demographics`.
-- Esta migración deja que el profesor dé de alta al alumno directamente con
-- cinco datos: correo institucional, matrícula, periodo, frecuencia e idioma.
--
-- Modelo (normalizado hasta 4FN):
--   * correo y matrícula identifican al alumno y no cambian por periodo
--     → `students` (los dos son llaves candidatas; BCNF).
--   * periodo, frecuencia e idioma describen la INSCRIPCIÓN del alumno en un
--     periodo, no al alumno: el mismo alumno puede cursar otro periodo con otra
--     frecuencia o idioma → `student_enrollments`, llave (student_id, period_code).
--     Frecuencia e idioma son hechos de un solo valor por inscripción, no
--     hechos multivaluados independientes, así que no hay MVD y se cumple 4FN.
--   * el periodo es un dominio con identidad propia → catálogo `periods` con FK.
--
-- `demographics.period_code/session_day` y `submissions.language` NO se tocan:
-- son lo que el alumno respondió en una entrega concreta (historial), no el
-- hecho vigente. La vista prefiere el 1.0 y cae a la inscripción solo al leer.

-- ---------------------------------------------------------------------------
-- periods — catálogo de periodos
-- ---------------------------------------------------------------------------
create table periods (
  code       text primary key,
  created_at timestamptz not null default now(),

  constraint periods_formato check (code ~ '^[A-Z]{2}-[0-9]{2}$')
);

-- Se siembra con lo que ya existe en la base. Los códigos que no cumplan el
-- formato se ignoran: no se inventa un periodo para un dato sucio.
insert into periods (code)
select distinct upper(btrim(c))
from (
  select period_code as c from demographics
  union
  select period_code from semester_weeks
  union
  select period_code from form_deadlines
) todos
where c is not null
  and upper(btrim(c)) ~ '^[A-Z]{2}-[0-9]{2}$'
on conflict do nothing;

alter table periods enable row level security;

create policy periods_select_admin on periods
  for select to authenticated using (public.is_admin());

grant select on periods to authenticated;

-- ---------------------------------------------------------------------------
-- students.student_number
-- ---------------------------------------------------------------------------
-- Nullable: los alumnos que llegaron por el 1.0 siguen tomando su matrícula de
-- `demographics`. Única donde exista: dos alumnos con la misma matrícula serían
-- dos cuentas con la misma contraseña inicial.
alter table students add column student_number text;

create unique index idx_students_student_number
  on students (student_number)
  where student_number is not null;

-- ---------------------------------------------------------------------------
-- student_enrollments — inscripción de un alumno en un periodo
-- ---------------------------------------------------------------------------
create table student_enrollments (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references students (id) on delete cascade,
  period_code text not null references periods (code),
  session_day session_day not null,
  language    language not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  unique (student_id, period_code)
);

alter table student_enrollments enable row level security;

-- Solo lectura para el admin. La escritura pasa por admin_register_students():
-- no hay política de INSERT/UPDATE/DELETE, así que ninguna otra puerta existe.
create policy student_enrollments_select_admin on student_enrollments
  for select to authenticated using (public.is_admin());

grant select on student_enrollments to authenticated;

-- ---------------------------------------------------------------------------
-- v_students_directory — el 1.0 manda; la inscripción es el respaldo
-- ---------------------------------------------------------------------------
-- Las columnas existentes conservan nombre, tipo y orden (otras vistas dependen
-- de esta); solo cambia de dónde sale matrícula, periodo y frecuencia, y se
-- agrega `language` al final. create_student_accounts() (0014) lee la matrícula
-- de aquí, así que no necesita cambios: un alumno registrado ya tiene matrícula.
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
  coalesce(d.period_code, e.period_code)       as period_code,
  coalesce(d.session_day, e.session_day)       as session_day,
  coalesce(d.sub_language, e.language)         as language
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
left join lateral (
  select en.period_code, en.session_day, en.language
  from student_enrollments en
  where en.student_id = s.id
  order by en.created_at desc
  limit 1
) e on true;

alter view v_students_directory set (security_invoker = on);

-- ---------------------------------------------------------------------------
-- admin_register_students(p_rows jsonb)
-- ---------------------------------------------------------------------------
-- Recibe un arreglo de objetos {correo, matricula, periodo, frecuencia, idioma}
-- y devuelve un arreglo {fila, correo, resultado, cuenta} en el mismo orden.
-- `fila` es la posición (1, 2, ...) en el arreglo recibido.
--
--   resultado: creado | actualizado | sin cambios | error: motivo
--   cuenta:    creado | ya existía: perfil enlazado | omitido: ... | null
--
-- Una fila inválida no aborta las demás. La matrícula no se devuelve: es la
-- contraseña inicial.
--
-- SECURITY DEFINER para poder escribir en tablas que no tienen política de
-- escritura y llamar a create_student_accounts() (EXECUTE revocado). Como una
-- función definer no tiene RLS que la proteja, empieza comprobando is_admin()
-- (mismo patrón que admin_run_sheet_sync(), 0022).
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
  s_id      uuid;
  s_mat     text;
  d_mat     text;
  e_row     student_enrollments%rowtype;
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

      insert into periods (code) values (v_per) on conflict do nothing;

      select * into e_row
      from student_enrollments en
      where en.student_id = s_id and en.period_code = v_per;

      if not found then
        insert into student_enrollments (student_id, period_code, session_day, language)
        values (s_id, v_per, v_freq_n, v_idi_n);
        if resultado = 'sin cambios' then resultado := 'actualizado'; end if;
      elsif e_row.session_day is distinct from v_freq_n or e_row.language is distinct from v_idi_n then
        update student_enrollments
           set session_day = v_freq_n, language = v_idi_n, updated_at = now()
         where id = e_row.id;
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
