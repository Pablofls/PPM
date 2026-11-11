import type { Activity } from '../data/types'
import type { ActivityFormCode } from './catalog'

/**
 * Estado de una actividad, derivado de su publicación y sus fechas (`0051`).
 * No se guarda en la base: depende de la hora, igual que «tardía» (`0043`).
 *
 * - `borrador`   no publicada; el alumno no la ve.
 * - `programada` publicada, pero «Disponible desde» todavía no llega; el
 *                alumno no la ve.
 * - `abierta`    el alumno la ve y puede entregar.
 * - `cerrada`    ya pasó «Disponible hasta»: la ve, pero no puede entregar.
 */
export type ActivityState = 'borrador' | 'programada' | 'abierta' | 'cerrada'

export function activityState(activity: Activity, now: Date = new Date()): ActivityState {
  if (!activity.isPublished) return 'borrador'
  if (activity.availableFrom && new Date(activity.availableFrom) > now) return 'programada'
  if (activity.availableUntil && new Date(activity.availableUntil) <= now) return 'cerrada'
  return 'abierta'
}

/** Igual que `activity_is_open()` en la base: publicada, iniciada y sin cerrar. */
export const isActivityOpen = (activity: Activity, now: Date = new Date()): boolean =>
  activityState(activity, now) === 'abierta'

/** ¿La entrega llegó después de la fecha de entrega? */
export const isLateSubmission = (activity: Activity, submittedAt: string | null): boolean =>
  !!activity.dueAt && !!submittedAt && new Date(submittedAt) > new Date(activity.dueAt)

const MONTERREY_PARTS = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Monterrey',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

/**
 * ISO con zona → `YYYY-MM-DDTHH:mm` en hora de Monterrey, el valor de un
 * `<input type="datetime-local">`. La base hace el camino de regreso
 * (`save_activity` recibe hora local), así que el cliente nunca suma desfases.
 */
export function toMonterreyInput(value: string | null): string {
  if (!value) return ''
  const parts = Object.fromEntries(
    MONTERREY_PARTS.formatToParts(new Date(value)).map((part) => [part.type, part.value]),
  )
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`
}

/** La fila que todavía no existe en la base se trata como un borrador sin fechas. */
export function activityOrDefault(
  activities: Activity[],
  formCode: ActivityFormCode,
  groupId: string,
): Activity {
  return (
    activities.find((activity) => activity.formCode === formCode) ?? {
      groupId,
      formCode,
      instructions: null,
      isPublished: false,
      availableFrom: null,
      dueAt: null,
      availableUntil: null,
      updatedAt: '',
    }
  )
}
