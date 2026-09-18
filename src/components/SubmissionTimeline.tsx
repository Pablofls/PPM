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
      <p className="text-sm text-slate-500">
        El historial de respuestas aparecerá cuando se conecte la base de datos.
      </p>
    )
  }

  if (entries.length === 0) {
    return <p className="text-sm text-slate-500">Este alumno aún no responde el formulario.</p>
  }

  return (
    <ol className="space-y-3">
      {entries.map((entry) => (
        <li key={entry.submissionId} className="flex gap-3">
          <div className="mt-1.5 flex flex-col items-center">
            <span
              className={`size-2 rounded-full ${
                entry.isLatest ? 'bg-accent-400 ring-2 ring-accent-200' : 'bg-slate-300'
              }`}
            />
            <span className="mt-1 w-px flex-1 bg-slate-200" />
          </div>
          <div className="pb-1">
            <p className="text-sm font-medium text-slate-800">
              {formatDateTime(entry.submittedAt)}
              {entry.isLatest && (
                <span className="ml-2 rounded-full bg-accent-100 px-2 py-0.5 text-xs font-medium text-accent-800">
                  vigente
                </span>
              )}
            </p>
            {entry.weekStart && (
              <p className="text-xs text-slate-500">
                Semana {formatWeekRange(entry.weekStart, entry.weekEnd)}
              </p>
            )}
          </div>
        </li>
      ))}
    </ol>
  )
}
