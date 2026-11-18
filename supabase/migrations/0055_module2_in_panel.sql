-- 0055_module2_in_panel.sql — El Módulo 2 (2.1, 2.2, 2.4, 2.5, 2.7) se contesta en el portal
-- Ver docs/DATABASE_SCHEMA.md#el-módulo-2-se-contesta-en-el-portal
--
-- Igual que el Módulo 1 (0054), pensando en los grupos SIGUIENTES: los de hoy
-- ya los contestaron en Google Forms, que sigue sincronizándose. El alumno los
-- contesta en el idioma de su grupo; no se le pregunta idioma ni correo.
--
--   1. Los cinco son del portal (se califican) y sus actividades quedan en
--      BORRADOR en todos los grupos.
--   2. 2.7 Indeed: fuera las columnas repetidas position_url_1..3 y
--      company_url_1..3.
--   3. Permisos, políticas y funciones de entrega del alumno.
--
-- Normalización (4FN):
--   * reflections(submission_id → was_useful, reason) ya está en 4FN.
--   * indeed_positions(submission_id, rank → title, monthly_salary, url) e
--     indeed_companies(submission_id, rank → name, url). Tres columnas
--     url_1, url_2, url_3 son un grupo repetido (ni 1FN). Puestos y compañías
--     son dos hechos multivaluados INDEPENDIENTES de la entrega: en una sola
--     tabla habría que combinar cada puesto con cada compañía (lo que prohíbe
--     la 4FN), así que van en dos.
--   * indeed_research.positions / companies se quedan: es el texto tal como
--     lo escribió el alumno en Google Forms (nombre y sueldo a mano, no se
--     puede separar con confianza). Lo entregado en el portal lo deja nulo:
--     el dato vive en las filas.
--
-- Los datos que ya existen no se pierden: cada liga pasa a su fila (sin
-- nombre); antes de borrar las columnas se cuenta que no falte ninguna.
--
-- Efecto conocido (como en 0054): con las actividades en borrador, Estado de
-- Entregas deja de usar su fecha en los grupos actuales hasta que se publiquen.

begin;

-- ---------------------------------------------------------------------------
-- 1. Los cinco formularios son del portal; sus actividades, en borrador
-- ---------------------------------------------------------------------------
update forms set answered_in_panel = true
where code in ('form2_1', 'form2_2', 'form2_4', 'form2_5', 'form2_7');

update activities set is_published = false, updated_at = now()
where form_code in ('form2_1', 'form2_2', 'form2_4', 'form2_5', 'form2_7')
  and is_published;

update app_screens
set max_access = 'edicion', audience = 'ambos'
where code in ('form2_1', 'form2_2', 'form2_4', 'form2_5', 'form2_7');

insert into role_screen_access (role_code, screen_code, access)
select 'alumno', code, 'edicion'
from (values ('form2_1'), ('form2_2'), ('form2_4'), ('form2_5'), ('form2_7')) f(code)
on conflict (role_code, screen_code) do update set access = excluded.access;

-- ---------------------------------------------------------------------------
-- 2. 2.7 Indeed: una fila por puesto y por compañía
-- ---------------------------------------------------------------------------
create table indeed_positions (
  submission_id  uuid     not null references indeed_research (submission_id) on delete cascade,
  rank           smallint not null,
  title          text,
  monthly_salary numeric(12,2),
  url            text,

  primary key (submission_id, rank),
  constraint indeed_positions_rank check (rank between 1 and 3),
  constraint indeed_positions_salary check (monthly_salary is null or monthly_salary >= 0)
);

create table indeed_companies (
  submission_id uuid     not null references indeed_research (submission_id) on delete cascade,
  rank          smallint not null,
  name          text,
  url           text,

  primary key (submission_id, rank),
  constraint indeed_companies_rank check (rank between 1 and 3)
);

-- Lo que ya existe: cada liga a su fila.
insert into indeed_positions (submission_id, rank, url)
select i.submission_id, l.rank, l.url
from indeed_research i
cross join lateral (values
  (1::smallint, i.position_url_1),
  (2::smallint, i.position_url_2),
  (3::smallint, i.position_url_3)
) as l(rank, url)
where nullif(btrim(l.url), '') is not null;

insert into indeed_companies (submission_id, rank, url)
select i.submission_id, l.rank, l.url
from indeed_research i
cross join lateral (values
  (1::smallint, i.company_url_1),
  (2::smallint, i.company_url_2),
  (3::smallint, i.company_url_3)
) as l(rank, url)
where nullif(btrim(l.url), '') is not null;

-- Revisión antes de borrar: no puede faltar ninguna liga.
do $$
declare
  v_urls bigint;
  v_rows bigint;
begin
  select count(*) into v_urls
  from indeed_research i
  cross join lateral (values
    (i.position_url_1), (i.position_url_2), (i.position_url_3),
    (i.company_url_1), (i.company_url_2), (i.company_url_3)
  ) as l(url)
  where nullif(btrim(l.url), '') is not null;

  select (select count(*) from indeed_positions) + (select count(*) from indeed_companies)
    into v_rows;

  if v_urls <> v_rows then
    raise exception 'Se esperaban % ligas del 2.7 y se copiaron %. No se cambió nada.', v_urls, v_rows;
  end if;
end $$;

-- v_panel_indeed usa i.*: se rehace sin las columnas que se van.
drop view v_panel_indeed;

alter table indeed_research
  drop column position_url_1,
  drop column position_url_2,
  drop column position_url_3,
  drop column company_url_1,
  drop column company_url_2,
  drop column company_url_3;

-- «1. Coordinador de Mercadotecnia — $35,000», una línea por puesto.
create or replace function public.indeed_positions_text(p_submission_id uuid)
returns text
language sql
stable
as $$
  select string_agg(
    concat(p.rank, '. ', coalesce(p.title, '—'),
           case when p.monthly_salary is not null
                then ' — $' || to_char(p.monthly_salary, 'FM999,999,990') end),
    E'\n' order by p.rank)
  from indeed_positions p
  where p.submission_id = p_submission_id and p.title is not null
$$;

create or replace function public.indeed_companies_text(p_submission_id uuid)
returns text
language sql
stable
as $$
  select string_agg(concat(c.rank, '. ', c.name), E'\n' order by c.rank)
  from indeed_companies c
  where c.submission_id = p_submission_id and c.name is not null
$$;

-- Las ligas por lugar (1–3), con hueco si falta alguna.
create or replace function public.indeed_position_urls(p_submission_id uuid)
returns text[]
language sql
stable
as $$
  select array[
    (select url from indeed_positions where submission_id = p_submission_id and rank = 1),
    (select url from indeed_positions where submission_id = p_submission_id and rank = 2),
    (select url from indeed_positions where submission_id = p_submission_id and rank = 3)
  ]
$$;

create or replace function public.indeed_company_urls(p_submission_id uuid)
returns text[]
language sql
stable
as $$
  select array[
    (select url from indeed_companies where submission_id = p_submission_id and rank = 1),
    (select url from indeed_companies where submission_id = p_submission_id and rank = 2),
    (select url from indeed_companies where submission_id = p_submission_id and rank = 3)
  ]
$$;

create view v_panel_indeed as
select
  dir.student_id,
  dir.institutional_email,
  dir.full_name,
  dir.degree_code,
  dir.semester,
  dir.period_code,
  dir.session_day,
  ls.submitted_at,
  coalesce(dir.language, ls.language) as language,
  i.submission_id,
  -- El texto de Google Forms o, si se entregó en el portal, las filas.
  coalesce(i.positions, public.indeed_positions_text(i.submission_id)) as positions,
  public.indeed_position_urls(i.submission_id) as position_urls,
  coalesce(i.companies, public.indeed_companies_text(i.submission_id)) as companies,
  public.indeed_company_urls(i.submission_id) as company_urls,
  dir.group_id
from v_students_directory dir
join latest_submissions ls
  on ls.student_id = dir.student_id
 and ls.form_code = 'form2_7'
join indeed_research i on i.submission_id = ls.id;

alter view v_panel_indeed set (security_invoker = on);
grant select on v_panel_indeed to authenticated;

-- 2.1–2.5: mismas columnas que 0033; el idioma lo da el grupo.
create or replace view v_panel_reflections as
select
  dir.student_id,
  dir.institutional_email,
  dir.full_name,
  dir.degree_code,
  dir.semester,
  dir.period_code,
  dir.session_day,
  ls.form_code,
  ls.submitted_at,
  coalesce(dir.language, ls.language) as language,
  r.*,
  dir.group_id
from v_students_directory dir
join latest_submissions ls
  on ls.student_id = dir.student_id
 and ls.form_code in ('form2_1', 'form2_2', 'form2_4', 'form2_5')
join reflections r on r.submission_id = ls.id;

alter view v_panel_reflections set (security_invoker = on);

-- La sincronización del Sheets escribe las ligas del 2.7 en las tablas nuevas
-- (copia de 0054; solo cambia el bloque del 2.7).
create or replace function public.import_sheet_rows()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  run_id          bigint;
  detalle         jsonb := '{}'::jsonb;
  form_code       text;
  n               bigint;
  omitidas        bigint;
  cuentas_creadas bigint;
begin
  insert into sheet_sync_runs default values returning id into run_id;

  -- 1.0 Datos Demográficos ------------------------------------------------
  n := public.sheet_sync_submissions('form1_0');
  detalle := detalle || jsonb_build_object('form1_0', n);
  perform public.sheet_clear_responses('form1_0');
  insert into demographics (
    submission_id, full_name, student_number, personal_email, birth_date,
    birth_country, gender, degree_code, semester, period_code, session_day)
  select sub.id,
    public.sheet_text (v.payload, 'nombre'),
    public.sheet_ident(v.payload, 'matricula'),
    public.sheet_email(v.payload, 'correoPersonal')::citext,
    public.sheet_date (v.payload, 'fechaNacimiento'),
    public.sheet_text (v.payload, 'paisNacimiento'),
    public.sheet_gender(v.payload, 'sexo'),
    public.sheet_text (v.payload, 'carrera'),
    public.sheet_semester(v.payload, 'semestre'),
    public.sheet_text (v.payload, 'periodo'),
    public.sheet_session_day(v.payload, 'frecuencia')
  from public.sheet_pending('form1_0') v
  join submissions sub on sub.source_row_key = v.source_row_key;

  -- Alta de cuentas de alumno ------------------------------------------------
  -- Va aquí y no al final: usa la matrícula que el INSERT de arriba acaba de
  -- escribir en `demographics`, a través de `v_students_directory`. Se corre
  -- siempre, no solo cuando `form1_0` trajo filas nuevas: es idempotente
  -- (0014) y no hacer nada es una salida válida, no un caso especial.
  select count(*) filter (where cuenta.outcome = 'creado')
    into cuentas_creadas
  from public.create_student_accounts() cuenta;
  detalle := detalle || jsonb_build_object('cuentas_creadas', cuentas_creadas);

  -- 1.1 Intereses Profesionales -------------------------------------------
  n := public.sheet_sync_submissions('form1_1');
  detalle := detalle || jsonb_build_object('form1_1', n);
  perform public.sheet_clear_responses('form1_1');
  insert into holland_results (
    submission_id, first_type, second_type, third_type, holland_code,
    first_score, second_score, third_score)
  select sub.id,
    public.sheet_holland_type(v.payload, 'primerPuntaje'),
    public.sheet_holland_type(v.payload, 'segundoPuntaje'),
    public.sheet_holland_type(v.payload, 'tercerPuntaje'),
    public.sheet_holland_code(v.payload, 'codigoHolland'),
    public.sheet_int(v.payload, 'primerPuntacion')::smallint,
    public.sheet_int(v.payload, 'segundaPuntuacion')::smallint,
    public.sheet_int(v.payload, 'tercerPuntuacion')::smallint
  from public.sheet_pending('form1_1') v
  join submissions sub on sub.source_row_key = v.source_row_key;

  -- 1.2 Personalidad -------------------------------------------------------
  n := public.sheet_sync_submissions('form1_2');
  detalle := detalle || jsonb_build_object('form1_2', n);
  perform public.sheet_clear_responses('form1_2');
  insert into mbti_results (
    submission_id, report_url, mbti_type, identity, energy, mind, nature,
    tactics, energy_pct, mind_pct, nature_pct, tactics_pct, identity_pct)
  select sub.id,
    public.sheet_text(v.payload, 'link'),
    public.sheet_mbti_type(v.payload),
    public.sheet_mbti_identity(v.payload, 'identidad'),
    public.sheet_mbti_energy  (v.payload, 'energia'),
    public.sheet_mbti_mind    (v.payload, 'mente'),
    public.sheet_mbti_nature  (v.payload, 'naturaleza'),
    public.sheet_mbti_tactics (v.payload, 'tacticas'),
    public.sheet_pct(v.payload, 'energiaPorcentaje'),
    public.sheet_pct(v.payload, 'mentePorcentaje'),
    public.sheet_pct(v.payload, 'naturalezaPorcentaje'),
    public.sheet_pct(v.payload, 'tacticasPorcentaje'),
    public.sheet_pct(v.payload, 'identidadPorcentaje')
  from public.sheet_pending('form1_2') v
  join submissions sub on sub.source_row_key = v.source_row_key;

  -- 1.3 Estilos de Comportamiento ------------------------------------------
  n := public.sheet_sync_submissions('form1_3');
  detalle := detalle || jsonb_build_object('form1_3', n);
  perform public.sheet_clear_responses('form1_3');
  insert into disc_results (
    submission_id, disc_style, disc_category, explanation, needs_review)
  select sub.id, d.disc_style, d.disc_category,
    public.sheet_text(v.payload, 'explicacion'), d.needs_review
  from public.sheet_pending('form1_3') v
  join submissions sub on sub.source_row_key = v.source_row_key
  cross join lateral public.sheet_disc(v.payload) d;

  -- 1.4 Formulario de Habilidades ------------------------------------------
  n := public.sheet_sync_submissions('form1_4');
  detalle := detalle || jsonb_build_object('form1_4', n);
  perform public.sheet_clear_responses('form1_4');
  insert into skills_assessment (
    submission_id,
    written_communication, verbal_communication, nonverbal_communication,
    collaboration_teamwork, leadership, conflict_resolution, negotiation,
    active_listening, empathy, customer_service,
    excel, sheets, word, docs, powerpoint, slides, chatgpt, gemini, programming,
    critical_thinking, decision_making, time_management, planning_organization,
    research_analysis, project_management,
    creativity_innovation, flexibility_adaptability, work_ethic,
    financial_literacy, learning_ability, emotional_intelligence,
    networking, sales,
    is_pefista_graduating)
  select sub.id,
    public.sheet_skill(v.payload, 'comunicacionEscrita'),
    public.sheet_skill(v.payload, 'comunicacionVerbal'),
    public.sheet_skill(v.payload, 'comunicacionNoVerbal'),
    public.sheet_skill(v.payload, 'colabYTrabajoEquipo'),
    public.sheet_skill(v.payload, 'liderazgo'),
    public.sheet_skill(v.payload, 'resDeConflictos'),
    public.sheet_skill(v.payload, 'negociacion'),
    public.sheet_skill(v.payload, 'escuchaActiva'),
    public.sheet_skill(v.payload, 'empatia'),
    public.sheet_skill(v.payload, 'servicioCliente'),
    public.sheet_skill(v.payload, 'excel'),
    public.sheet_skill(v.payload, 'sheets'),
    public.sheet_skill(v.payload, 'word'),
    public.sheet_skill(v.payload, 'docs'),
    public.sheet_skill(v.payload, 'powerpoint'),
    public.sheet_skill(v.payload, 'slides'),
    public.sheet_skill(v.payload, 'chatGPT'),
    public.sheet_skill(v.payload, 'gemini'),
    public.sheet_skill(v.payload, 'programacion'),
    public.sheet_skill(v.payload, 'pensamientoCritico'),
    public.sheet_skill(v.payload, 'tomaDecisiones'),
    public.sheet_skill(v.payload, 'adminTiempo'),
    public.sheet_skill(v.payload, 'planeacionOrganizacion'),
    public.sheet_skill(v.payload, 'analisisInvestigacion'),
    public.sheet_skill(v.payload, 'adminProyectos'),
    public.sheet_skill(v.payload, 'creatividadInovacion'),
    public.sheet_skill(v.payload, 'flexibilidadAdaptibildad'),
    public.sheet_skill(v.payload, 'eticaTrabajo'),
    public.sheet_skill(v.payload, 'eduFinanciera'),
    public.sheet_skill(v.payload, 'habilidadAprender'),
    public.sheet_skill(v.payload, 'inteligenciaEmocional'),
    public.sheet_skill(v.payload, 'networking'),
    public.sheet_skill(v.payload, 'ventas'),
    public.sheet_bool (v.payload, 'PefistaYGraduando')
  from public.sheet_pending('form1_4') v
  join submissions sub on sub.source_row_key = v.source_row_key;

  -- 1.5 Valores -------------------------------------------------------------
  n := public.sheet_sync_submissions('form1_5');
  detalle := detalle || jsonb_build_object('form1_5', n);
  perform public.sheet_clear_responses('form1_5');
  insert into values_results (submission_id, report_url, score)
  select sub.id,
    public.sheet_text(v.payload, 'link'),
    public.sheet_int (v.payload, 'puntuacion')::smallint
  from public.sheet_pending('form1_5') v
  join submissions sub on sub.source_row_key = v.source_row_key;

  -- Los valores fuertes van a su tabla (0054). Uno que no se reconozca no
  -- detiene la sincronización: se omite y queda en el Sheets.
  insert into values_top (submission_id, value_code)
  select distinct sub.id, hv.code
  from public.sheet_pending('form1_5') v
  join submissions sub on sub.source_row_key = v.source_row_key
  cross join lateral unnest(public.sheet_list(v.payload, 'valoresFuertes')) as item(name)
  join human_values hv on hv.code = public.human_value_code(item.name);

  -- 2.1 FODA · 2.2 CV · 2.4 Cover Letter · 2.5 Elevator Pitch ---------------
  -- Los cuatro comparten la tabla `reflections`; se distinguen por form_code.
  foreach form_code in array array['form2_1', 'form2_2', 'form2_4', 'form2_5']
  loop
    n := public.sheet_sync_submissions(form_code);
    detalle := detalle || jsonb_build_object(form_code, n);
    perform public.sheet_clear_responses(form_code);
    insert into reflections (submission_id, was_useful, reason)
    select sub.id,
      public.sheet_bool(v.payload, 'util'),
      public.sheet_text(v.payload, 'porque')
    from public.sheet_pending(form_code) v
    join submissions sub on sub.source_row_key = v.source_row_key;
  end loop;

  -- 2.7 Indeed ---------------------------------------------------------------
  n := public.sheet_sync_submissions('form2_7');
  detalle := detalle || jsonb_build_object('form2_7', n);
  perform public.sheet_clear_responses('form2_7');
  insert into indeed_research (submission_id, positions, companies)
  select sub.id,
    public.sheet_text(v.payload, '3puestos'),
    public.sheet_text(v.payload, '3companias')
  from public.sheet_pending('form2_7') v
  join submissions sub on sub.source_row_key = v.source_row_key;

  -- Las ligas, una fila por puesto y por compañía (0055). El nombre y el
  -- sueldo vienen en el texto de arriba, escrito a mano: no se separan.
  insert into indeed_positions (submission_id, rank, url)
  select sub.id, l.rank, l.url
  from public.sheet_pending('form2_7') v
  join submissions sub on sub.source_row_key = v.source_row_key
  cross join lateral (values
    (1::smallint, public.sheet_text(v.payload, 'link1')),
    (2::smallint, public.sheet_text(v.payload, 'link2')),
    (3::smallint, public.sheet_text(v.payload, 'link3'))
  ) as l(rank, url)
  where l.url is not null;

  insert into indeed_companies (submission_id, rank, url)
  select sub.id, l.rank, l.url
  from public.sheet_pending('form2_7') v
  join submissions sub on sub.source_row_key = v.source_row_key
  cross join lateral (values
    (1::smallint, public.sheet_text(v.payload, 'comp1')),
    (2::smallint, public.sheet_text(v.payload, 'comp2')),
    (3::smallint, public.sheet_text(v.payload, 'comp3'))
  ) as l(rank, url)
  where l.url is not null;

  -- A.1 Carta Formal de Aceptación -------------------------------------------
  n := public.sheet_sync_submissions('formA_1');
  detalle := detalle || jsonb_build_object('formA_1', n);
  perform public.sheet_clear_responses('formA_1');
  insert into internship_applications (
    submission_id, required_hours, internship_option, restrictions,
    company_name, company_website, company_tax_id, company_founded_year,
    department, supervisor_name, supervisor_role, supervisor_email,
    supervisor_phone, schedule, is_paid, description, career_relation,
    professional_relation, company_validation)
  select sub.id,
    public.sheet_hours(v.payload, 'horas'),
    public.sheet_text (v.payload, 'opcionesPracticas'),
    public.sheet_text (v.payload, 'restricciones'),
    public.sheet_text (v.payload, 'nombreEmpresa'),
    public.sheet_text (v.payload, 'paginaEmpresa'),
    public.sheet_text (v.payload, 'rfcEmpresa'),
    public.sheet_year (v.payload, 'anioEmpresa'),
    public.sheet_text (v.payload, 'departamento'),
    public.sheet_text (v.payload, 'nombreJefe'),
    public.sheet_text (v.payload, 'puestoJefe'),
    public.sheet_email(v.payload, 'correoJefe')::citext,
    public.sheet_ident(v.payload, 'telefonoJefe'),
    public.sheet_text (v.payload, 'horario'),
    public.sheet_bool (v.payload, 'renumeracion'),
    public.sheet_text (v.payload, 'descripcion'),
    public.sheet_text (v.payload, 'relacionCarrera'),
    public.sheet_text (v.payload, 'realacionProfesional'),
    public.sheet_text (v.payload, 'empresaValida')
  from public.sheet_pending('formA_1') v
  join submissions sub on sub.source_row_key = v.source_row_key;

  -- B.1 Formulario de Inicio --------------------------------------------------
  n := public.sheet_sync_submissions('formB_1');
  detalle := detalle || jsonb_build_object('formB_1', n);
  perform public.sheet_clear_responses('formB_1');
  insert into company_profiles (
    submission_id, company_name, company_website, industry, mission, vision,
    company_values, address, work_schedule, department, supervisor_info,
    supervisor_email, supervisor_phone, activities, has_contract, salary,
    has_linkedin_profile, linkedin_connections, linkedin_url)
  select sub.id,
    public.sheet_text (v.payload, 'empresa'),
    public.sheet_text (v.payload, 'paginaEmpresa'),
    public.sheet_text (v.payload, 'giro'),
    public.sheet_text (v.payload, 'mision'),
    public.sheet_text (v.payload, 'vision'),
    public.sheet_text (v.payload, 'valores'),
    public.sheet_text (v.payload, 'direccionEmpresa'),
    public.sheet_text (v.payload, 'horarioLaboral'),
    public.sheet_text (v.payload, 'departamento'),
    public.sheet_text (v.payload, 'datosJefe'),
    public.sheet_email(v.payload, 'correoJefe')::citext,
    public.sheet_ident(v.payload, 'telefonoJefe'),
    public.sheet_text (v.payload, 'actividades'),
    public.sheet_bool (v.payload, 'contrato'),
    public.sheet_num  (v.payload, 'sueldo'),
    public.sheet_bool (v.payload, 'perfilLinkedin'),
    public.sheet_int  (v.payload, 'contactosLinkedin'),
    public.sheet_text (v.payload, 'linkedinLink')
  from public.sheet_pending('formB_1') v
  join submissions sub on sub.source_row_key = v.source_row_key;

  -- Bitácora de búsqueda ------------------------------------------------------
  -- Las dos bitácoras son los únicos formularios de respuesta múltiple: un
  -- alumno acumula hasta 10 entregas y cada una es una fila de submissions.
  n := public.sheet_sync_submissions('form_busqueda');
  detalle := detalle || jsonb_build_object('form_busqueda', n);
  perform public.sheet_clear_responses('form_busqueda');
  insert into job_search_logs (
    submission_id, activities, applications, interviews, learnings, next_steps)
  select sub.id,
    public.sheet_text(v.payload, 'actividades'),
    public.sheet_text(v.payload, 'aplicaciones'),
    public.sheet_text(v.payload, 'entrevistas'),
    public.sheet_text(v.payload, 'aprendizajes'),
    public.sheet_text(v.payload, 'siguientesPasos')
  from public.sheet_pending('form_busqueda') v
  join submissions sub on sub.source_row_key = v.source_row_key;

  -- Bitácora de prácticas -----------------------------------------------------
  n := public.sheet_sync_submissions('form_practicas');
  detalle := detalle || jsonb_build_object('form_practicas', n);
  perform public.sheet_clear_responses('form_practicas');
  insert into internship_logs (
    submission_id, activities, hours_worked, skills_practiced, proposal)
  select sub.id,
    public.sheet_text      (v.payload, 'actividades'),
    public.sheet_week_hours(v.payload, 'horas'),
    public.sheet_text      (v.payload, 'habilidades'),
    public.sheet_text      (v.payload, 'propuesta')
  from public.sheet_pending('form_practicas') v
  join submissions sub on sub.source_row_key = v.source_row_key;

  -- Cierre --------------------------------------------------------------------
  -- Se marcan TODAS las pendientes, incluidas las que se descartaron por no
  -- traer correo o marca temporal: ya se procesaron y reintentarlas cada hora
  -- solo haría crecer el trabajo.
  select count(*) into omitidas
  from sheet_rows sr
  where sr.imported_at is null
    and (public.sheet_email(sr.payload, 'idCorreo') is null
         or coalesce(public.sheet_ts(sr.payload, 'marcaTemporal'),
                     public.sheet_ts(sr.payload, 'marcaTemproal')) is null);

  update sheet_rows set imported_at = now() where imported_at is null;

  detalle := detalle || jsonb_build_object('filas_omitidas', omitidas);

  -- El staging es una bitácora de tránsito, no un archivo histórico: el dato
  -- bueno ya vive en las tablas finales y el original sigue en el Sheets.
  delete from sheet_rows where imported_at < now() - interval '30 days';

  update sheet_sync_runs
     set finished_at = now(), detail = detalle
   where id = run_id;

  return detalle;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS de las tablas nuevas (como values_top, 0054)
-- ---------------------------------------------------------------------------
alter table indeed_positions enable row level security;
alter table indeed_companies enable row level security;

do $$
declare t text;
begin
  foreach t in array array['indeed_positions', 'indeed_companies'] loop
    execute format(
      'create policy %I on %I for select to authenticated using ((select public.is_admin()))',
      t || '_select_admin', t);
    execute format(
      'create policy %I on %I for select to authenticated using (
         submission_id in (
           select s.id from public.submissions s
           where s.student_id in (select public.visible_student_ids())
         )
       )',
      t || '_select_scope', t);
    execute format(
      'create policy %I on %I as restrictive for select to authenticated using (
         submission_id in (
           select s.id from public.submissions s
           where s.form_code in (select public.readable_forms())
         )
       )',
      t || '_screen_read', t);
    execute format('grant select on %I to authenticated', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 3. El alumno lee y entrega lo suyo
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['reflections', 'indeed_research', 'indeed_positions', 'indeed_companies']
  loop
    execute format('drop policy if exists %I on %I', t || '_select_own', t);
    execute format(
      'create policy %I on %I for select to authenticated using (
         exists (
           select 1 from public.submissions sub
           where sub.id = %I.submission_id
             and sub.student_id = (select public.current_student_id())
         )
       )',
      t || '_select_own', t, t
    );
  end loop;
end $$;

alter policy submissions_insert_own on submissions
  with check (
    student_id = (select public.current_student_id())
    and form_code in (
      'form_busqueda', 'form_practicas',
      'form1_0', 'form1_1', 'form1_2', 'form1_3', 'form1_4', 'form1_5',
      'form2_1', 'form2_2', 'form2_4', 'form2_5', 'form2_7'
    )
    and source_row_key is null
  );

do $$
declare
  t text;
  f text[];
begin
  for t, f in
    select * from (values
      ('reflections',      array['form2_1', 'form2_2', 'form2_4', 'form2_5']),
      ('indeed_research',  array['form2_7']),
      ('indeed_positions', array['form2_7']),
      ('indeed_companies', array['form2_7'])
    ) x(t, f)
  loop
    execute format(
      'create policy %I on %I for insert to authenticated with check (
         exists (
           select 1 from public.submissions sub
           where sub.id = %I.submission_id
             and sub.student_id = (select public.current_student_id())
             and sub.form_code = any (%L::text[])
         )
       )',
      t || '_insert_own', t, t, f
    );
    execute format('grant insert on %I to authenticated', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Funciones de entrega (SECURITY INVOKER; open_portal_submission() de 0054)
-- ---------------------------------------------------------------------------

-- 2.1, 2.2, 2.4, 2.5: ¿fue de utilidad? y por qué.
create or replace function public.submit_reflection(
  p_form_code  text,
  p_was_useful boolean,
  p_reason     text
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_form_code not in ('form2_1', 'form2_2', 'form2_4', 'form2_5') then
    raise exception 'Ese formulario no se contesta así.';
  end if;
  if p_was_useful is null or nullif(btrim(p_reason), '') is null then
    raise exception 'Contesta todas las preguntas.';
  end if;
  if char_length(p_reason) > 5000 then
    raise exception 'La respuesta es demasiado larga.';
  end if;

  v_id := public.open_portal_submission(p_form_code);
  insert into reflections (submission_id, was_useful, reason)
  values (v_id, p_was_useful, btrim(p_reason));
  return v_id;
end;
$$;

-- 2.7 Indeed: p_positions = [{title, salary, url}×3], p_companies = [{name, url}×3],
-- en orden (el primero es el 1).
create or replace function public.submit_indeed(
  p_positions jsonb,
  p_companies jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
begin
  if jsonb_typeof(p_positions) is distinct from 'array' or jsonb_array_length(p_positions) <> 3
     or jsonb_typeof(p_companies) is distinct from 'array' or jsonb_array_length(p_companies) <> 3 then
    raise exception 'Son tres puestos y tres compañías.';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_positions) p
    where nullif(btrim(p ->> 'title'), '') is null
       or nullif(btrim(p ->> 'url'), '') is null
       or coalesce(p ->> 'salary', '') !~ '^[0-9]+(\.[0-9]{1,2})?$'
  ) or exists (
    select 1 from jsonb_array_elements(p_companies) c
    where nullif(btrim(c ->> 'name'), '') is null
       or nullif(btrim(c ->> 'url'), '') is null
  ) then
    raise exception 'Contesta todas las preguntas.';
  end if;

  v_id := public.open_portal_submission('form2_7');
  insert into indeed_research (submission_id) values (v_id);

  insert into indeed_positions (submission_id, rank, title, monthly_salary, url)
  select v_id, p.ord::smallint, btrim(p.value ->> 'title'), (p.value ->> 'salary')::numeric, btrim(p.value ->> 'url')
  from jsonb_array_elements(p_positions) with ordinality as p(value, ord);

  insert into indeed_companies (submission_id, rank, name, url)
  select v_id, c.ord::smallint, btrim(c.value ->> 'name'), btrim(c.value ->> 'url')
  from jsonb_array_elements(p_companies) with ordinality as c(value, ord);

  return v_id;
end;
$$;

revoke execute on function public.submit_reflection(text, boolean, text) from public, anon;
revoke execute on function public.submit_indeed(jsonb, jsonb) from public, anon;
grant  execute on function public.submit_reflection(text, boolean, text) to authenticated;
grant  execute on function public.submit_indeed(jsonb, jsonb) to authenticated;

commit;
