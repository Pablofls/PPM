-- 0024_submission_status_due_date_aware.sql — El gris ya no es solo "sin fecha"
-- Ver docs/DATABASE_SCHEMA.md#fechas-de-entrega-y-estado-de-las-entregas
--
-- `submission_status()` (0017) solo comparaba `submitted_at` contra `due_at`
-- cuando había una entrega; sin entrega marcaba `pendiente` (rojo) en cuanto
-- existía una fecha configurada, aunque esa fecha todavía no hubiera llegado.
-- El profesor pidió la tabla completa:
--
--   - Sin fecha límite y ya entregó           → a_tiempo (verde). Sin plazo
--     con qué comparar, que haya entregado es lo único que importa.
--   - Entregó después de la fecha límite      → tarde (ámbar). Igual que antes.
--   - No ha entregado y la fecha ya pasó      → pendiente (rojo). Igual que antes.
--   - No ha entregado y la fecha no ha llegado → sin_fecha (gris). No se le
--     puede pedir cuentas por algo que todavía no vence.
--
-- La única fila que cambia de color es la última: antes salía `pendiente`
-- (rojo) en cuanto se configuraba una fecha, sin importar si ya había pasado.
--
-- Comparar contra "ahora" saca a la función de ser IMMUTABLE —su resultado ya
-- no depende solo de los dos parámetros, cambia con el reloj— y la pasa a
-- STABLE, como `resolve_form_deadline()`.
create or replace function public.submission_status(
  p_due_at       timestamptz,
  p_submitted_at timestamptz
)
returns submission_state
language sql
stable
as $$
  select case
    when p_submitted_at is not null
      and (p_due_at is null or p_submitted_at <= p_due_at)
      then 'a_tiempo'::submission_state
    when p_submitted_at is not null
      then 'tarde'::submission_state
    when p_due_at is not null and now() > p_due_at
      then 'pendiente'::submission_state
    else 'sin_fecha'::submission_state
  end
$$;
