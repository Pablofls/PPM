-- 0025_student_forms_read.sql — El alumno lee el catálogo de formularios
-- Ver docs/DATABASE_SCHEMA.md#fechas-de-entrega-y-estado-de-las-entregas y
-- docs/AUTH.md
--
-- `forms` tiene RLS admin-only desde `0006_views_rls.sql` (`forms_select_admin`):
-- es una tabla con datos personales de alumnos alrededor (se agregó en el mismo
-- bloque que `students`, `submissions`, etc.), pero ella misma solo guarda el
-- catálogo de los 15 formularios (código, nombre, módulo) — nada de un alumno
-- en particular.
--
-- `v_submission_status` (0017) hace `cross join (select code from forms where
-- code <> 'form1_0') f`: sin esta política, ese cruce le devuelve CERO filas al
-- alumno (no una fila por formulario en `sin_fecha`, sino ninguna fila), así
-- que su "Estado de Entregas" sale completamente vacío aunque `form_deadlines`
-- (`0023`) y sus propias `submissions` sí sean legibles. Se detectó probando la
-- API directamente: `latest_submissions` y `form_deadlines` devolvían datos
-- reales para el alumno, pero `forms` sola devolvía `[]`.
--
-- Mismo criterio que `0023`: `forms` no tiene datos personales de ningún
-- alumno, así que abrir su lectura a cualquier alumno activo es seguro. Se
-- acota a `current_student_id() is not null` y no a `authenticated` a secas,
-- para que un usuario `pendiente` siga sin ver nada.
create policy forms_select_alumno on forms
  for select to authenticated
  using (public.current_student_id() is not null);
