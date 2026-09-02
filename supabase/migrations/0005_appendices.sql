-- 0005_appendices.sql — Apéndices A/B y bitácoras semanales
-- Ver docs/DATABASE_SCHEMA.md#apéndices-y-bitácoras
--
-- Estas tablas SÍ forman parte del esquema, pero sus pantallas están fuera del
-- alcance de esta iteración. Se definen ahora para no rehacer el modelo después.
--
-- AVISO: estas tablas contienen datos sensibles de terceros (teléfonos, RFC,
-- sueldos). No se exportan ni se muestran fuera del panel del profesor.

-- ---------------------------------------------------------------------------
-- A.1 Carta Formal de Aceptación — formA_1
-- ---------------------------------------------------------------------------
create table internship_applications (
  submission_id        uuid primary key references submissions (id) on delete cascade,
  required_hours       smallint,
  internship_option    text,
  restrictions         text,
  company_name         text,
  company_website      text,
  company_tax_id       text,     -- RFC. text: no es un número
  company_founded_year smallint,
  department           text,
  supervisor_name      text,
  supervisor_role      text,
  supervisor_email     citext,
  supervisor_phone     text,     -- text: conserva lada, ceros y formato
  schedule             text,
  is_paid              boolean,  -- 'renumeracion' (sic): Sí -> true
  description          text,
  career_relation      text,
  professional_relation text,
  company_validation   text
);

-- ---------------------------------------------------------------------------
-- B.1 Formulario de Inicio — formB_1
-- ---------------------------------------------------------------------------
create table company_profiles (
  submission_id         uuid primary key references submissions (id) on delete cascade,
  company_name          text,
  company_website       text,
  industry              text,    -- 'giro'
  mission               text,
  vision                text,
  company_values        text,   -- 'values' es palabra reservada en SQL
  address               text,
  weekly_hours          smallint,
  department            text,
  supervisor_info       text,    -- 'datosJefe': nombre y puesto en un solo campo
  supervisor_email      citext,
  supervisor_phone      text,
  activities            text,
  has_contract          boolean,
  salary                numeric(12,2),
  has_linkedin_profile  boolean,
  linkedin_connections  int,
  linkedin_url          text
);

-- ---------------------------------------------------------------------------
-- Bitácora de búsqueda de empleo — form_busqueda  (is_recurring)
-- ---------------------------------------------------------------------------
-- La semana vive en submissions.week_start / week_end, no aquí: son los campos
-- que ordenan la bitácora y son comunes a las dos bitácoras.
create table job_search_logs (
  submission_id uuid primary key references submissions (id) on delete cascade,
  activities    text,
  applications  text,
  interviews    text,
  learnings     text,
  next_steps    text
);

-- ---------------------------------------------------------------------------
-- Bitácora de prácticas — form_practicas  (is_recurring)
-- ---------------------------------------------------------------------------
create table internship_logs (
  submission_id uuid primary key references submissions (id) on delete cascade,
  activities    text,
  hours         numeric(5,2),
  skills        text,
  proposal      text
);
