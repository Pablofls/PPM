import { useEffect, useRef } from 'react'

import { useRepositoryQuery } from '../data/hooks'
import { repository } from '../data/repository'
import type { SubmissionState, SubmissionStatusCell, WeeklyLogStatusCell } from '../data/types'
import { DEADLINE_FORMS, type FormCode } from '../lib/catalog'
import { formatDateTime } from '../lib/format'
import { useT } from '../lib/i18n'

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
export function SubmissionStatusSquare({
  cell,
  highlight = false,
}: {
  cell: SubmissionStatusCell | undefined
  /** Anillo alrededor del cuadro: la semana que le toca entregar al alumno. */
  highlight?: boolean
}) {
  const t = useT()
  const state = cell?.state ?? 'sin_fecha'
  const label = cell?.submittedAt
    ? t(
        `${state === 'tarde' ? 'Entrega tardía · e' : 'E'}ntregado: ${formatDateTime(cell.submittedAt)}`,
        `${state === 'tarde' ? 'Late · s' : 'S'}ubmitted: ${formatDateTime(cell.submittedAt, 'en')}`,
      )
    : state === 'pendiente'
      ? t('No entregado', 'Not submitted')
      : cell?.dueAt
        ? t(`Todavía no vence: ${formatDateTime(cell.dueAt)}`, `Not due yet: ${formatDateTime(cell.dueAt, 'en')}`)
        : t('Sin fecha límite configurada', 'No deadline set')

  return (
    <span className="group/cell relative inline-block">
      <span
        className={`inline-block size-5 rounded-sm ${SUBMISSION_STATE_COLOR[state]} ${
          highlight ? 'ring-2 ring-ink-900 ring-offset-2' : ''
        }`}
      />
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

/**
 * La misma matriz que `SubmissionStatusGrid`, pero un cuadro por semana
 * configurada en vez de por formulario: el alumno reporta una sola bitácora
 * por semana (Búsqueda o Prácticas, nunca las dos), así que no hay una
 * columna por formulario que mostrar — una por semana ya dice si esa semana
 * quedó reportada. Mismo componente de cuadro y el mismo color.
 */
export function WeeklyLogStatusGrid({
  weeks,
  highlightWeek,
}: {
  weeks: WeeklyLogStatusCell[]
  /** Número de la semana que le toca entregar (solo en el portal del alumno). */
  highlightWeek?: number
}) {
  const t = useT()
  if (!weeks.length) {
    return (
      <p className="text-sm text-ink-500">
        {t('El profesor no ha configurado tus semanas.', 'Your professor has not set up your weeks yet.')}
      </p>
    )
  }

  return (
    <div className="flex flex-wrap gap-3">
      {weeks.map((week) => (
        <div key={week.weekNumber} className="flex flex-col items-center gap-1">
          <SubmissionStatusSquare cell={week} highlight={week.weekNumber === highlightWeek} />
          <span className="text-[10px] font-medium text-ink-500">{week.weekNumber}</span>
        </div>
      ))}
    </div>
  )
}

export function SubmissionStatusLegend() {
  return (
    <div className="flex flex-wrap items-center gap-4 text-xs text-ink-500">
      <LegendItem color="bg-emerald-500" label="A tiempo" />
      <LegendItem color="bg-accent-500" label="Entrega tardía" />
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
  const { data: statuses, error } = useRepositoryQuery<Partial<Record<FormCode, SubmissionStatusCell>>>(
    () => (studentId ? repository.getSubmissionStatusForStudent(studentId) : Promise.resolve({})),
    {},
    [studentId],
    'submissionStatus',
  )
  return { statuses, error }
}

/**
 * Igual que `useSubmissionStatus`, pero para la matriz de semanas.
 * `refreshKey` fuerza una nueva consulta sin depender de `studentId`: lo usa
 * la corrección de semana del expediente.
 */
export function useWeeklyLogStatus(studentId: string | null, refreshKey = 0) {
  const { data, loading, error, refetch } = useRepositoryQuery(
    () =>
      studentId
        ? repository.getWeeklyLogStatusForStudent(studentId)
        : Promise.resolve([] as WeeklyLogStatusCell[]),
    [] as WeeklyLogStatusCell[],
    [studentId],
    'weeklyLogStatus',
  )

  // `refreshKey` pide una recarga sin soltar lo que ya se ve.
  const lastRefresh = useRef(refreshKey)
  useEffect(() => {
    if (lastRefresh.current === refreshKey) return
    lastRefresh.current = refreshKey
    refetch()
  }, [refreshKey, refetch])

  return { weeks: data, error, loaded: studentId !== null && !loading }
}
