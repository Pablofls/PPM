-- 0019_student_dossier_read.sql — El alumno lee su propio ADN Profesional
-- Ver docs/DATABASE_SCHEMA.md#vistas y docs/AUTH.md
--
-- Hasta aquí el alumno no leía ni una fila de su expediente (demográficos,
-- Holland, MBTI, DISC, Valores, los datos de la práctica en curso de B.1):
-- era una decisión a propósito, documentada en docs/AUTH.md, no un pendiente
-- olvidado — «la información se abre una pantalla a la vez, cada una con su
-- política». El profesor pidió mostrar la tarjeta ADN Profesional (secciones
-- I a V, sin las bitácoras ni el historial) dentro del portal del alumno, y
-- esta migración abre esa lectura.
--
-- `v_student_dossier` (0012) tiene `security_invoker = on`: sin políticas en
-- las tablas de abajo, la vista seguía devolviendo cero filas aunque el
-- alumno la consultara filtrada por su propio `student_id`. Mismo patrón que
-- `job_search_logs_select_own` e `internship_logs_select_own` (0016): un
-- `EXISTS` contra `submissions`, que ya resuelve «lo mío» con
-- `submissions_select_own`.
--
-- `students` entra también: `v_students_directory` empieza con `FROM students`,
-- y sin una fila propia ahí el `LEFT JOIN` con `demographics` nunca llega a
-- evaluarse. Es la misma razón por la que `current_student_period()` (0018)
-- tuvo que ser `SECURITY DEFINER`.
--
-- No se toca `v_student_job_search_logs` ni `v_student_internship_logs`: esas
-- dos bitácoras el alumno ya las ve por otro camino (sus propias entregas, en
-- `WeeklyLogPage`), y esta migración es solo para las secciones I a V.

create policy students_select_own on students
  for select to authenticated
  using (id = public.current_student_id());

create policy demographics_select_own on demographics
  for select to authenticated
  using (
    exists (
      select 1 from submissions sub
      where sub.id = demographics.submission_id
        and sub.student_id = public.current_student_id()
    )
  );

create policy holland_results_select_own on holland_results
  for select to authenticated
  using (
    exists (
      select 1 from submissions sub
      where sub.id = holland_results.submission_id
        and sub.student_id = public.current_student_id()
    )
  );

create policy mbti_results_select_own on mbti_results
  for select to authenticated
  using (
    exists (
      select 1 from submissions sub
      where sub.id = mbti_results.submission_id
        and sub.student_id = public.current_student_id()
    )
  );

create policy disc_results_select_own on disc_results
  for select to authenticated
  using (
    exists (
      select 1 from submissions sub
      where sub.id = disc_results.submission_id
        and sub.student_id = public.current_student_id()
    )
  );

create policy values_results_select_own on values_results
  for select to authenticated
  using (
    exists (
      select 1 from submissions sub
      where sub.id = values_results.submission_id
        and sub.student_id = public.current_student_id()
    )
  );

create policy company_profiles_select_own on company_profiles
  for select to authenticated
  using (
    exists (
      select 1 from submissions sub
      where sub.id = company_profiles.submission_id
        and sub.student_id = public.current_student_id()
    )
  );
