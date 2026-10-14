/** Cómo se celebra una entrega: confeti si llegó a tiempo, sello si fue tardía. */
export type CelebrationKind = 'on_time' | 'late'

/**
 * El `state` de navegación que dispara la celebración en el índice del portal.
 *
 * Toda actividad nueva que se entregue desde el portal lo mezcla en el `state`
 * con el que regresa a `/alumno`:
 * `navigate('/alumno', { state: { toast, ...celebrationState(esTardia) } })`.
 */
export function celebrationState(late: boolean): { celebrate: CelebrationKind } {
  return { celebrate: late ? 'late' : 'on_time' }
}
