-- 0007_seed_forms.sql — Catálogo de formularios
-- Solo configuración. NINGÚN dato de alumnos: esos se importan aparte siguiendo
-- docs/DATA_MAPPING.md.
--
-- Los códigos son los mismos que las hojas del Google Sheets. No existen
-- form2_3 ni form2_6: la numeración del Módulo 2 salta de 2.2 a 2.4 y de 2.5 a
-- 2.7 en el original, y se respeta porque es la que ya conocen el profesor y los
-- alumnos.
insert into forms (code, module_code, name_es, name_en, display_order, response_table) values
  ('form1_0', '1', 'Datos Demográficos',        'Demographic Data',       1.0, 'demographics'),
  ('form1_1', '1', 'Intereses Profesionales',   'Professional Interests', 1.1, 'holland_results'),
  ('form1_2', '1', 'Personalidad',              'Personality',            1.2, 'mbti_results'),
  ('form1_3', '1', 'Estilos de Comportamiento', 'Behavioral Styles',      1.3, 'disc_results'),
  ('form1_4', '1', 'Formulario de Habilidades', 'Skills Form',            1.4, 'skills_assessment'),
  ('form1_5', '1', 'Valores',                   'Values',                 1.5, 'values_results'),
  ('form2_1', '2', 'Análisis FODA',             'SWOT Analysis',          2.1, 'reflections'),
  ('form2_2', '2', 'Curriculum Vitae',          'Curriculum Vitae',       2.2, 'reflections'),
  ('form2_4', '2', 'Cover Letter',              'Cover Letter',           2.4, 'reflections'),
  ('form2_5', '2', 'Elevator Pitch',            'Elevator Pitch',         2.5, 'reflections'),
  ('form2_7', '2', 'Indeed',                    'Indeed',                 2.7, 'indeed_research')
on conflict (code) do nothing;
