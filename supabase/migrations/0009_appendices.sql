-- 0009_appendices.sql — Apéndice A y Apéndice B
-- Ver docs/DATABASE_SCHEMA.md#apéndices
--
-- Incorpora formA_1 (Carta Formal de Aceptación) y formB_1 (Formulario de
-- Inicio). Quedan fuera a propósito las bitácoras semanales (form_busqueda,
-- form_practicas) y la hoja fechas_entrega.
--
-- AVISO: estas dos tablas contienen datos sensibles de TERCEROS —teléfonos y
-- correos de jefes, RFC de empresas y sueldos—, no solo de alumnos. No se
-- exportan ni se muestran fuera del panel del profesor.

-- ---------------------------------------------------------------------------
-- El catálogo de formularios ahora admite los módulos A y B
-- ---------------------------------------------------------------------------
alter table forms drop constraint forms_module_valido;
alter table forms add constraint forms_module_valido
  check (module_code in ('1', '2', 'A', 'B'));

-- ---------------------------------------------------------------------------
-- A.1 Carta Formal de Aceptación — formA_1
-- ---------------------------------------------------------------------------
create table internship_applications (
  submission_id         uuid primary key references submissions (id) on delete cascade,

  -- 'horas' viene mezclado en el origen: unos capturan 240, otros
  -- "480 horas voy todos los días 9am". Aquí se guarda el número extraído,
  -- que es lo que el profesor compara contra el requisito de la materia.
  required_hours        smallint,

  internship_option     text,     -- 'opcionesPracticas'
  restrictions          text,
  company_name          text,
  company_website       text,

  -- RFC. text y no un formato validado: en el origen hay filas donde el alumno
  -- capturó el nombre de la empresa en este campo.
  company_tax_id        text,

  company_founded_year  smallint, -- 'anioEmpresa'; el origen trae número, texto y fechas
  department            text,
  supervisor_name       text,
  supervisor_role       text,
  supervisor_email      citext,

  -- text: conserva lada, signos y espacios ('+52-833-155-6372', '81 1468 3544')
  supervisor_phone      text,

  schedule              text,
  is_paid               boolean,  -- 'renumeracion' (sic): Sí -> true
  description           text,
  career_relation       text,
  professional_relation text,     -- 'realacionProfesional' (sic)
  company_validation    text,     -- 'empresaValida'

  constraint internship_hours_range
    check (required_hours is null or required_hours between 0 and 2000),
  constraint internship_year_range
    check (company_founded_year is null or company_founded_year between 1800 and 2100)
);

-- ---------------------------------------------------------------------------
-- B.1 Formulario de Inicio — formB_1
-- ---------------------------------------------------------------------------
create table company_profiles (
  submission_id        uuid primary key references submissions (id) on delete cascade,
  company_name         text,      -- 'empresa'
  company_website      text,
  industry             text,      -- 'giro'
  mission              text,
  vision               text,

  -- 'values' es palabra reservada en SQL, así que la columna lleva prefijo.
  company_values       text,

  address              text,      -- 'direccionEmpresa'

  -- 'horarioLaboral' es texto descriptivo, no un número de horas:
  -- "Lunes a Viernes (9am a 4pm)", "Monday- friday from 9-6pm".
  work_schedule        text,

  department           text,
  supervisor_info      text,      -- 'datosJefe': nombre y puesto en un solo campo
  supervisor_email     citext,
  supervisor_phone     text,
  activities           text,
  has_contract         boolean,   -- 'contrato': Si/Sí/Yes -> true
  salary               numeric(12,2),
  has_linkedin_profile boolean,
  linkedin_connections int,
  linkedin_url         text,

  constraint company_salary_no_negativo
    check (salary is null or salary >= 0),
  constraint company_linkedin_no_negativo
    check (linkedin_connections is null or linkedin_connections >= 0)
);

-- ---------------------------------------------------------------------------
-- Seguridad
-- ---------------------------------------------------------------------------
-- Mismo criterio que el resto: solo administradores, y sin políticas de
-- escritura (RLS deniega por omisión, así que desde el navegador no se puede
-- escribir aunque se manipule la petición).
alter table internship_applications enable row level security;
alter table company_profiles        enable row level security;

create policy internship_applications_select_admin on internship_applications
  for select to authenticated using (public.is_admin());

create policy company_profiles_select_admin on company_profiles
  for select to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Catálogo
-- ---------------------------------------------------------------------------
insert into forms (code, module_code, name_es, name_en, display_order, response_table) values
  ('formA_1', 'A', 'Carta Formal de Aceptación', 'Formal Acceptance Letter', 3.1, 'internship_applications'),
  ('formB_1', 'B', 'Formulario de Inicio',       'Start Form',               4.1, 'company_profiles')
on conflict (code) do nothing;
