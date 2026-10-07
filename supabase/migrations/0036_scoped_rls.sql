-- 0036_scoped_rls.sql — Maestros y coordinadores leen solo a SUS alumnos
-- Ver docs/DATABASE_SCHEMA.md#seguridad y docs/AUTH.md
--
-- Va DESPUÉS de 0035_roles.sql (usa sus funciones de alcance).
--
-- Las políticas `*_select_admin` no se tocan: el admin sigue viendo todo. Aquí
-- se AGREGA una política `*_select_scope` por tabla, y Postgres une las
-- políticas permisivas con OR:
--
--   * maestro       los alumnos inscritos en sus grupos.
--   * coordinador   los alumnos de los grupos de los maestros que coordina.
--
-- Todas usan `x in (select public.visible_…())`: un subquery sin correlación,
-- que Postgres evalúa una vez por consulta y no una vez por fila.
--
-- Sigue sin haber `authenticated` a secas (regla «Toda pantalla nace
-- protegida»): quien no tiene ningún rol no ve ni una fila. La escritura no
-- cambia: todo lo que se escribe desde el panel sigue siendo admin-only.

-- ---------------------------------------------------------------------------
-- Datos de alumnos
-- ---------------------------------------------------------------------------
create policy students_select_scope on students
  for select to authenticated
  using (id in (select public.visible_student_ids()));

create policy submissions_select_scope on submissions
  for select to authenticated
  using (student_id in (select public.visible_student_ids()));

create policy student_enrollments_select_scope on student_enrollments
  for select to authenticated
  using (student_id in (select public.visible_student_ids()));

-- Las tablas de respuestas cuelgan de submission_id (regla «Historial
-- completo»): se llega al alumno a través de submissions.
do $$
declare t text;
begin
  foreach t in array array[
    'demographics', 'holland_results', 'mbti_results', 'disc_results',
    'skills_assessment', 'values_results', 'reflections', 'indeed_research',
    'internship_applications', 'company_profiles',
    'job_search_logs', 'internship_logs'
  ]
  loop
    execute format(
      'create policy %I on %I for select to authenticated using (
         submission_id in (
           select s.id from public.submissions s
           where s.student_id in (select public.visible_student_ids())
         )
       )',
      t || '_select_scope', t
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Grupos y maestros
-- ---------------------------------------------------------------------------
create policy groups_select_scope on groups
  for select to authenticated
  using (id in (select public.visible_group_ids()));

-- Para ver el nombre del maestro en las tarjetas (v_groups une profiles).
create policy profiles_select_scope on profiles
  for select to authenticated
  using (id in (select public.visible_teacher_ids()));

-- ---------------------------------------------------------------------------
-- Catálogos y calendario: sin datos personales, los lee todo el staff
-- ---------------------------------------------------------------------------
-- Las pantallas los necesitan para armar la matriz de Estado de Entregas, las
-- semanas de las bitácoras y el indicador de «Sincronizado hace…». Escribirlos
-- sigue siendo solo del admin.
create policy forms_select_staff on forms
  for select to authenticated using (public.is_staff());

create policy periods_select_staff on periods
  for select to authenticated using (public.is_staff());

create policy form_deadlines_select_staff on form_deadlines
  for select to authenticated using (public.is_staff());

create policy semester_weeks_select_staff on semester_weeks
  for select to authenticated using (public.is_staff());

create policy sheet_sync_runs_select_staff on sheet_sync_runs
  for select to authenticated using (public.is_staff());

-- `sheet_rows` NO: son las filas crudas del Sheets, con los datos personales
-- de todos los alumnos sin filtrar por grupo. Sigue siendo solo del admin.
