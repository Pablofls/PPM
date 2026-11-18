-- 0056_appendices_in_panel.sql — Los Apéndices A.1 y B.1 se contestan en el portal
-- Ver docs/DATABASE_SCHEMA.md#los-apéndices-se-contestan-en-el-portal
--
-- Igual que el Módulo 1 (0054) y el Módulo 2 (0055), pensando en los grupos
-- SIGUIENTES; los Google Forms siguen sincronizándose. Con esto ya ningún
-- formulario se contesta solo en Google Forms.
--
--   * A.1 Formulario de Autorización de Prácticas (internship_applications):
--     ya está en 4FN, no cambia. Las preguntas cerradas guardan el texto en
--     español de la opción, como las respuestas en español del Google Form.
--   * B.1 Reporte 1: Inicio de Prácticas (company_profiles), columnas nuevas:
--       - internship_start_date: fecha de inicio de las prácticas (la pidió el
--         profesor el 2026-11-17). Nula en lo que vino de Google Forms.
--       - supervisor_name, supervisor_title, supervisor_role: «Datos del jefe
--         directo» era UN texto con nombre, título y cargo (no atómico, ni
--         1FN). Ahora tres columnas. supervisor_info se queda como el texto de
--         Google Forms; las entregas del portal lo dejan nulo.
--     Todas dependen solo de la entrega (la llave): 4FN.
--   * LinkedIn: sin perfil no se piden contactos ni URL. Se valida en
--     submit_company_profile() y no con un CHECK, porque una fila vieja del
--     Sheets (que pedía los tres siempre) lo rompería y detendría la
--     sincronización.
--
-- Efecto conocido (como en 0054/0055): con las actividades en borrador,
-- Estado de Entregas deja de usar su fecha en los grupos actuales hasta que
-- se publiquen.

begin;

-- ---------------------------------------------------------------------------
-- Los dos formularios son del portal; sus actividades, en borrador
-- ---------------------------------------------------------------------------
update forms set answered_in_panel = true
where code in ('formA_1', 'formB_1');

update activities set is_published = false, updated_at = now()
where form_code in ('formA_1', 'formB_1')
  and is_published;

update app_screens
set max_access = 'edicion', audience = 'ambos'
where code in ('formA_1', 'formB_1');

insert into role_screen_access (role_code, screen_code, access)
select 'alumno', code, 'edicion'
from (values ('formA_1'), ('formB_1')) f(code)
on conflict (role_code, screen_code) do update set access = excluded.access;

-- ---------------------------------------------------------------------------
-- B.1: columnas nuevas
-- ---------------------------------------------------------------------------
alter table company_profiles
  add column internship_start_date date,
  add column supervisor_name       text,
  add column supervisor_title      text,
  add column supervisor_role       text;

-- «Lic. Ana López, Gerente de RH»: el texto de Google Forms, o el armado de
-- las tres columnas para lo entregado en el portal.
create or replace function public.company_supervisor_text(p_submission_id uuid, p_legacy text)
returns text
language sql
stable
as $$
  select coalesce(
    p_legacy,
    (select nullif(concat_ws(', ',
              nullif(concat_ws(' ', cp.supervisor_title, cp.supervisor_name), ''),
              cp.supervisor_role), '')
     from company_profiles cp
     where cp.submission_id = p_submission_id)
  )
$$;

-- ---------------------------------------------------------------------------
-- Vistas: idioma del grupo; lo nuevo al final
-- ---------------------------------------------------------------------------
create or replace view v_panel_internships as
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
  ia.*,
  dir.group_id
from v_students_directory dir
join latest_submissions ls
  on ls.student_id = dir.student_id
 and ls.form_code = 'formA_1'
join internship_applications ia on ia.submission_id = ls.id;

alter view v_panel_internships set (security_invoker = on);

-- Ya no cp.*: las columnas de 0009 en su orden, y las nuevas después de group_id.
create or replace view v_panel_companies as
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
  cp.submission_id,
  cp.company_name,
  cp.company_website,
  cp.industry,
  cp.mission,
  cp.vision,
  cp.company_values,
  cp.address,
  cp.work_schedule,
  cp.department,
  public.company_supervisor_text(cp.submission_id, cp.supervisor_info) as supervisor_info,
  cp.supervisor_email,
  cp.supervisor_phone,
  cp.activities,
  cp.has_contract,
  cp.salary,
  cp.has_linkedin_profile,
  cp.linkedin_connections,
  cp.linkedin_url,
  dir.group_id,
  cp.supervisor_name,
  cp.supervisor_title,
  cp.supervisor_role,
  cp.internship_start_date
from v_students_directory dir
join latest_submissions ls
  on ls.student_id = dir.student_id
 and ls.form_code = 'formB_1'
join company_profiles cp on cp.submission_id = ls.id;

alter view v_panel_companies set (security_invoker = on);

-- Expediente: el jefe directo armado y la fecha de inicio al final (cuerpo de 0054).
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
  public.company_supervisor_text(cp.submission_id, cp.supervisor_info) as supervisor_info,
  cp.supervisor_email,
  cp.supervisor_phone,
  cp.company_website,
  cp.has_contract,
  cp.salary,
  cp.linkedin_url,

  -- Grupo vigente (0032)
  dir.group_id,

  -- B.1: fecha de inicio de las prácticas (0056)
  cp.internship_start_date
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

alter view v_student_dossier set (security_invoker = on);

-- ---------------------------------------------------------------------------
-- El alumno lee y entrega lo suyo
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['internship_applications', 'company_profiles'] loop
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
      'form2_1', 'form2_2', 'form2_4', 'form2_5', 'form2_7',
      'formA_1', 'formB_1'
    )
    and source_row_key is null
  );

do $$
declare
  t text;
  f text;
begin
  for t, f in
    select * from (values
      ('internship_applications', 'formA_1'),
      ('company_profiles',        'formB_1')
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
-- Funciones de entrega (SECURITY INVOKER; open_portal_submission() de 0054)
-- ---------------------------------------------------------------------------
-- Texto obligatorio de un jsonb: recortado; nulo si viene vacío.
create or replace function public.portal_text(p jsonb, k text)
returns text
language sql
immutable
as $$
  select nullif(btrim(p ->> k), '')
$$;

-- A.1 Formulario de Autorización de Prácticas
create or replace function public.submit_internship_application(p jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id     uuid;
  v_hours  text := public.portal_text(p, 'required_hours');
  v_year   text := public.portal_text(p, 'company_founded_year');
  v_email  text := lower(coalesce(public.portal_text(p, 'supervisor_email'), ''));
  v_paid   text := public.portal_text(p, 'is_paid');
  v_key    text;
begin
  foreach v_key in array array[
    'required_hours', 'internship_option', 'restrictions', 'company_name',
    'company_website', 'company_tax_id', 'company_founded_year', 'department',
    'supervisor_name', 'supervisor_role', 'supervisor_email', 'supervisor_phone',
    'schedule', 'is_paid', 'description', 'career_relation',
    'professional_relation', 'company_validation'
  ] loop
    if public.portal_text(p, v_key) is null then
      raise exception 'Contesta todas las preguntas.';
    end if;
  end loop;

  -- El formato primero y el rango después: así un texto no llega al cast.
  if v_hours !~ '^[0-9]{1,4}$' then
    raise exception 'Escribe el número de horas, por ejemplo 480.';
  end if;
  if v_hours::int > 2000 then
    raise exception 'Escribe el número de horas, por ejemplo 480.';
  end if;
  if v_year !~ '^[0-9]{4}$' then
    raise exception 'Escribe el año en que la empresa comenzó operaciones, por ejemplo 2015.';
  end if;
  if v_year::int not between 1800 and extract(year from now())::int then
    raise exception 'Escribe el año en que la empresa comenzó operaciones, por ejemplo 2015.';
  end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Escribe un correo válido de tu jefe directo.';
  end if;
  if v_paid not in ('si', 'no') then
    raise exception 'Contesta si tus prácticas tienen remuneración.';
  end if;

  v_id := public.open_portal_submission('formA_1');
  insert into internship_applications (
    submission_id, required_hours, internship_option, restrictions,
    company_name, company_website, company_tax_id, company_founded_year,
    department, supervisor_name, supervisor_role, supervisor_email,
    supervisor_phone, schedule, is_paid, description, career_relation,
    professional_relation, company_validation
  )
  values (
    v_id, v_hours::smallint,
    public.portal_text(p, 'internship_option'),
    public.portal_text(p, 'restrictions'),
    public.portal_text(p, 'company_name'),
    public.portal_text(p, 'company_website'),
    upper(public.portal_text(p, 'company_tax_id')),
    v_year::smallint,
    public.portal_text(p, 'department'),
    public.portal_text(p, 'supervisor_name'),
    public.portal_text(p, 'supervisor_role'),
    v_email::citext,
    public.portal_text(p, 'supervisor_phone'),
    public.portal_text(p, 'schedule'),
    v_paid = 'si',
    public.portal_text(p, 'description'),
    public.portal_text(p, 'career_relation'),
    public.portal_text(p, 'professional_relation'),
    public.portal_text(p, 'company_validation')
  );
  return v_id;
end;
$$;

-- B.1 Reporte 1: Inicio de Prácticas
create or replace function public.submit_company_profile(p jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id       uuid;
  v_email    text := lower(coalesce(public.portal_text(p, 'supervisor_email'), ''));
  v_start    text := public.portal_text(p, 'internship_start_date');
  v_contract text := public.portal_text(p, 'has_contract');
  v_salary   text := public.portal_text(p, 'salary');
  v_linkedin text := public.portal_text(p, 'has_linkedin_profile');
  v_contacts text := public.portal_text(p, 'linkedin_connections');
  v_url      text := public.portal_text(p, 'linkedin_url');
  v_key      text;
begin
  foreach v_key in array array[
    'company_name', 'company_website', 'industry', 'mission', 'vision',
    'company_values', 'address', 'work_schedule', 'department',
    'internship_start_date', 'supervisor_name', 'supervisor_title',
    'supervisor_role', 'supervisor_email', 'supervisor_phone', 'activities',
    'has_contract', 'has_linkedin_profile'
  ] loop
    if public.portal_text(p, v_key) is null then
      raise exception 'Contesta todas las preguntas.';
    end if;
  end loop;

  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Escribe un correo válido de tu jefe directo.';
  end if;
  if v_start !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'Revisa la fecha de inicio de tus prácticas.';
  end if;
  begin
    if v_start::date not between date '2000-01-01' and (current_date + 730) then
      raise exception 'Revisa la fecha de inicio de tus prácticas.';
    end if;
  exception when datetime_field_overflow or invalid_datetime_format then
    raise exception 'Revisa la fecha de inicio de tus prácticas.';
  end;
  if v_contract not in ('si', 'no') or v_linkedin not in ('si', 'no') then
    raise exception 'Contesta todas las preguntas.';
  end if;
  if v_salary is not null and v_salary !~ '^[0-9]+(\.[0-9]{1,2})?$' then
    raise exception 'El sueldo es un número, por ejemplo 8000.';
  end if;
  -- Con perfil de LinkedIn: contactos y URL obligatorios; sin perfil, ninguno.
  if v_linkedin = 'si' then
    if coalesce(v_contacts, '') !~ '^[0-9]{1,7}$' or v_url is null then
      raise exception 'Escribe tus contactos y la URL de tu perfil de LinkedIn.';
    end if;
  else
    v_contacts := null;
    v_url := null;
  end if;

  v_id := public.open_portal_submission('formB_1');
  insert into company_profiles (
    submission_id, company_name, company_website, industry, mission, vision,
    company_values, address, work_schedule, department, internship_start_date,
    supervisor_name, supervisor_title, supervisor_role, supervisor_email,
    supervisor_phone, activities, has_contract, salary,
    has_linkedin_profile, linkedin_connections, linkedin_url
  )
  values (
    v_id,
    public.portal_text(p, 'company_name'),
    public.portal_text(p, 'company_website'),
    public.portal_text(p, 'industry'),
    public.portal_text(p, 'mission'),
    public.portal_text(p, 'vision'),
    public.portal_text(p, 'company_values'),
    public.portal_text(p, 'address'),
    public.portal_text(p, 'work_schedule'),
    public.portal_text(p, 'department'),
    v_start::date,
    public.portal_text(p, 'supervisor_name'),
    public.portal_text(p, 'supervisor_title'),
    public.portal_text(p, 'supervisor_role'),
    v_email::citext,
    public.portal_text(p, 'supervisor_phone'),
    public.portal_text(p, 'activities'),
    v_contract = 'si',
    v_salary::numeric,
    v_linkedin = 'si',
    v_contacts::int,
    v_url
  );
  return v_id;
end;
$$;

revoke execute on function public.submit_internship_application(jsonb) from public, anon;
revoke execute on function public.submit_company_profile(jsonb) from public, anon;
grant  execute on function public.submit_internship_application(jsonb) to authenticated;
grant  execute on function public.submit_company_profile(jsonb) to authenticated;

commit;
