-- 0021_sync_creates_student_accounts.sql — La sincronización da de alta las
-- cuentas nuevas, no solo el profesor a mano
-- Ver docs/AUTH.md#cómo-se-crean-las-cuentas-de-los-alumnos y
-- docs/SHEETS_SYNC.md
--
-- Hasta aquí `create_student_accounts()` (0014) solo se corría a mano en el
-- SQL Editor. Un alumno que acababa de contestar el 1.0 Datos Demográficos se
-- quedaba sin acceso hasta que alguien se acordara de volver a pegar
-- `select * from public.create_student_accounts();`.
--
-- Se redefine `import_sheet_rows()` (0015) para que la llame ella misma, al
-- final del bloque de 1.0: ya escribió `demographics`, que es de donde sale
-- la matrícula que la función necesita para la contraseña. Se corre en
-- *cada* sincronización, haya o no alumnos nuevos —el 0014 ya la diseñó
-- idempotente para exactamente este caso: sin novedades, cada fila sale
-- 'ya existía' u 'omitido' y no se toca nada—.
--
-- Por qué funciona sin tocar los permisos de 0014: `create_student_accounts()`
-- tiene el `EXECUTE` revocado a `public`, `anon` y `authenticated`, pero eso
-- no alcanza a `import_sheet_rows()`. Es `SECURITY DEFINER`, así que dentro de
-- su cuerpo corre con los permisos de quien la creó —el mismo contexto
-- administrativo del SQL Editor—, no con los de `service_role` que la invoca
-- desde el Apps Script. Es la misma razón por la que `guard_profile_role()`
-- deja pasar el alta: `auth.uid()` es `NULL` tanto en el SQL Editor como en
-- una llamada con `service_role`.
--
-- Firma sin cambios respecto a 0015 (returns jsonb, sin parámetros), así que
-- basta `create or replace`.
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
  insert into values_results (submission_id, report_url, top_values, score)
  select sub.id,
    public.sheet_text(v.payload, 'link'),
    public.sheet_list(v.payload, 'valoresFuertes'),
    public.sheet_int (v.payload, 'puntuacion')::smallint
  from public.sheet_pending('form1_5') v
  join submissions sub on sub.source_row_key = v.source_row_key;

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

-- No hace falta ningún GRANT nuevo: `import_sheet_rows()` ya lo tenía
-- (`grant execute ... to service_role` en 0015) y la firma no cambió.
