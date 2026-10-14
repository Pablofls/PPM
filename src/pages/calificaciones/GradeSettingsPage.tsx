import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { usePermissions } from '../../auth/PermissionsProvider'
import { DataTable, type Column } from '../../components/DataTable'
import { Toast } from '../../components/Toast'
import { useRepositoryQuery } from '../../data/hooks'
import { repository } from '../../data/repository'
import {
  DEFAULT_POINTS_POSSIBLE,
  type GradeActivityPoints,
  type SemesterWeek,
} from '../../data/types'
import { useGroups } from '../../layouts/GroupProvider'
import { formatGroupLabel, formatWeekRange } from '../../lib/format'
import { formatPoints, parseScore } from './gradeUtils'

/**
 * Configurar actividades: los puntos que vale cada reporte, por grupo.
 *
 * No todos valen 100: hay semanas de 5 puntos, de 4… Sin configurar, la
 * actividad vale 100. Cada grupo tiene los suyos (cada maestro pone los
 * de sus grupos), así que primero hay que elegir uno.
 */
export function GradeSettingsPage() {
  const group = useGroups()?.selectedGroup ?? null
  const canEdit = usePermissions().can('calificaciones', 'edicion')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saved, setSaved] = useState<Record<number, number | null>>({})

  const {
    data: allWeeks,
    loading: loadingWeeks,
    error: weeksError,
    isConnected,
  } = useRepositoryQuery(() => repository.getSemesterWeeks(), [] as SemesterWeek[], [])
  const {
    data: configured,
    loading: loadingPoints,
    error: pointsError,
  } = useRepositoryQuery(
    () => (group ? repository.getGradeActivityPoints(group.id) : Promise.resolve([])),
    [] as GradeActivityPoints[],
    [group?.id],
  )

  // Lo recién guardado se muestra sin volver a consultar.
  useEffect(() => {
    setSaved({})
  }, [configured, group?.id])

  const weeks = group ? allWeeks.filter((week) => week.periodCode === group.periodCode) : []

  const pointsOf = (weekNumber: number): number | null => {
    if (weekNumber in saved) return saved[weekNumber]
    return configured.find((item) => item.weekNumber === weekNumber)?.pointsPossible ?? null
  }

  async function savePoints(weekNumber: number, points: number | null) {
    if (!group) return
    try {
      await repository.setGradeActivityPoints(group.id, weekNumber, points)
      setSaved((current) => ({ ...current, [weekNumber]: points }))
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : 'No se pudieron guardar los puntos.')
      throw cause
    }
  }

  const columns: Column<SemesterWeek>[] = [
    {
      key: 'activity',
      header: 'Actividad',
      width: 'min-w-52',
      sticky: true,
      render: (row) => (
        <span className="font-medium text-ink-900">Reporte semana {row.weekNumber}</span>
      ),
    },
    {
      key: 'week',
      header: 'Semana del',
      render: (row) => (
        <span className="tnum text-xs text-ink-500">{formatWeekRange(row.weekStart, row.weekEnd)}</span>
      ),
    },
    {
      key: 'points',
      header: 'Puntos posibles',
      render: (row) => (
        <PointsInput
          // Si cambia el valor guardado, el campo se reinicia con él.
          key={`${group?.id}|${row.weekNumber}|${pointsOf(row.weekNumber) ?? ''}`}
          value={pointsOf(row.weekNumber)}
          canEdit={canEdit}
          onSave={(points) => savePoints(row.weekNumber, points)}
          onError={setSaveError}
        />
      ),
    },
  ]

  return (
    <>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-ink-950">Configurar actividades</h1>
        <p className="mt-1.5 text-sm text-ink-500">
          {group ? (
            <>
              Puntos que vale cada reporte en <strong className="text-ink-700">{formatGroupLabel(group)}</strong>.
              Sin configurar, vale {DEFAULT_POINTS_POSSIBLE}; deja el campo vacío para volver a ese valor.
            </>
          ) : (
            'Los puntos se configuran por grupo.'
          )}
        </p>
      </header>

      {group ? (
        <DataTable
          columns={columns}
          rows={weeks}
          rowKey={(row) => String(row.weekNumber)}
          loading={loadingWeeks || loadingPoints}
          isConnected={isConnected}
          error={weeksError ?? pointsError}
          pageSize={0}
        />
      ) : (
        <div className="rounded-xl border border-ink-200 bg-white px-6 py-16 text-center shadow-sm">
          <p className="text-sm text-ink-600">Elige un grupo para configurar sus actividades.</p>
          <Link
            to="/mis-grupos?volver=%2Fcalificaciones%2Factividades"
            className="mt-3 inline-block text-sm font-medium text-accent-700 hover:underline"
          >
            Ir a Mis grupos
          </Link>
        </div>
      )}

      {saveError && <Toast message={saveError} tone="error" onDismiss={() => setSaveError(null)} />}
    </>
  )
}

function PointsInput({
  value,
  canEdit,
  onSave,
  onError,
}: {
  value: number | null
  canEdit: boolean
  onSave: (points: number | null) => Promise<void>
  onError: (message: string) => void
}) {
  const [text, setText] = useState(formatPoints(value))

  if (!canEdit) {
    return <span className="tnum text-ink-900">{formatPoints(value ?? DEFAULT_POINTS_POSSIBLE)}</span>
  }

  async function commit() {
    const parsed = parseScore(text)
    if (Number.isNaN(parsed) || parsed === 0) {
      setText(formatPoints(value))
      onError('Escribe un número mayor que cero, por ejemplo 5.')
      return
    }
    if (parsed === value) return
    try {
      await onSave(parsed)
    } catch {
      setText(formatPoints(value))
    }
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      value={text}
      placeholder={String(DEFAULT_POINTS_POSSIBLE)}
      onChange={(event) => setText(event.target.value)}
      onBlur={() => void commit()}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur()
      }}
      aria-label="Puntos posibles"
      className="tnum w-24 rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-right text-sm text-ink-900 shadow-sm placeholder:text-ink-300 focus:border-ink-400 focus:ring-2 focus:ring-ink-900/5 focus:outline-none"
    />
  )
}
