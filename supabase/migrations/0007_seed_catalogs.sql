-- 0007_seed_catalogs.sql — Catálogos base
-- Solo datos de configuración. NINGÚN dato de alumnos: esos se importan aparte,
-- siguiendo docs/DATA_MAPPING.md.

-- ---------------------------------------------------------------------------
-- Módulos
-- ---------------------------------------------------------------------------
insert into modules (code, name_es, name_en, display_order) values
  ('1', 'Conócete',                      'Know Yourself', 1),
  ('2', 'Actúa',                         'Take Action',   2),
  ('A', 'Apéndice A: Cartas Requeridas', 'Appendix A',    3),
  ('B', 'Apéndice B: Reportes',          'Appendix B',    4),
  ('W', 'Bitácoras semanales',           'Weekly Logs',   5)
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- Formularios
-- ---------------------------------------------------------------------------
-- Los códigos son los mismos que las hojas del Google Sheets.
-- No existen form2_3 ni form2_6: la numeración del Módulo 2 salta de 2.2 a 2.4 y
-- de 2.5 a 2.7 en el original, y se respeta porque es la que ya conocen el
-- profesor y los alumnos.
insert into forms (code, module_code, name_es, name_en, display_order, is_recurring, response_table) values
  ('form1_0',        '1', 'Datos Demográficos',          'Demographic Data',        1.0, false, 'demographics'),
  ('form1_1',        '1', 'Intereses Profesionales',     'Professional Interests',  1.1, false, 'holland_results'),
  ('form1_2',        '1', 'Personalidad',                'Personality',             1.2, false, 'mbti_results'),
  ('form1_3',        '1', 'Estilos de Comportamiento',   'Behavioral Styles',       1.3, false, 'disc_results'),
  ('form1_4',        '1', 'Formulario de Habilidades',   'Skills Form',             1.4, false, 'skills_assessment'),
  ('form1_5',        '1', 'Valores',                     'Values',                  1.5, false, 'values_results'),
  ('form2_1',        '2', 'Análisis FODA',               'SWOT Analysis',           2.1, false, 'reflections'),
  ('form2_2',        '2', 'Curriculum Vitae',            'Curriculum Vitae',        2.2, false, 'reflections'),
  ('form2_4',        '2', 'Cover Letter',                'Cover Letter',            2.4, false, 'reflections'),
  ('form2_5',        '2', 'Elevator Pitch',              'Elevator Pitch',          2.5, false, 'reflections'),
  ('form2_7',        '2', 'Indeed',                      'Indeed',                  2.7, false, 'indeed_research'),
  ('formA_1',        'A', 'Carta Formal de Aceptación',  'Formal Acceptance Letter', 3.1, false, 'internship_applications'),
  ('formB_1',        'B', 'Formulario de Inicio',        'Start Form',              4.1, false, 'company_profiles'),
  ('form_busqueda',  'W', 'Bitácora de búsqueda de empleo', 'Job Search Log',       5.1, true,  'job_search_logs'),
  ('form_practicas', 'W', 'Bitácora de prácticas',       'Internship Log',          5.2, true,  'internship_logs')
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- Periodos
-- ---------------------------------------------------------------------------
-- TODO: confirmar starts_on / ends_on con el profesor. No se inventan fechas.
insert into periods (code, name, starts_on, ends_on, is_active) values
  ('PR-26', 'Primavera 2026', null, null, true),
  ('OT-26', 'Otoño 2026',     null, null, true)
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- Carreras
-- ---------------------------------------------------------------------------
-- TODO: confirmar el nombre completo de cada carrera con el profesor.
-- Por ahora name = code para no inventar denominaciones oficiales.
insert into degree_programs (code, name) values
  ('LMEC', 'LMEC'),
  ('LMI',  'LMI')
on conflict (code) do nothing;
