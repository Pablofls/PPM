-- 0016_student_weekly_logs.sql — El alumno entrega sus bitácoras desde el panel
-- Ver docs/DATABASE_SCHEMA.md#bitácoras-semanales y docs/AUTH.md
--
-- Hasta aquí el alumno tenía cuenta pero no leía ni escribía una sola fila: las
-- entregas entraban por Google Forms y las traía el Apps Script cada hora
-- (0015). Esta migración abre el otro camino para los dos reportes semanales:
-- el alumno los contesta dentro del panel y la fila nace aquí.
--
-- Los dos caminos conviven. El del Sheets se reconoce por `source_row_key`; el
-- del panel lo deja en NULL y por eso `sheet_sync_*` nunca lo toca: todas sus
-- consultas emparejan por esa columna. Una bitácora entregada aquí no se
-- duplica ni se pisa cuando corre la sincronización.
--
-- Alcance deliberado: SOLO `form_busqueda` y `form_practicas`. Los otros trece
-- formularios se siguen contestando en Google Forms, y las políticas de abajo
-- los excluyen por código, no por confianza en la interfaz.

-- ---------------------------------------------------------------------------
-- Lectura: el alumno ve lo suyo y nada más
-- ---------------------------------------------------------------------------
-- Estas políticas son permisivas y se suman a las de `is_admin()` que ya
-- existen: el profesor sigue viendo todo, el alumno solo sus propias filas
-- (regla «Toda pantalla nace protegida y admin-only» de CLAUDE.md, lado alumno).
--
-- `current_student_id()` devuelve NULL para el profesor y para una cuenta
-- `pendiente`, y `student_id = NULL` nunca es verdadero: una cuenta sin alumno
-- asociado no gana ni una fila por aquí.

create policy submissions_select_own on submissions
  for select to authenticated
  using (student_id = public.current_student_id());

-- Las respuestas cuelgan de `submission_id`, así que su dueño se resuelve por
-- la entrega. El EXISTS vuelve a pasar por la política de arriba —las políticas
-- de otras tablas sí aplican dentro de una subconsulta— y eso es lo que se
-- quiere: una sola definición de «mío».
create policy job_search_logs_select_own on job_search_logs
  for select to authenticated
  using (
    exists (
      select 1 from submissions sub
      where sub.id = job_search_logs.submission_id
        and sub.student_id = public.current_student_id()
    )
  );

create policy internship_logs_select_own on internship_logs
  for select to authenticated
  using (
    exists (
      select 1 from submissions sub
      where sub.id = internship_logs.submission_id
        and sub.student_id = public.current_student_id()
    )
  );

-- ---------------------------------------------------------------------------
-- Escritura: solo sus propias bitácoras, solo las dos
-- ---------------------------------------------------------------------------
-- `source_row_key is null` no es cosmético: es lo que impide que un alumno
-- invente la llave de una fila del Sheets y, con ella, bloquee o secuestre lo
-- que la sincronización iba a importar (la columna es UNIQUE).
create policy submissions_insert_own on submissions
  for insert to authenticated
  with check (
    student_id = public.current_student_id()
    and form_code in ('form_busqueda', 'form_practicas')
    and source_row_key is null
  );

create policy job_search_logs_insert_own on job_search_logs
  for insert to authenticated
  with check (
    exists (
      select 1 from submissions sub
      where sub.id = job_search_logs.submission_id
        and sub.student_id = public.current_student_id()
        and sub.form_code = 'form_busqueda'
    )
  );

create policy internship_logs_insert_own on internship_logs
  for insert to authenticated
  with check (
    exists (
      select 1 from submissions sub
      where sub.id = internship_logs.submission_id
        and sub.student_id = public.current_student_id()
        and sub.form_code = 'form_practicas'
    )
  );

-- NO hay políticas de UPDATE ni de DELETE, y es a propósito: una entrega no se
-- edita ni se borra. Corregir una semana es mandarla de nuevo, y las dos quedan
-- en el expediente (regla «Historial completo» de CLAUDE.md). Es también lo que
-- hacía Google Forms, donde el alumno nunca pudo volver sobre lo enviado.

-- Supabase otorga estos privilegios por omisión a `authenticated`; se escriben
-- para que el permiso de escritura del alumno quede dicho en alguna parte y no
-- dependa de una configuración invisible del proyecto.
grant insert on submissions, job_search_logs, internship_logs to authenticated;

-- ---------------------------------------------------------------------------
-- Las dos entregas, cada una en una transacción
-- ---------------------------------------------------------------------------
-- Por qué una función y no dos inserts desde el navegador: la entrega son dos
-- filas (la de `submissions` y la de la bitácora) y el cliente no tiene
-- transacciones. Si la segunda falla, queda una entrega vacía en el expediente
-- del alumno —una semana reportada sin nada reportado— que nadie puede borrar,
-- porque arriba no hay política de DELETE.
--
-- SECURITY INVOKER (el valor por omisión, escrito abajo por claridad): la
-- función NO es el guardia. Corre con los permisos del alumno y choca contra
-- las mismas políticas que un insert directo. Suplantar a otro alumno pasando
-- otro `student_id` no es posible porque el `student_id` no se recibe: sale de
-- `current_student_id()`.

-- Lo que las dos comparten: crear la entrega y validar la semana.
--
-- La semana se valida aquí y no con un CHECK en la tabla porque la tabla tiene
-- que seguir aceptando los rangos invertidos que ya se importaron del Sheets
-- (18 de 183 entregas; ver docs/DATA_MAPPING.md). Lo que llega mal de la
-- historia se conserva; lo que se captura hoy se captura bien.
create or replace function public.new_weekly_submission(
  p_form_code  text,
  p_week_start date,
  p_week_end   date
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_student uuid := public.current_student_id();
  v_id      uuid;
begin
  if v_student is null then
    raise exception 'Tu cuenta no está asociada a ningún alumno.';
  end if;

  if p_week_start is null or p_week_end is null then
    raise exception 'Indica el inicio y el final de la semana que reportas.';
  end if;

  if p_week_end < p_week_start then
    raise exception 'El final de la semana no puede ser anterior a su inicio.';
  end if;

  -- Una semana del futuro es siempre un error de captura: la bitácora reporta
  -- lo que ya se trabajó.
  if p_week_start > current_date then
    raise exception 'Todavía no puedes reportar una semana que no ha empezado.';
  end if;

  -- La semana va en este mismo INSERT y no en un UPDATE posterior: arriba no
  -- hay política de UPDATE, y bajo RLS un update sin política no truena, afecta
  -- cero filas. La entrega habría quedado sin la semana que reporta.
  insert into submissions (student_id, form_code, submitted_at, language, week_start, week_end)
  values (v_student, p_form_code, now(), null, p_week_start, p_week_end)
  returning id into v_id;

  return v_id;
end;
$$;

-- `language` se deja en NULL a propósito: es el idioma en que el alumno
-- contestó el Google Form, y el panel no le pregunta el idioma a nadie.
-- Deducirlo de `demographics` no funciona desde aquí: el alumno no tiene
-- permiso de leer esa tabla, y el SELECT devolvería NULL de todos modos.

comment on function public.new_weekly_submission(text, date, date) is
  'Crea la entrega de una bitácora para el alumno de la sesión. Uso interno de submit_*_log().';

-- ---------------------------------------------------------------------------
-- submit_job_search_log() — Reporte de Búsqueda
-- ---------------------------------------------------------------------------
create or replace function public.submit_job_search_log(
  p_week_start   date,
  p_week_end     date,
  p_activities   text,
  p_applications text,
  p_interviews   text,
  p_learnings    text,
  p_next_steps   text
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid := public.new_weekly_submission('form_busqueda', p_week_start, p_week_end);
begin
  -- nullif(btrim(...), ''): un campo que el alumno dejó en blanco vale NULL,
  -- no cadena vacía. La pantalla del profesor distingue «no contestó» de
  -- «contestó vacío» y pinta un guion.
  insert into job_search_logs (
    submission_id, activities, applications, interviews, learnings, next_steps
  )
  values (
    v_id,
    nullif(btrim(p_activities),   ''),
    nullif(btrim(p_applications), ''),
    nullif(btrim(p_interviews),   ''),
    nullif(btrim(p_learnings),    ''),
    nullif(btrim(p_next_steps),   '')
  );

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- submit_internship_log() — Reporte de Prácticas
-- ---------------------------------------------------------------------------
create or replace function public.submit_internship_log(
  p_week_start       date,
  p_week_end         date,
  p_activities       text,
  p_hours_worked     numeric,
  p_skills_practiced text,
  p_proposal         text
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
begin
  -- Se valida antes de crear nada. El CHECK de la tabla ya acota 0–500, pero su
  -- mensaje habla de `internship_logs_horas_plausibles` y lo lee un alumno, no
  -- un administrador. 168 son las horas que tiene una semana.
  if p_hours_worked is not null and (p_hours_worked < 0 or p_hours_worked > 168) then
    raise exception 'Las horas de la semana tienen que estar entre 0 y 168.';
  end if;

  v_id := public.new_weekly_submission('form_practicas', p_week_start, p_week_end);

  insert into internship_logs (
    submission_id, activities, hours_worked, skills_practiced, proposal
  )
  values (
    v_id,
    nullif(btrim(p_activities), ''),
    p_hours_worked,
    nullif(btrim(p_skills_practiced), ''),
    nullif(btrim(p_proposal), '')
  );

  return v_id;
end;
$$;

-- `anon` no entrega nada: hace falta sesión para que current_student_id()
-- devuelva algo, pero se revoca igual para que no sea un descuido silencioso.
revoke execute on function public.new_weekly_submission(text, date, date) from public, anon;
revoke execute on function public.submit_job_search_log(date, date, text, text, text, text, text) from public, anon;
revoke execute on function public.submit_internship_log(date, date, text, numeric, text, text) from public, anon;

grant execute on function public.new_weekly_submission(text, date, date) to authenticated;
grant execute on function public.submit_job_search_log(date, date, text, text, text, text, text) to authenticated;
grant execute on function public.submit_internship_log(date, date, text, numeric, text, text) to authenticated;
