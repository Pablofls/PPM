-- 0023_student_form_deadlines_read.sql — El alumno lee las fechas límite
-- Ver docs/DATABASE_SCHEMA.md#fechas-de-entrega-y-estado-de-las-entregas,
-- docs/AUTH.md y docs/UI_SCREENS.md
--
-- El profesor pidió mostrar, dentro del expediente del alumno (ADN
-- Profesional) y en el portal del alumno, la misma fila de "Estado de
-- Entregas" pero para un solo alumno. `v_submission_status` (0017) ya se
-- puede filtrar a "solo lo mío": las tablas de las que sale
-- (`v_students_directory`, `submissions`) tienen esa política desde `0019`.
--
-- Lo que falta es `form_deadlines`: `resolve_form_deadline()` la consulta, y
-- hasta aquí solo `is_admin()` puede leerla (`0017`). Sin esta política el
-- alumno vería `due_at` siempre NULL y por lo tanto todo en `sin_fecha`, sin
-- importar si entregó a tiempo o no.
--
-- `form_deadlines` no tiene datos personales de ningún alumno —solo reglas de
-- fecha por formulario/idioma/frecuencia/periodo—, así que abrir su lectura
-- a cualquier alumno activo es seguro. Se acota a `current_student_id() is
-- not null` y no a `authenticated` a secas: un usuario `pendiente` sigue sin
-- ver nada (regla «Toda pantalla nace protegida» de CLAUDE.md).
create policy form_deadlines_select_alumno on form_deadlines
  for select to authenticated
  using (public.current_student_id() is not null);
