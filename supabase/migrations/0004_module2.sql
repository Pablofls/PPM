-- 0004_module2.sql — Módulo 2: Actúa
-- Ver docs/DATABASE_SCHEMA.md#módulo-2--actúa

-- ---------------------------------------------------------------------------
-- 2.1 FODA · 2.2 CV · 2.4 Cover Letter · 2.5 Elevator Pitch
-- ---------------------------------------------------------------------------
-- Los cuatro formularios tienen exactamente las mismas dos preguntas
-- ('util' y 'porque'), así que comparten tabla. Cuál de los cuatro es se sabe por
-- submissions.form_code.
create table reflections (
  submission_id uuid primary key references submissions (id) on delete cascade,
  was_useful    boolean,       -- 'util': Sí/Si/Yes -> true, No -> false
  reason        text           -- 'porque'. En español o inglés según el idioma
);

-- ---------------------------------------------------------------------------
-- 2.7 Indeed — form2_7
-- ---------------------------------------------------------------------------
-- 'positions' y 'companies' se guardan como texto multilínea tal cual lo captura
-- el alumno. No se parsean a filas: el formato lo escribe a mano y no es confiable.
create table indeed_research (
  submission_id  uuid primary key references submissions (id) on delete cascade,
  positions      text,         -- '3puestos': 3 puestos con sueldo, uno por línea
  position_url_1 text,
  position_url_2 text,
  position_url_3 text,
  companies      text,         -- '3companias': 3 empresas, una por línea
  company_url_1  text,
  company_url_2  text,
  company_url_3  text
);
