import type { SubmissionHistoryEntry } from '../data/types'
import { formatDateTime, formatWeekRange } from '../lib/format'

/**
 * Historial de respuestas de un alumno a un formulario, de la más reciente a la
 * más antigua.
 *
 * La tabla de cada pantalla muestra una sola fila por alumno (la respuesta
 * vigente), pero el historial completo siempre está a un clic. Esto es
 * indispensable para las bitácoras semanales, donde un alumno acumula hasta 10
 * respuestas, y evita que un reenvío borre la respuesta anterior.
 */
export function SubmissionTimeline({
  entries,
  isConnected,
}: {
  entries: SubmissionHistoryEntry[]
  isConnected: boolean
}) {
  if (!isConnected) {
    return (
      <p className="text-sm text-ink-500">
        El historial de respuestas aparecerá cuando se conecte la base de datos.
      </p>
    )
  }

  if (entries.length === 0) {
    return <p className="text-sm text-ink-500">Este alumno aún no responde el formulario.</p>
  }

  return (
    <ol className="space-y-3">
      {entries.map((entry) => (
        <li key={entry.submissionId} className="flex gap-3">
          <div className="mt-1.5 flex flex-col items-center">
            <span
              className={`size-2 rounded-full ${
                entry.isLatest ? 'bg-accent-400' : 'bg-ink-200'
              }`}
            />
            <span className="mt-1 w-px flex-1 bg-ink-100" />
          </div>
          <div className="pb-1">
            <p className="text-sm font-medium text-ink-800">
              {formatDateTime(entry.submittedAt)}
              {entry.isLatest && (
                <span className="ml-2 text-xs font-normal text-ink-500">vigente</span>
              )}
            </p>
            {entry.weekStart && (
              <p className="text-xs text-ink-500">
                Semana {formatWeekRange(entry.weekStart, entry.weekEnd)}
              </p>
            )}
          </div>
        </li>
      ))}
    </ol>
  )
}
