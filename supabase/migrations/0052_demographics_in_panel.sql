-- 0052_demographics_in_panel.sql — El 1.0 Datos Demográficos se contesta en el portal
-- Ver docs/DATABASE_SCHEMA.md#el-10-se-contesta-en-el-portal
--
-- Fase 2 de Actividades (0051). El 1.0 deja de ser solo Google Forms: el
-- alumno lo contesta en su portal cuando el profesor publica la actividad.
-- Abrirle un formulario más al alumno es una decisión que se pide (regla
-- «Toda pantalla nace protegida»); la pidió el profesor el 2026-11-11.
--
-- Qué ya NO se pregunta: periodo, frecuencia e idioma (los da el grupo en el
-- que el profesor registró al alumno) ni la matrícula y el correo
-- institucional (los da el registro). Tampoco se guardan: `demographics`
-- deja period_code, session_day y student_number en NULL, y
-- submissions.language en NULL, igual que las bitácoras (0016). Guardarlos
-- sería repetir un hecho que ya vive en `groups`/`students` y que podría
-- contradecirlo (4FN). Las vistas los toman del grupo y del registro.
--
-- El 1.0 de Google Forms convive: la sincronización del Sheets no cambia, y
-- sus filas (con periodo y frecuencia contestados) siguen entrando igual.
--
-- No hay UPDATE ni DELETE: corregir el 1.0 es volver a entregarlo, y la
-- entrega anterior queda en el historial (regla «Historial completo»). La
-- más reciente es la vigente (latest_submissions).

-- ---------------------------------------------------------------------------
-- Permiso: el alumno puede entregar el 1.0
-- ---------------------------------------------------------------------------
update app_screens
set max_access = 'edicion', audience = 'ambos'
where code = 'form1_0';

insert into role_screen_access (role_code, screen_code, access)
values ('alumno', 'form1_0', 'edicion')
on conflict (role_code, screen_code) do update set access = excluded.access;

-- ---------------------------------------------------------------------------
-- Políticas de escritura del alumno
-- ---------------------------------------------------------------------------
-- La de 0016, con el 1.0 en la lista. `source_row_key is null` sigue: el
-- alumno no puede inventar la llave de una fila del Sheets.
alter policy submissions_insert_own on submissions
  with check (
    student_id = (select public.current_student_id())
    and form_code in ('form_busqueda', 'form_practicas', 'form1_0')
    and source_row_key is null
  );

create policy demographics_insert_own on demographics
  for insert to authenticated
  with check (
    exists (
      select 1 from submissions sub
      where sub.id = demographics.submission_id
        and sub.student_id = (select public.current_student_id())
        and sub.form_code = 'form1_0'
    )
  );

grant insert on demographics to authenticated;

-- ---------------------------------------------------------------------------
-- submit_demographics() — entregar el 1.0
-- ---------------------------------------------------------------------------
-- SECURITY INVOKER, como submit_*_log (0016): las políticas son la guarda y el
-- alumno sale de current_student_id(), nunca de un parámetro. Las dos filas
-- van en una sola transacción.
create or replace function public.submit_demographics(
  p_full_name      text,
  p_personal_email text,
  p_birth_date     date,
  p_birth_country  text,
  p_gender         gender,
  p_degree_code    text,
  p_semester       smallint
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_student uuid := public.current_student_id();
  v_email   text := lower(btrim(coalesce(p_personal_email, '')));
  v_id      uuid;
begin
  if v_student is null then
    raise exception 'Tu cuenta no está asociada a ningún alumno.';
  end if;
  if not public.activity_is_open('form1_0') then
    raise exception 'Esta actividad ya está cerrada o todavía no está disponible.';
  end if;

  if nullif(btrim(p_full_name), '') is null
     or v_email = ''
     or p_birth_date is null
     or nullif(btrim(p_birth_country), '') is null
     or p_gender is null
     or nullif(btrim(p_degree_code), '') is null
     or p_semester is null then
    raise exception 'Contesta todas las preguntas.';
  end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Escribe un correo personal válido.';
  end if;
  if p_birth_date > current_date or p_birth_date < date '1900-01-01' then
    raise exception 'Revisa tu fecha de nacimiento.';
  end if;
  if p_semester not between 1 and 12 then
    raise exception 'El semestre tiene que estar entre 1 y 12.';
  end if;

  insert into submissions (student_id, form_code, submitted_at)
  values (v_student, 'form1_0', now())
  returning id into v_id;

  insert into demographics (
    submission_id, full_name, personal_email, birth_date, birth_country,
    gender, degree_code, semester
  )
  values (
    v_id, btrim(p_full_name), v_email::citext, p_birth_date, btrim(p_birth_country),
    p_gender, upper(btrim(p_degree_code)), p_semester
  );

  return v_id;
end;
$$;

revoke execute on function public.submit_demographics(text, text, date, text, gender, text, smallint) from public, anon;
grant  execute on function public.submit_demographics(text, text, date, text, gender, text, smallint) to authenticated;

-- ---------------------------------------------------------------------------
-- v_panel_demographics — periodo, frecuencia, idioma y matrícula del grupo
-- ---------------------------------------------------------------------------
-- Mismas columnas y en el mismo orden que 0033 (que usaba d.*). Ahora el
-- grupo y el registro mandan, y la respuesta del Sheets queda de respaldo,
-- igual que en v_students_directory. Así el 1.0 contestado en el portal no
-- sale con esas columnas vacías, y los filtros del panel lo encuentran.
create or replace view v_panel_demographics as
select
  s.id    as student_id,
  s.institutional_email,
  ls.submitted_at,
  coalesce(ce.language, ls.language)               as language,
  d.submission_id,
  d.full_name,
  coalesce(d.student_number, s.student_number)     as student_number,
  d.personal_email,
  d.birth_date,
  d.birth_country,
  d.gender,
  d.degree_code,
  d.semester,
  coalesce(ce.period_code, d.period_code)          as period_code,
  coalesce(ce.session_day, d.session_day)          as session_day,
  ce.group_id
from students s
join latest_submissions ls
  on ls.student_id = s.id
 and ls.form_code = 'form1_0'
join demographics d on d.submission_id = ls.id
left join v_current_enrollments ce on ce.student_id = s.id;

alter view v_panel_demographics set (security_invoker = on);
