-- 0047_rls_init_plans.sql — Las políticas evalúan sus funciones auxiliares una
-- sola vez por consulta, no una vez por fila
-- Ver docs/DATABASE_SCHEMA.md#seguridad
--
-- Diagnóstico (explain analyze, 2026-10-14, alumno con 12 entregas):
--   v_student_job_search_logs    498 ms
--   v_student_internship_logs    524 ms
--   v_weekly_submission_status   900 ms
--   v_grade_center (maestro)    1387 ms (0042 arregló solo el LATERAL)
--
-- Las políticas hacen `student_id = current_student_id() OR is_admin()`. Son
-- funciones SECURITY DEFINER que consultan profiles y user_roles (~7 buffers
-- por llamada), y Postgres las ejecuta por CADA fila que revisa. Un Seq Scan
-- sobre 652 filas de `submissions` costaba 4 574 buffers.
--
-- Envueltas en `(select ...)` Postgres las trata como InitPlan: se evalúan una
-- vez por consulta. El resultado es el mismo —el JWT no cambia dentro de una
-- sentencia—, solo cambia cuántas veces se calcula. Es el patrón que ya usan
-- las políticas con `(select auth.uid())`.
--
-- No se añade, quita ni cambia ninguna política de acceso: se reescribe la
-- expresión de las existentes con `alter policy` (conserva roles y si es
-- permisiva o restrictiva). Solo se envuelven las funciones sin argumentos;
-- lo que ya estaba envuelto no se toca, así que es seguro correrla dos veces.
--
-- Cada política reescrita sale como NOTICE (pestaña Results/Messages).

do $$
declare
  pol       record;
  pattern   constant text :=
    '(?<!SELECT )\m(public\.)?(is_admin|is_staff|current_student_id|current_student_period|current_student_group_id)\(\)';
  new_using text;
  new_check text;
  stmt      text;
  changed   int := 0;
begin
  for pol in
    select c.oid::regclass as tbl,
           p.polname,
           pg_get_expr(p.polqual,      p.polrelid) as using_expr,
           pg_get_expr(p.polwithcheck, p.polrelid) as check_expr
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
    order by 1, 2
  loop
    new_using := regexp_replace(pol.using_expr, pattern, '(select \1\2())', 'g');
    new_check := regexp_replace(pol.check_expr, pattern, '(select \1\2())', 'g');

    -- Nada que envolver (o ya estaba envuelto).
    continue when new_using is not distinct from pol.using_expr
              and new_check is not distinct from pol.check_expr;

    stmt := format('alter policy %I on %s', pol.polname, pol.tbl);
    if new_using is not null then
      stmt := stmt || format(' using (%s)', new_using);
    end if;
    if new_check is not null then
      stmt := stmt || format(' with check (%s)', new_check);
    end if;

    execute stmt;
    changed := changed + 1;
    raise notice 'reescrita: % on %', pol.polname, pol.tbl;
  end loop;

  raise notice 'Políticas reescritas: %', changed;
end;
$$;
