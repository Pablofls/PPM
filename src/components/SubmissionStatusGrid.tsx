import { useEffect, useState } from 'react'

import { repository } from '../data/repository'
import type { SubmissionState, SubmissionStatusCell } from '../data/types'
import { DEADLINE_FORMS, type FormCode } from '../lib/catalog'
import { formatDateTime } from '../lib/format'

export const SUBMISSION_STATE_COLOR: Record<SubmissionState, string> = {
  a_tiempo: 'bg-emerald-500',
  tarde: 'bg-accent-500',
  pendiente: 'bg-red-500',
  sin_fecha: 'bg-ink-200',
}

/**
 * El cuadro de un formulario, con su propio tooltip. Mismo color y mismo
 * significado que la matriz de "Estado de Entregas" (`SubmissionStatusPage`):
 * un solo código de color en todo el panel.
 */
export function SubmissionStatusSquare({ cell }: { cell: SubmissionStatusCell | undefined }) {
  const state = cell?.state ?? 'sin_fecha'
  const label = cell?.submittedAt
    ? `Entregado: ${formatDateTime(cell.submittedAt)}`
    : state === 'pendiente'
      ? 'No entregado'
      : 'Sin fecha límite configurada'

  return (
    <span className="group/cell relative inline-block">
      <span className={`inline-block size-5 rounded-sm ${SUBMISSION_STATE_COLOR[state]}`} />
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1.5 -translate-x-1/2 rounded-md bg-ink-900 px-2 py-1 text-xs whitespace-nowrap text-white opacity-0 shadow-lg transition-opacity group-hover/cell:opacity-100"
      >
        {label}
      </span>
    </span>
  )
}

/** Un cuadro por formulario con fecha límite, con su número debajo. */
export function SubmissionStatusGrid({
  statuses,
}: {
  statuses: Partial<Record<FormCode, SubmissionStatusCell>>
}) {
  return (
    <div className="flex flex-wrap gap-3">
      {DEADLINE_FORMS.map((form) => (
        <div key={form.code} className="flex flex-col items-center gap-1">
          <SubmissionStatusSquare cell={statuses[form.code]} />
          <span className="text-[10px] font-medium text-ink-500">{form.label}</span>
        </div>
      ))}
    </div>
  )
}

export function SubmissionStatusLegend() {
  return (
    <div className="flex flex-wrap items-center gap-4 text-xs text-ink-500">
      <LegendItem color="bg-emerald-500" label="A tiempo" />
      <LegendItem color="bg-accent-500" label="Tarde" />
      <LegendItem color="bg-red-500" label="No entregado" />
    </div>
  )
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`size-2.5 rounded-sm ${color}`} />
      {label}
    </span>
  )
}

/** Trae el estado de entregas de un alumno. Vacío mientras no haya `studentId`. */
export function useSubmissionStatus(studentId: string | null) {
  const [statuses, setStatuses] = useState<Partial<Record<FormCode, SubmissionStatusCell>>>({})
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!studentId) {
      setStatuses({})
      setError(null)
      return
    }

    let cancelled = false
    repository
      .getSubmissionStatusForStudent(studentId)
      .then((result) => {
        if (cancelled) return
        setStatuses(result)
        setError(null)
      })
      .catch((cause: unknown) => {
        if (cancelled) return
        setStatuses({})
        setError(cause instanceof Error ? cause.message : 'Error desconocido')
      })

    return () => {
      cancelled = true
    }
  }, [studentId])

  return { statuses, error }
}
