-- 0020_weekly_log_current_week_only.sql — El alumno solo entrega la semana en
-- curso, y la puede corregir mientras siga en curso
-- Ver docs/DATABASE_SCHEMA.md#bitácoras-semanales y docs/AUTH.md
--
-- Hasta aquí el alumno elegía cualquier semana configurada -incluidas
-- atrasadas- y cada entrega se acumulaba sin límite (regla «Historial
-- completo» de CLAUDE.md, y el comentario de 0016: "una entrega no se edita
-- ni se borra"). El profesor pidió lo contrario para las dos bitácoras: la
-- pantalla ya no deja elegir semana -siempre es la de hoy- y mientras esa
-- semana siga en curso, volver a abrir el formulario permite corregir lo que
-- ya se mandó en vez de acumular una fila más.
--
-- Es una excepción deliberada y acotada a la regla «Historial completo»: en
-- cuanto la semana termina, la fila vuelve a ser inmutable para siempre -no
-- hay política de UPDATE sobre una semana pasada-, así que el expediente que
-- ya se cerró no cambia. Lo único distinto es que la semana en curso ahora
-- tiene una sola versión vigente en vez de acumular reenvíos.

-- ---------------------------------------------------------------------------
-- new_weekly_submission(): ya no basta con "no sea futura", tiene que ser HOY
-- ---------------------------------------------------------------------------
-- Antes se aceptaba cualquier semana ya empezada -era la forma de ponerse al
-- corriente con una semana atrasada-. Eso se acaba aquí: la pantalla del
-- alumno ya no ofrece otra semana que la de hoy, y el servidor deja de
-- confiar en que el cliente mande la correcta. Misma firma que 0018
-- (`p_form_code text, p_week_number smallint`), así que `create or replace`
-- basta -no hace falta el `drop function` que sí hizo falta ahí, porque ahí
-- el número de parámetros cambió y aquí no-.
create or replace function public.new_weekly_submission(
  p_form_code   text,
  p_week_number smallint
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_student uuid := public.current_student_id();
  v_period  text := public.current_student_period();
  v_week    record;
  v_id      uuid;
begin
  if v_student is null then
    raise exception 'Tu cuenta no está asociada a ningún alumno.';
  end if;

  if p_week_number is null then
    raise exception 'Indica qué semana estás reportando.';
  end if;

  if v_period is null then
    raise exception 'Tu cuenta no tiene un periodo asignado. Contacta a tu profesor.';
  end if;

  select week_start, week_end into v_week
  from semester_weeks
  where period_code = v_period
    and week_number = p_week_number;

  if not found then
    raise exception 'Esa semana no está configurada para tu periodo. Contacta a tu profesor.';
  end if;

  if current_date < v_week.week_start or current_date > v_week.week_end then
    raise exception 'Solo puedes entregar la semana en curso.';
  end if;

  insert into submissions (student_id, form_code, submitted_at, language, week_start, week_end)
  values (v_student, p_form_code, now(), null, v_week.week_start, v_week.week_end)
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.new_weekly_submission(text, smallint) is
  'Crea la entrega de una bitácora para el alumno de la sesión, solo si la semana pedida es la semana en curso. Uso interno de submit_*_log().';

-- ---------------------------------------------------------------------------
-- Corregir la semana en curso: UPDATE acotado por fecha, no por confianza en
-- la pantalla
-- ---------------------------------------------------------------------------
-- `submissions` NO gana política de UPDATE: lo que identifica a la entrega
-- (quién, qué formulario, qué semana) no cambia nunca, se corrija o no se
-- corrija el contenido. Lo único editable es el contenido, que vive en
-- `job_search_logs` / `internship_logs`. Por eso las dos políticas de abajo
-- van sobre esas tablas y no sobre `submissions`.
--
-- `current_date between sub.week_start and sub.week_end` en el USING y en el
-- WITH CHECK: el USING decide si el alumno puede tocar la fila hoy: el WITH
-- CHECK se vuelve a evaluar sobre la fila resultante, así que un intento de
-- reasignar `submission_id` a la entrega de otra semana -propia o ajena- se
-- rechaza igual, sin necesidad de restringir columnas por separado.
create policy job_search_logs_update_own_current_week on job_search_logs
  for update to authenticated
  using (
    exists (
      select 1 from submissions sub
      where sub.id = job_search_logs.submission_id
        and sub.student_id = public.current_student_id()
        and sub.form_code = 'form_busqueda'
        and current_date between sub.week_start and sub.week_end
    )
  )
  with check (
    exists (
      select 1 from submissions sub
      where sub.id = job_search_logs.submission_id
        and sub.student_id = public.current_student_id()
        and sub.form_code = 'form_busqueda'
        and current_date between sub.week_start and sub.week_end
    )
  );

create policy internship_logs_update_own_current_week on internship_logs
  for update to authenticated
  using (
    exists (
      select 1 from submissions sub
      where sub.id = internship_logs.submission_id
        and sub.student_id = public.current_student_id()
        and sub.form_code = 'form_practicas'
        and current_date between sub.week_start and sub.week_end
    )
  )
  with check (
    exists (
      select 1 from submissions sub
      where sub.id = internship_logs.submission_id
        and sub.student_id = public.current_student_id()
        and sub.form_code = 'form_practicas'
        and current_date between sub.week_start and sub.week_end
    )
  );

-- Supabase otorga UPDATE por omisión a `authenticated`, igual que INSERT
-- (comentario de 0016); se escribe para que quede dicho, no porque haga falta.
grant update on job_search_logs, internship_logs to authenticated;

-- ---------------------------------------------------------------------------
-- update_job_search_log() / update_internship_log()
-- ---------------------------------------------------------------------------
-- Mismo patrón que submit_*_log() (0016): SECURITY INVOKER, la función no es
-- el guardia -las políticas de arriba lo son-. Si la semana ya no es la
-- actual (o la entrega no es del alumno), el UPDATE afecta cero filas sin
-- que Postgres lo marque como error, y `not found` es lo que lo convierte en
-- un mensaje legible en vez de un guardado silencioso que no guardó nada.
create or replace function public.update_job_search_log(
  p_submission_id uuid,
  p_activities    text,
  p_applications  text,
  p_interviews    text,
  p_learnings     text,
  p_next_steps    text
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  update job_search_logs
  set
    activities   = nullif(btrim(p_activities),   ''),
    applications = nullif(btrim(p_applications), ''),
    interviews   = nullif(btrim(p_interviews),   ''),
    learnings    = nullif(btrim(p_learnings),    ''),
    next_steps   = nullif(btrim(p_next_steps),   '')
  where submission_id = p_submission_id;

  if not found then
    raise exception 'Ya no puedes corregir esa entrega: no es tuya, o su semana ya no es la actual.';
  end if;
end;
$$;

create or replace function public.update_internship_log(
  p_submission_id    uuid,
  p_activities       text,
  p_hours_worked     numeric,
  p_skills_practiced text,
  p_proposal         text
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if p_hours_worked is not null and (p_hours_worked < 0 or p_hours_worked > 168) then
    raise exception 'Las horas de la semana tienen que estar entre 0 y 168.';
  end if;

  update internship_logs
  set
    activities       = nullif(btrim(p_activities), ''),
    hours_worked     = p_hours_worked,
    skills_practiced = nullif(btrim(p_skills_practiced), ''),
    proposal         = nullif(btrim(p_proposal), '')
  where submission_id = p_submission_id;

  if not found then
    raise exception 'Ya no puedes corregir esa entrega: no es tuya, o su semana ya no es la actual.';
  end if;
end;
$$;

comment on function public.update_job_search_log(uuid, text, text, text, text, text) is
  'Corrige el contenido de una entrega de Reporte de Búsqueda ya hecha, solo si su semana sigue siendo la semana en curso.';
comment on function public.update_internship_log(uuid, text, numeric, text, text) is
  'Corrige el contenido de una entrega de Reporte de Prácticas ya hecha, solo si su semana sigue siendo la semana en curso.';

revoke execute on function public.update_job_search_log(uuid, text, text, text, text, text) from public, anon;
revoke execute on function public.update_internship_log(uuid, text, numeric, text, text) from public, anon;

grant execute on function public.update_job_search_log(uuid, text, text, text, text, text) to authenticated;
grant execute on function public.update_internship_log(uuid, text, numeric, text, text) to authenticated;
