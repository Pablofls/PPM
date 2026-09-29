-- 0027_weekly_submission_status.sql — "Estado de Entregas" para las semanas
-- Ver docs/DATABASE_SCHEMA.md#fechas-de-entrega-y-estado-de-las-entregas y
-- #semanas-del-semestre
--
-- "Estado de Entregas" (`v_submission_status`, 0017) es la matriz alumno ×
-- formulario para los 12 formularios con fecha límite. Las dos bitácoras
-- nunca estuvieron ahí a propósito (comentario de 0017: "nunca estuvieron en
-- la tabla forms"): no tienen una fecha límite fija, tienen una por semana.
--
-- El profesor pidió la misma idea pero por semana: el alumno reporta una sola
-- bitácora cada semana (Búsqueda mientras no tiene práctica, Prácticas en
-- cuanto la consigue — nunca las dos), así que lo que importa no es cuál de
-- las dos formas usó, sino si esa semana quedó reportada.
--
-- No hace falta una tabla de fechas límite nueva: cada semana ya trae la suya,
-- `semester_weeks.week_end`. Se reutiliza `submission_status()` (0017,
-- redefinida en 0024) tal cual — la misma función, el mismo significado de
-- color, comparando contra el fin de esa semana en vez de una fecha fija.

-- ---------------------------------------------------------------------------
-- v_weekly_submission_status — alumno × semana configurada de su periodo
-- ---------------------------------------------------------------------------
-- Sale de v_students_directory, no de una consulta a students/demographics a
-- mano: hoy (0016 dio submissions_select_own, 0019 dio students_select_own y
-- demographics_select_own) esa vista ya resuelve el periodo del alumno tanto
-- para el profesor (is_admin()) como para el propio alumno leyendo su fila —
-- a diferencia de cuando se escribió el comentario de 0018, antes de 0019.
-- Por eso esta vista, a diferencia de la de 0026, sí la puede leer el alumno
-- sobre sí mismo: la usan el expediente del profesor Y el portal del alumno.
--
-- `wl` es la primera entrega (cualquiera de las dos bitácoras) cuyo
-- `week_start` cae dentro del rango de esa semana configurada — mismo
-- emparejamiento de mejor esfuerzo que `0026`. `min()` porque en el caso normal
-- hay una sola; si alguna vez hubiera dos (el alumno cambió de bitácora la
-- misma semana en que hizo el cambio de Búsqueda a Prácticas), cuenta la
-- primera que entregó esa semana.
create view v_weekly_submission_status as
select
  dir.student_id,
  sw.week_number,
  sw.week_start,
  sw.week_end,
  wl.submitted_at,
  (sw.week_end + time '23:59:59') at time zone 'America/Monterrey' as due_at,
  public.submission_status(
    (sw.week_end + time '23:59:59') at time zone 'America/Monterrey',
    wl.submitted_at
  ) as state
from v_students_directory dir
join semester_weeks sw on sw.period_code = dir.period_code
left join lateral (
  select min(sub.submitted_at) as submitted_at
  from submissions sub
  where sub.student_id = dir.student_id
    and sub.form_code in ('form_busqueda', 'form_practicas')
    and sub.week_start between sw.week_start and sw.week_end
) wl on true;

alter view v_weekly_submission_status set (security_invoker = on);
