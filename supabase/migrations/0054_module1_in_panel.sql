-- 0054_module1_in_panel.sql — El Módulo 1 completo (1.1–1.5) se contesta en el portal
-- Ver docs/DATABASE_SCHEMA.md#el-módulo-1-se-contesta-en-el-portal
--
-- Igual que el 1.0 (0052): 1.1 Intereses, 1.2 Personalidad, 1.3 Estilos de
-- Comportamiento, 1.4 Habilidades y 1.5 Valores dejan de ser solo Google
-- Forms. El alumno los contesta en su portal, en el idioma de su grupo (ya no
-- se le pregunta), cuando el profesor publica la actividad. Lo pidió el
-- profesor el 2026-11-17, pensando en los grupos SIGUIENTES: los grupos de
-- hoy ya los contestaron en Google Forms y no los vuelven a llenar.
--
-- Qué hace, en orden:
--   0. Revisión de seguridad. No cambia nada; si algún valor fuerte del 1.5
--      no se reconoce, se detiene aquí y dice cuál.
--   1. Los cinco se marcan como del portal (forms.answered_in_panel, 0053):
--      con eso ya se califican. Sus actividades quedan en BORRADOR en todos
--      los grupos: nadie los ve hasta que el maestro los publique.
--   2. 1.5: los valores fuertes salen del arreglo `top_values` a una tabla.
--   3. Permisos, políticas y funciones de entrega del alumno.
--   Además, las pantallas 1.1–1.5 toman el idioma del grupo (lo del portal no
--   lleva idioma), como el 1.0 en 0052.
--
-- Normalización (4FN):
--   * human_values(code → name_es, name_en, display_order): catálogo de los
--     diez valores de Schwartz.
--   * values_top(submission_id, value_code): todo-llave. Un arreglo de texto
--     en una columna no está ni en 1FN (y no se puede referir a un catálogo).
--     Los valores fuertes son un hecho multivaluado de la entrega, así que van
--     en su propia tabla.
--   * Excepción decidida por el profesor: holland_results.holland_code y
--     mbti_results.energy/mind/nature/tactics se derivan de otras columnas
--     (las tres áreas; las letras del tipo) y aun así se siguen preguntando
--     y guardando, como en el Google Form. No se tocan.
--   * skills_assessment sigue ancha (regla «Habilidades: columnas anchas»).
--
-- Los datos que ya existen no se pierden: las entregas viejas siguen igual y
-- las vistas siguen dando `top_values` con la misma forma. La sincronización
-- del Sheets sigue corriendo y ahora escribe en values_top.
--
-- Efecto conocido: como las cinco actividades quedan en borrador, Estado de
-- Entregas deja de usar su fecha de entrega en los grupos actuales (un
-- borrador no vence, 0051) hasta que se publiquen.

begin;

-- ---------------------------------------------------------------------------
-- human_value_code(): nombre de un valor (como venga del Sheets) → código
-- ---------------------------------------------------------------------------
create or replace function public.human_value_code(p_name text)
returns text
language sql
immutable
as $$
  select case lower(translate(btrim(coalesce(p_name, '')), 'áéíóúÁÉÍÓÚ', 'aeiouaeiou'))
    when 'benevolencia'   then 'benevolencia'
    when 'benevolence'    then 'benevolencia'
    when 'universalidad'  then 'universalidad'
    when 'universalism'   then 'universalidad'
    when 'seguridad'      then 'seguridad'
    when 'security'       then 'seguridad'
    when 'logro'          then 'logro'
    when 'achievement'    then 'logro'
    when 'hedonismo'      then 'hedonismo'
    when 'hedonism'       then 'hedonismo'
    when 'estimulacion'   then 'estimulacion'
    when 'stimulation'    then 'estimulacion'
    when 'poder'          then 'poder'
    when 'power'          then 'poder'
    when 'autonomia'      then 'autonomia'
    when 'self-direction' then 'autonomia'
    when 'autonomy'       then 'autonomia'
    when 'tradicion'      then 'tradicion'
    when 'tradition'      then 'tradicion'
    when 'conformidad'    then 'conformidad'
    when 'conformity'     then 'conformidad'
  end
$$;

-- ---------------------------------------------------------------------------
-- 0. Revisión de seguridad: todos los valores fuertes existentes se reconocen
-- ---------------------------------------------------------------------------
do $$
declare
  v_unknown text;
begin
  select string_agg(distinct item.name, ', ')
    into v_unknown
  from values_results vr
  cross join lateral unnest(vr.top_values) as item(name)
  where btrim(item.name) <> ''
    and public.human_value_code(item.name) is null;

  if v_unknown is not null then
    raise exception 'No se reconocen estos valores fuertes del 1.5: %. No se cambió nada.', v_unknown;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Los cinco formularios son del portal; sus actividades, en borrador
-- ---------------------------------------------------------------------------
update forms set answered_in_panel = true
where code in ('form1_1', 'form1_2', 'form1_3', 'form1_4', 'form1_5');

update activities set is_published = false, updated_at = now()
where form_code in ('form1_1', 'form1_2', 'form1_3', 'form1_4', 'form1_5')
  and is_published;

-- Al nacer un grupo: publicadas solo las bitácoras y lo que sigue en Google
-- Forms (su fecha cuenta en Estado de Entregas). Lo del portal, en borrador.
create or replace function public.default_activity_published(p_form_code text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select f.module_code = 'W' or not f.answered_in_panel from forms f where f.code = p_form_code),
    false
  )
$$;

-- Permiso: el alumno puede entregar los cinco (como el 1.0 en 0052).
update app_screens
set max_access = 'edicion', audience = 'ambos'
where code in ('form1_1', 'form1_2', 'form1_3', 'form1_4', 'form1_5');

insert into role_screen_access (role_code, screen_code, access)
select 'alumno', code, 'edicion'
from (values ('form1_1'), ('form1_2'), ('form1_3'), ('form1_4'), ('form1_5')) f(code)
on conflict (role_code, screen_code) do update set access = excluded.access;

-- ---------------------------------------------------------------------------
-- 2. 1.5 Valores: human_values + values_top
-- ---------------------------------------------------------------------------
create table human_values (
  code          text primary key,
  name_es       text not null,
  name_en       text not null,
  display_order smallint not null unique
);

insert into human_values (code, name_es, name_en, display_order) values
  ('benevolencia',  'Benevolencia',  'Benevolence',    1),
  ('universalidad', 'Universalidad', 'Universalism',   2),
  ('seguridad',     'Seguridad',     'Security',       3),
  ('logro',         'Logro',         'Achievement',    4),
  ('hedonismo',     'Hedonismo',     'Hedonism',       5),
  ('estimulacion',  'Estimulación',  'Stimulation',    6),
  ('poder',         'Poder',         'Power',          7),
  ('autonomia',     'Autonomía',     'Self-direction', 8),
  ('tradicion',     'Tradición',     'Tradition',      9),
  ('conformidad',   'Conformidad',   'Conformity',    10);

create table values_top (
  submission_id uuid not null references values_results (submission_id) on delete cascade,
  value_code    text not null references human_values (code),
  primary key (submission_id, value_code)
);

create index idx_values_top_value on values_top (value_code);

-- Lo que ya existe, sin perder nada (la revisión de arriba garantiza que todo
-- se reconoce).
insert into values_top (submission_id, value_code)
select distinct vr.submission_id, public.human_value_code(item.name)
from values_results vr
cross join lateral unnest(vr.top_values) as item(name)
where btrim(item.name) <> '';

-- Las vistas siguen dando `top_values text[]` en el mismo lugar, con el
-- nombre en español como siempre: el panel no cambia.
create or replace function public.values_top_names(p_submission_id uuid)
returns text[]
language sql
stable
as $$
  select array_agg(hv.name_es order by hv.display_order)
  from values_top vt
  join human_values hv on hv.code = vt.value_code
  where vt.submission_id = p_submission_id
$$;

create or replace view v_panel_values as
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
  v.submission_id,
  v.report_url,
  public.values_top_names(v.submission_id) as top_values,
  v.score,
  dir.group_id
from v_students_directory dir
join latest_submissions ls
  on ls.student_id = dir.student_id
 and ls.form_code = 'form1_5'
join values_results v on v.submission_id = ls.id;

-- ---------------------------------------------------------------------------
-- Las pantallas 1.1–1.5 toman el idioma del grupo (como el 1.0 en 0052): lo
-- que se entrega en el portal no lleva idioma, y sin esto el filtro Idioma
-- no lo encontraría.
-- ---------------------------------------------------------------------------
-- 1.1 Intereses Profesionales: mismas columnas que 0033; el idioma lo da el grupo.
create or replace view v_panel_holland as
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
  h.*,
  dir.group_id
from v_students_directory dir
join latest_submissions ls
  on ls.student_id = dir.student_id
 and ls.form_code = 'form1_1'
join holland_results h on h.submission_id = ls.id;

alter view v_panel_holland set (security_invoker = on);

-- 1.2 Personalidad: mismas columnas que 0033; el idioma lo da el grupo.
create or replace view v_panel_mbti as
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
  m.*,
  dir.group_id
from v_students_directory dir
join latest_submissions ls
  on ls.student_id = dir.student_id
 and ls.form_code = 'form1_2'
join mbti_results m on m.submission_id = ls.id;

alter view v_panel_mbti set (security_invoker = on);

-- 1.3 Estilos de Comportamiento: mismas columnas que 0033; el idioma lo da el grupo.
create or replace view v_panel_disc as
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
  dc.*,
  dir.group_id
from v_students_directory dir
join latest_submissions ls
  on ls.student_id = dir.student_id
 and ls.form_code = 'form1_3'
join disc_results dc on dc.submission_id = ls.id;

alter view v_panel_disc set (security_invoker = on);

-- 1.4 Habilidades: mismas columnas que 0033; el idioma lo da el grupo.
create or replace view v_panel_skills as
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
  sk.*,
  dir.group_id
from v_students_directory dir
join latest_submissions ls
  on ls.student_id = dir.student_id
 and ls.form_code = 'form1_4'
join skills_assessment sk on sk.submission_id = ls.id;

alter view v_panel_skills set (security_invoker = on);

create or replace view v_student_dossier as
select
  dir.student_id,
  dir.institutional_email,
  dir.full_name,
  dir.student_number,
  dir.personal_email,
  dir.birth_date,
  dir.birth_country,
  dir.gender,
  dir.degree_code,
  dir.semester,
  dir.period_code,
  dir.session_day,

  -- 1.1 Intereses Profesionales
  hr.holland_code,
  hr.first_type   as holland_first_type,
  hr.first_score  as holland_first_score,
  hr.second_type  as holland_second_type,
  hr.second_score as holland_second_score,
  hr.third_type   as holland_third_type,
  hr.third_score  as holland_third_score,

  -- 1.2 Personalidad
  mr.mbti_type,
  mr.identity   as mbti_identity,
  mr.report_url as mbti_report_url,

  -- 1.3 Estilos de Comportamiento
  dr.disc_style,
  dr.disc_category,
  dr.needs_review as disc_needs_review,

  -- 1.5 Valores (values_top desde 0054)
  public.values_top_names(vr.submission_id) as top_values,
  vr.score      as values_score,
  vr.report_url as values_report_url,

  -- B.1 Formulario de Inicio: de aquí salen los datos de la práctica en curso
  cp.company_name,
  cp.industry,
  cp.address,
  cp.department,
  cp.supervisor_info,
  cp.supervisor_email,
  cp.supervisor_phone,
  cp.company_website,
  cp.has_contract,
  cp.salary,
  cp.linkedin_url,

  -- Grupo vigente (0032)
  dir.group_id
from v_students_directory dir
left join latest_submissions s11 on s11.student_id = dir.student_id and s11.form_code = 'form1_1'
left join holland_results   hr  on hr.submission_id = s11.id
left join latest_submissions s12 on s12.student_id = dir.student_id and s12.form_code = 'form1_2'
left join mbti_results      mr  on mr.submission_id = s12.id
left join latest_submissions s13 on s13.student_id = dir.student_id and s13.form_code = 'form1_3'
left join disc_results      dr  on dr.submission_id = s13.id
left join latest_submissions s15 on s15.student_id = dir.student_id and s15.form_code = 'form1_5'
left join values_results    vr  on vr.submission_id = s15.id
left join latest_submissions sb1 on sb1.student_id = dir.student_id and sb1.form_code = 'formB_1'
left join company_profiles  cp  on cp.submission_id = sb1.id;

alter view v_panel_values    set (security_invoker = on);
alter view v_student_dossier set (security_invoker = on);

-- Ya nadie lee el arreglo: fuera.
alter table values_results drop column top_values;

-- La sincronización del Sheets escribe en values_top (copia de 0021; solo
-- cambia el bloque del 1.5).
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
  insert into indeed_research (
    submission_id, positions, position_url_1, position_url_2, position_url_3,
    companies, company_url_1, company_url_2, company_url_3)
  select sub.id,
    public.sheet_text(v.payload, '3puestos'),
    public.sheet_text(v.payload, 'link1'),
    public.sheet_text(v.payload, 'link2'),
    public.sheet_text(v.payload, 'link3'),
    public.sheet_text(v.payload, '3companias'),
    public.sheet_text(v.payload, 'comp1'),
    public.sheet_text(v.payload, 'comp2'),
    public.sheet_text(v.payload, 'comp3')
  from public.sheet_pending('form2_7') v
  join submissions sub on sub.source_row_key = v.source_row_key;

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
-- RLS de las tablas nuevas
-- ---------------------------------------------------------------------------
alter table human_values enable row level security;
alter table values_top   enable row level security;

-- Catálogo sin datos personales: el staff y los alumnos activos (como forms).
create policy human_values_select_staff on human_values
  for select to authenticated using ((select public.is_staff()));
create policy human_values_select_alumno on human_values
  for select to authenticated using ((select public.current_student_id()) is not null);

-- values_top: como cualquier tabla de respuestas (0006, 0036, 0038).
create policy values_top_select_admin on values_top
  for select to authenticated using ((select public.is_admin()));
create policy values_top_select_scope on values_top
  for select to authenticated
  using (
    submission_id in (
      select s.id from public.submissions s
      where s.student_id in (select public.visible_student_ids())
    )
  );
create policy values_top_select_own on values_top
  for select to authenticated
  using (
    exists (
      select 1 from submissions sub
      where sub.id = values_top.submission_id
        and sub.student_id = (select public.current_student_id())
    )
  );
create policy values_top_screen_read on values_top
  as restrictive for select to authenticated
  using (
    submission_id in (
      select s.id from public.submissions s
      where s.form_code in (select public.readable_forms())
    )
  );

grant select on human_values, values_top to authenticated;

-- ---------------------------------------------------------------------------
-- 3. El alumno lee y entrega lo suyo
-- ---------------------------------------------------------------------------
-- Lectura de lo suyo. Las de 0019 pueden no existir todavía: se recrean.
do $$
declare t text;
begin
  foreach t in array array[
    'holland_results', 'mbti_results', 'disc_results', 'skills_assessment', 'values_results'
  ]
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

-- Crear la entrega: la de 0052 con los cinco en la lista.
alter policy submissions_insert_own on submissions
  with check (
    student_id = (select public.current_student_id())
    and form_code in (
      'form_busqueda', 'form_practicas',
      'form1_0', 'form1_1', 'form1_2', 'form1_3', 'form1_4', 'form1_5'
    )
    and source_row_key is null
  );

-- Las respuestas: solo en una entrega suya del formulario correcto.
do $$
declare
  t text;
  f text;
begin
  for t, f in
    select * from (values
      ('holland_results',   'form1_1'),
      ('mbti_results',      'form1_2'),
      ('disc_results',      'form1_3'),
      ('skills_assessment', 'form1_4'),
      ('values_results',    'form1_5'),
      ('values_top',        'form1_5')
    ) x(t, f)
  loop
    execute format(
      'create policy %I on %I for insert to authenticated with check (
         exists (
           select 1 from public.submissions sub
           where sub.id = %I.submission_id
             and sub.student_id = (select public.current_student_id())
             and sub.form_code = %L
         )
       )',
      t || '_insert_own', t, t, f
    );
    execute format('grant insert on %I to authenticated', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Funciones de entrega (SECURITY INVOKER, como submit_demographics de 0052)
-- ---------------------------------------------------------------------------
-- Las políticas son la guarda y el alumno sale de current_student_id(), nunca
-- de un parámetro. No se guarda idioma (lo da el grupo).

-- Abre la entrega: mismas verificaciones para los cinco.
create or replace function public.open_portal_submission(p_form_code text)
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
  if not public.activity_is_open(p_form_code) then
    raise exception 'Esta actividad ya está cerrada o todavía no está disponible.';
  end if;

  insert into submissions (student_id, form_code, submitted_at)
  values (v_student, p_form_code, now())
  returning id into v_id;
  return v_id;
end;
$$;

-- 1.1 Intereses Profesionales
create or replace function public.submit_holland(
  p_first_type   holland_type,
  p_second_type  holland_type,
  p_third_type   holland_type,
  p_holland_code text,
  p_first_score  smallint,
  p_second_score smallint,
  p_third_score  smallint
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_code text := upper(btrim(coalesce(p_holland_code, '')));
  v_id   uuid;
begin
  if p_first_type is null or p_second_type is null or p_third_type is null
     or p_first_score is null or p_second_score is null or p_third_score is null
     or v_code = '' then
    raise exception 'Contesta todas las preguntas.';
  end if;
  if v_code !~ '^[RIASEC]{3}$' then
    raise exception 'El código Holland son tres letras de RIASEC, por ejemplo RIC.';
  end if;
  if least(p_first_score, p_second_score, p_third_score) < 0
     or greatest(p_first_score, p_second_score, p_third_score) > 999 then
    raise exception 'Revisa las puntuaciones.';
  end if;

  v_id := public.open_portal_submission('form1_1');
  insert into holland_results (
    submission_id, first_type, second_type, third_type, holland_code,
    first_score, second_score, third_score
  )
  values (
    v_id, p_first_type, p_second_type, p_third_type, v_code,
    p_first_score, p_second_score, p_third_score
  );
  return v_id;
end;
$$;

-- 1.2 Personalidad
create or replace function public.submit_mbti(
  p_report_url   text,
  p_mbti_type    mbti_type,
  p_identity     mbti_identity,
  p_energy       mbti_energy,
  p_mind         mbti_mind,
  p_nature       mbti_nature,
  p_tactics      mbti_tactics,
  p_energy_pct   smallint,
  p_mind_pct     smallint,
  p_nature_pct   smallint,
  p_tactics_pct  smallint,
  p_identity_pct smallint
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
begin
  if nullif(btrim(p_report_url), '') is null
     or p_mbti_type is null or p_identity is null
     or p_energy is null or p_mind is null or p_nature is null or p_tactics is null
     or p_energy_pct is null or p_mind_pct is null or p_nature_pct is null
     or p_tactics_pct is null or p_identity_pct is null then
    raise exception 'Contesta todas las preguntas.';
  end if;
  if least(p_energy_pct, p_mind_pct, p_nature_pct, p_tactics_pct, p_identity_pct) < 0
     or greatest(p_energy_pct, p_mind_pct, p_nature_pct, p_tactics_pct, p_identity_pct) > 100 then
    raise exception 'Los porcentajes van de 0 a 100.';
  end if;

  v_id := public.open_portal_submission('form1_2');
  insert into mbti_results (
    submission_id, report_url, mbti_type, identity, energy, mind, nature, tactics,
    energy_pct, mind_pct, nature_pct, tactics_pct, identity_pct
  )
  values (
    v_id, btrim(p_report_url), p_mbti_type, p_identity, p_energy, p_mind, p_nature, p_tactics,
    p_energy_pct, p_mind_pct, p_nature_pct, p_tactics_pct, p_identity_pct
  );
  return v_id;
end;
$$;

-- 1.3 Estilos de Comportamiento
create or replace function public.submit_disc(
  p_disc_style    text,
  p_disc_category text,
  p_explanation   text
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_style text := btrim(coalesce(p_disc_style, ''));
  v_id    uuid;
begin
  if v_style = '' or nullif(btrim(p_disc_category), '') is null
     or nullif(btrim(p_explanation), '') is null then
    raise exception 'Contesta todas las preguntas.';
  end if;
  if v_style !~* '^[DISC]{1,4}$' then
    raise exception 'El estilo DISC son de una a cuatro letras D, I, S o C, como aparece en tu reporte.';
  end if;

  v_id := public.open_portal_submission('form1_3');
  insert into disc_results (submission_id, disc_style, disc_category, explanation)
  values (v_id, v_style, btrim(p_disc_category), btrim(p_explanation));
  return v_id;
end;
$$;

-- 1.4 Habilidades: p_levels = { "written_communication": "intermedio", … }
-- con las 33 columnas de skills_assessment (regla «columnas anchas»).
create or replace function public.submit_skills(
  p_levels  jsonb,
  p_pefista boolean
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_skills text[] := array[
    'written_communication', 'verbal_communication', 'nonverbal_communication',
    'collaboration_teamwork', 'leadership', 'conflict_resolution', 'negotiation',
    'active_listening', 'empathy', 'customer_service',
    'excel', 'sheets', 'word', 'docs', 'powerpoint', 'slides', 'chatgpt', 'gemini', 'programming',
    'critical_thinking', 'decision_making', 'time_management', 'planning_organization',
    'research_analysis', 'project_management',
    'creativity_innovation', 'flexibility_adaptability', 'work_ethic',
    'financial_literacy', 'learning_ability', 'emotional_intelligence',
    'networking', 'sales'
  ];
  v_skill text;
  v_row   skills_assessment;
  v_id    uuid;
begin
  if p_levels is null or jsonb_typeof(p_levels) <> 'object' or p_pefista is null then
    raise exception 'Contesta todas las preguntas.';
  end if;
  foreach v_skill in array v_skills loop
    if coalesce(p_levels ->> v_skill, '') = '' then
      raise exception 'Califica todas las habilidades.';
    end if;
  end loop;
  if exists (select 1 from jsonb_object_keys(p_levels) k where k <> all (v_skills)) then
    raise exception 'Hay una habilidad que no existe.';
  end if;

  v_id := public.open_portal_submission('form1_4');
  -- jsonb_populate_record convierte cada nivel al enum skill_level (falla si
  -- no es uno de los cinco).
  v_row := jsonb_populate_record(
    null::skills_assessment,
    p_levels || jsonb_build_object('submission_id', v_id, 'is_pefista_graduating', p_pefista)
  );
  insert into skills_assessment select v_row.*;
  return v_id;
end;
$$;

-- 1.5 Valores
create or replace function public.submit_values(
  p_report_url  text,
  p_value_codes text[],
  p_score       smallint
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
begin
  if nullif(btrim(p_report_url), '') is null or p_score is null
     or coalesce(cardinality(p_value_codes), 0) = 0 then
    raise exception 'Contesta todas las preguntas.';
  end if;
  if p_score not between 1 and 10 then
    raise exception 'La puntuación va de 1 a 10.';
  end if;
  if exists (
    select 1 from unnest(p_value_codes) c
    where c not in (select code from human_values)
  ) then
    raise exception 'Hay un valor que no existe.';
  end if;

  v_id := public.open_portal_submission('form1_5');
  insert into values_results (submission_id, report_url, score)
  values (v_id, btrim(p_report_url), p_score);
  insert into values_top (submission_id, value_code)
  select distinct v_id, c from unnest(p_value_codes) c;
  return v_id;
end;
$$;

revoke execute on function public.open_portal_submission(text) from public, anon;
revoke execute on function public.submit_holland(holland_type, holland_type, holland_type, text, smallint, smallint, smallint) from public, anon;
revoke execute on function public.submit_mbti(text, mbti_type, mbti_identity, mbti_energy, mbti_mind, mbti_nature, mbti_tactics, smallint, smallint, smallint, smallint, smallint) from public, anon;
revoke execute on function public.submit_disc(text, text, text) from public, anon;
revoke execute on function public.submit_skills(jsonb, boolean) from public, anon;
revoke execute on function public.submit_values(text, text[], smallint) from public, anon;
grant  execute on function public.open_portal_submission(text) to authenticated;
grant  execute on function public.submit_holland(holland_type, holland_type, holland_type, text, smallint, smallint, smallint) to authenticated;
grant  execute on function public.submit_mbti(text, mbti_type, mbti_identity, mbti_energy, mbti_mind, mbti_nature, mbti_tactics, smallint, smallint, smallint, smallint, smallint) to authenticated;
grant  execute on function public.submit_disc(text, text, text) to authenticated;
grant  execute on function public.submit_skills(jsonb, boolean) to authenticated;
grant  execute on function public.submit_values(text, text[], smallint) to authenticated;

commit;
