import { useEffect, useMemo, useState, type ReactNode } from 'react'

import { usePermissions } from '../../auth/PermissionsProvider'
import { Dash } from '../../components/Badge'
import { useColumnPreferences } from '../../components/ColumnPicker'
import { DataTable, type Column } from '../../components/DataTable'
import { FilterBar, useFilters } from '../../components/FilterBar'
import { Toast } from '../../components/Toast'
import type { GradeEntry } from '../../data/types'
import { formatSemester } from '../../lib/format'
import { computeTotal, formatPoints, parseScore, studentLabel } from './gradeUtils'
import { useGradeEntries } from './useGradeEntries'

interface StudentRow {
  studentId: string
  fullName: string | null
  institutionalEmail: string
  degreeCode: string | null
  semester: number | null
  entries: Map<number, GradeEntry>
}

interface WeekColumn {
  weekNumber: number
  pointsPossible: number
}

/**
 * Centro de calificaciones — el Full Grade Center de Blackboard.
 *
 * Una fila por alumno y una columna por actividad (Reporte semana N). Cada
 * celda se edita ahí mismo: Enter guarda, Tab pasa a la siguiente. «–» es
 * «sin calificar»; el amarillo marca un reporte ya entregado que falta
 * calificar. El total solo cuenta lo ya calificado, como el Total de
 * Blackboard.
 */
export function GradeCenterPage() {
  const [filters, setFilter, clearFilters] = useFilters()
  const { entries, loading, error, isConnected, save } = useGradeEntries(filters)
  const canEdit = usePermissions().can('calificaciones', 'edicion')
  const [saveError, setSaveError] = useState<string | null>(null)

  const { students, weeks } = useMemo(() => {
    const byStudent = new Map<string, StudentRow>()
    const byWeek = new Map<number, WeekColumn>()
    for (const entry of entries) {
      let row = byStudent.get(entry.studentId)
      if (!row) {
        row = {
          studentId: entry.studentId,
          fullName: entry.fullName,
          institutionalEmail: entry.institutionalEmail,
          degreeCode: entry.degreeCode,
          semester: entry.semester,
          entries: new Map(),
        }
        byStudent.set(entry.studentId, row)
      }
      row.entries.set(entry.weekNumber, entry)
      if (!byWeek.has(entry.weekNumber)) {
        byWeek.set(entry.weekNumber, {
          weekNumber: entry.weekNumber,
          pointsPossible: entry.pointsPossible,
        })
      }
    }
    return {
      students: [...byStudent.values()],
      weeks: [...byWeek.values()].sort((a, b) => a.weekNumber - b.weekNumber),
    }
  }, [entries])

  const columns: Column<StudentRow>[] = [
    {
      key: 'name',
      header: 'Estudiante',
      width: 'min-w-56',
      sticky: true,
      render: (row) => (
        <div>
          <p className="font-medium text-ink-900">{studentLabel(row)}</p>
          <p className="text-xs text-ink-500">
            {[row.degreeCode, formatSemester(row.semester)].filter(Boolean).join(' · ')}
          </p>
        </div>
      ),
    },
    ...weeks.map<Column<StudentRow>>((week) => ({
      key: `week-${week.weekNumber}`,
      header: `Semana ${week.weekNumber} · ${formatPoints(week.pointsPossible)} pts`,
      render: (row) => {
        const entry = row.entries.get(week.weekNumber)
        return entry ? (
          <GradeCell
            entry={entry}
            canEdit={canEdit}
            onSave={(score) => save(entry, score, entry.comment)}
            onError={setSaveError}
          />
        ) : (
          <Dash />
        )
      },
    })),
    {
      key: 'total',
      header: 'Total',
      width: 'min-w-28',
      render: (row) => {
        const total = computeTotal([...row.entries.values()])
        return total ? (
          <span className="tnum whitespace-nowrap text-ink-900">
            {formatPoints(total.earned)} <span className="text-ink-400">/ {formatPoints(total.possible)}</span>
          </span>
        ) : (
          <Dash />
        )
      },
    },
    {
      key: 'percentage',
      header: '%',
      render: (row) => {
        const total = computeTotal([...row.entries.values()])
        return total ? (
          <span className="tnum font-semibold text-ink-900">{formatPoints(Math.round(total.percentage * 100) / 100)} %</span>
        ) : (
          <Dash />
        )
      },
    },
  ]

  const { visibleColumns, picker } = useColumnPreferences('centro-calificaciones', columns)

  return (
    <>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-ink-950">
          Centro de calificaciones
        </h1>
        <p className="mt-1.5 text-sm text-ink-500">
          {canEdit ? 'Escribe la calificación en la celda; Enter guarda. ' : ''}
          <span className="text-ink-400">«–»</span> es sin calificar y{' '}
          <span className="rounded bg-accent-100 px-1.5 text-ink-700">amarillo</span> es un reporte
          entregado que falta calificar. Un{' '}
          <span className="inline-block size-2 rounded-full bg-red-500 align-middle" /> rojo marca una
          entrega tardía. El total solo cuenta lo ya calificado.
        </p>
      </header>

      <FilterBar
        filters={filters}
        onChange={setFilter}
        onClear={clearFilters}
        columnPicker={picker}
      />

      <DataTable
        columns={visibleColumns}
        rows={students}
        rowKey={(row) => row.studentId}
        loading={loading}
        isConnected={isConnected}
        error={error}
        pageSize={0}
      />

      {saveError && <Toast message={saveError} tone="error" onDismiss={() => setSaveError(null)} />}
    </>
  )
}

/** Una celda del centro: edita la calificación de un alumno en una semana. */
function GradeCell({
  entry,
  canEdit,
  onSave,
  onError,
}: {
  entry: GradeEntry
  canEdit: boolean
  onSave: (score: number | null) => Promise<void>
  onError: (message: string) => void
}) {
  const [text, setText] = useState(formatPoints(entry.score))

  // Si la calificación cambia por otro lado (la vista de Calificar), la celda la sigue.
  useEffect(() => {
    setText(formatPoints(entry.score))
  }, [entry.score])

  if (!canEdit) {
    return (
      <LateMark late={entry.isLate}>
        {entry.score === null ? (
          <Dash />
        ) : (
          <span className="tnum text-ink-900">{formatPoints(entry.score)}</span>
        )}
      </LateMark>
    )
  }

  async function commit() {
    const parsed = parseScore(text)
    if (Number.isNaN(parsed)) {
      setText(formatPoints(entry.score))
      onError('Escribe un número, por ejemplo 4.5.')
      return
    }
    if (parsed === entry.score) return
    try {
      await onSave(parsed)
    } catch (cause) {
      setText(formatPoints(entry.score))
      onError(cause instanceof Error ? cause.message : 'No se pudo guardar la calificación.')
    }
  }

  const pending = entry.state === 'por_calificar'

  return (
    <LateMark late={entry.isLate}>
    <input
      type="text"
      inputMode="decimal"
      value={text}
      placeholder="–"
      onChange={(event) => setText(event.target.value)}
      onBlur={() => void commit()}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur()
        if (event.key === 'Escape') setText(formatPoints(entry.score))
      }}
      aria-label={`Semana ${entry.weekNumber} de ${studentLabel(entry)}`}
      title={
        pending
          ? `Entregado, sin calificar${entry.isLate ? ' · entrega tardía' : ''}`
          : entry.state === 'sin_entrega'
            ? 'No entregó'
            : entry.isLate
              ? 'Entrega tardía'
              : undefined
      }
      className={`tnum w-16 rounded-md border px-2 py-1 text-right text-sm text-ink-900 placeholder:text-ink-300 hover:border-ink-300 focus:border-ink-400 focus:ring-2 focus:ring-ink-900/5 focus:outline-none ${
        pending ? 'border-accent-300 bg-accent-100' : 'border-ink-100 bg-white'
      }`}
    />
    </LateMark>
  )
}

/** Punto rojo en la esquina de la celda cuando el reporte se entregó fuera de su semana. */
function LateMark({ late, children }: { late: boolean; children: ReactNode }) {
  if (!late) return <>{children}</>
  return (
    <span className="relative inline-block" title="Entrega tardía">
      {children}
      <span
        aria-label="Entrega tardía"
        className="absolute -top-1 -right-1 size-2.5 rounded-full bg-red-500 ring-2 ring-white"
      />
    </span>
  )
}

