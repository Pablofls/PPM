-- 0049_student_grades.sql — El alumno ve sus calificaciones
-- Ver docs/DATABASE_SCHEMA.md#calificaciones-del-alumno
--
-- Hasta aquí (0040) el alumno no tenía ninguna política en `grades` ni en
-- `grade_activities`: el profesor calificaba y el alumno no se enteraba. Ahora
-- el portal tiene la sección Calificaciones, al estilo de Canvas: cada Reporte
-- semana N con su puntuación, el comentario del profesor y el total.
--
-- Modelo: no hay tablas ni columnas nuevas, así que la normalización (4FN) de
-- 0040–0041 no cambia. Solo se agregan:
--   * la pantalla `alumno_calificaciones` (portal, solo lectura), para que el
--     admin la pueda quitar por rol o por persona como las demás del portal;
--   * dos políticas «lo mío» (`current_student_id()`), nunca `authenticated`;
--   * la restrictiva de pantalla de cada tabla deja pasar al alumno cuando
--     tiene esa pantalla.
--
-- El portal lee `v_grade_center` filtrado por su `student_id`: la vista es
-- security_invoker y sus tablas ya dejan al alumno leer lo suyo
-- (v_students_directory, submissions, bitácoras y group_weeks), así que solo
-- faltaban las calificaciones y los puntos posibles. Una vista aparte
-- repetiría la lógica de la semana de cada entrega (0042, 0046).
--
-- Escritura: ninguna. El alumno sigue sin poder escribir en estas tablas.

-- ---------------------------------------------------------------------------
-- Pantalla nueva del portal
-- ---------------------------------------------------------------------------
insert into app_screens (code, max_access, audience)
values ('alumno_calificaciones', 'lectura', 'portal');

insert into role_screen_access (role_code, screen_code, access)
values ('alumno', 'alumno_calificaciones', 'lectura');

-- ---------------------------------------------------------------------------
-- grades: el alumno lee las suyas
-- ---------------------------------------------------------------------------
create policy grades_select_own on grades
  for select to authenticated
  using (student_id = (select public.current_student_id()));

drop policy grades_screen_read on grades;
create policy grades_screen_read on grades
  as restrictive for select to authenticated
  using (
    (select public.screen_access('calificaciones')) >= 'lectura'
    or (
      student_id = (select public.current_student_id())
      and (select public.screen_access('alumno_calificaciones')) >= 'lectura'
    )
  );

-- ---------------------------------------------------------------------------
-- grade_activities: los puntos del reporte en su grupo
-- ---------------------------------------------------------------------------
create policy grade_activities_select_own on grade_activities
  for select to authenticated
  using (group_id = (select public.current_student_group_id()));

drop policy grade_activities_screen_read on grade_activities;
create policy grade_activities_screen_read on grade_activities
  as restrictive for select to authenticated
  using (
    (select public.screen_access('calificaciones')) >= 'lectura'
    or (
      group_id = (select public.current_student_group_id())
      and (select public.screen_access('alumno_calificaciones')) >= 'lectura'
    )
  );
