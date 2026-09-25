-- 0017_form_deadlines.sql — Fechas límite y estado de entregas
-- Ver docs/DATABASE_SCHEMA.md#fechas-de-entrega, docs/FORMS_CATALOG.md y
-- docs/DATA_MAPPING.md#fechas_entrega--form_deadlines
--
-- Hasta aquí `submissionState` existía como tipo pero vivía hardcodeado a
-- 'sin_fecha' en el repositorio (no había con qué comparar la marca temporal
-- de una entrega). Esta migración agrega la fuente que faltaba: el profesor
-- asigna la fecha desde el panel («Panel de Administrador»), en vez de editar
-- a mano la hoja `fechas_entrega` del Sheets como en la plataforma anterior.
--
-- form1_0 (perfil, no es una entrega con plazo) y las dos bitácoras semanales
-- (nunca estuvieron en la tabla `forms`) quedan fuera a propósito.

-- ---------------------------------------------------------------------------
-- submission_state — antes solo existía como unión de TypeScript
-- ---------------------------------------------------------------------------
create type submission_state as enum ('a_tiempo', 'tarde', 'pendiente', 'sin_fecha');

-- ---------------------------------------------------------------------------
-- form_deadlines — una regla por formulario y grupo
-- ---------------------------------------------------------------------------
-- `language`, `session_day` y `period_code` en NULL significan "todos": el
-- profesor puede fijar una fecha general o acotarla a un grupo, combinando las
-- tres dimensiones a la vez (a diferencia de la hoja original, que solo traía
-- una fecha por formulario y periodo).
create table form_deadlines (
  id          uuid primary key default gen_random_uuid(),
  form_code   text not null references forms(code),
  language    language,
  session_day session_day,
  period_code text,
  due_at      timestamptz not null,
  created_at  timestamptz not null default now()
);

-- Un `unique` normal no basta: Postgres trata dos NULL como distintos, así que
-- dos reglas idénticas con las tres columnas vacías no chocarían. `NULLS NOT
-- DISTINCT` (Postgres 15+) es la forma nativa de pedir lo contrario, sin
-- envolver las columnas en una expresión: castear un enum a `text` para un
-- índice funcional falla con "functions in index expression must be marked
-- IMMUTABLE", porque ese cast es STABLE, no IMMUTABLE.
create unique index idx_form_deadlines_unique
  on form_deadlines (form_code, language, session_day, period_code)
  nulls not distinct;

alter table form_deadlines enable row level security;

-- Primera tabla donde el admin escribe desde el navegador y no solo lee: no
-- hace falta una función como las de 0016 porque aquí no hay dos tablas que
-- mantener juntas ni un `student_id` que proteger de que alguien lo falsifique
-- — quien escribe ya pasó por `is_admin()`.
create policy form_deadlines_select_admin on form_deadlines
  for select to authenticated using (public.is_admin());

create policy form_deadlines_insert_admin on form_deadlines
  for insert to authenticated with check (public.is_admin());

-- Sin política de UPDATE: corregir una fecha es borrarla y volver a crearla,
-- igual que "no hay UPDATE" en las entregas del alumno (regla «Historial
-- completo» de CLAUDE.md, aplicada aquí a las reglas y no a las entregas).
create policy form_deadlines_delete_admin on form_deadlines
  for delete to authenticated using (public.is_admin());

grant select, insert, delete on form_deadlines to authenticated;

-- ---------------------------------------------------------------------------
-- resolve_form_deadline() — qué regla aplica
-- ---------------------------------------------------------------------------
-- Entre las reglas de un formulario cuyo idioma/frecuencia/periodo sea NULL
-- (aplica a todos) o coincida con el valor dado, gana la más específica: la
-- que coincide en más de esas tres columnas. Empate → la más reciente.
create or replace function public.resolve_form_deadline(
  p_form_code   text,
  p_language    language,
  p_session_day session_day,
  p_period_code text
)
returns timestamptz
language sql
stable
as $$
  select due_at
  from form_deadlines
  where form_code = p_form_code
    and (language is null or language = p_language)
    and (session_day is null or session_day = p_session_day)
    and (period_code is null or period_code = p_period_code)
  order by
    (
      (language is not null)::int
      + (session_day is not null)::int
      + (period_code is not null)::int
    ) desc,
    created_at desc
  limit 1
$$;

-- ---------------------------------------------------------------------------
-- submission_status() — comparar la marca temporal contra la fecha límite
-- ---------------------------------------------------------------------------
create or replace function public.submission_status(
  p_due_at       timestamptz,
  p_submitted_at timestamptz
)
returns submission_state
language sql
immutable
as $$
  select case
    -- Sin fecha configurada no se penaliza a nadie: se avisa que falta
    -- configurarla, no que el alumno esté atrasado.
    when p_due_at is null then 'sin_fecha'::submission_state
    when p_submitted_at is null then 'pendiente'::submission_state
    when p_submitted_at <= p_due_at then 'a_tiempo'::submission_state
    else 'tarde'::submission_state
  end
$$;

-- ---------------------------------------------------------------------------
-- v_submission_status — la matriz alumno × formulario de "Estado de Entregas"
-- ---------------------------------------------------------------------------
-- A diferencia de las vistas v_panel_*, aquí SÍ importa el alumno que no ha
-- entregado: por eso es un LEFT JOIN contra latest_submissions y no un JOIN.
--
-- `language` expone el idioma de la entrega más reciente del alumno en
-- cualquier formulario (no el de esta fila en particular): así el filtro de
-- Idioma de la pantalla selecciona alumnos, no entregas sueltas. Si se tomara
-- el idioma de cada fila, un alumno que aún no entrega form2_7 desaparecería
-- de esa columna en cuanto se filtrara por idioma, aunque siga sin entregar.
create view v_submission_status as
select
  dir.student_id,
  dir.institutional_email,
  dir.full_name,
  dir.degree_code,
  dir.semester,
  dir.period_code,
  dir.session_day,
  lang.language,
  f.code as form_code,
  ls.submitted_at,
  public.resolve_form_deadline(f.code, ls.language, dir.session_day, dir.period_code) as due_at,
  public.submission_status(
    public.resolve_form_deadline(f.code, ls.language, dir.session_day, dir.period_code),
    ls.submitted_at
  ) as state
from v_students_directory dir
cross join (
  select code from forms where code <> 'form1_0'
) f
left join lateral (
  select sub.language
  from submissions sub
  where sub.student_id = dir.student_id
    and sub.language is not null
  order by sub.submitted_at desc
  limit 1
) lang on true
left join latest_submissions ls
  on ls.student_id = dir.student_id
 and ls.form_code = f.code;

alter view v_submission_status set (security_invoker = on);
