import { useEffect, useMemo, useState } from 'react'

import { usePermissions } from '../../auth/PermissionsProvider'
import { Dash } from '../../components/Badge'
import { useColumnPreferences } from '../../components/ColumnPicker'
import { DataTable, type Column } from '../../components/DataTable'
import { FilterBar, useFilters } from '../../components/FilterBar'
import { Toast } from '../../components/Toast'
import type { GradeEntry } from '../../data/types'
import { formatSemester } from '../../lib/format'
import { todayMonterrey } from '../../lib/weeks'
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

/** Cómo entregó el alumno esa semana: es lo que dice el color de la celda. */
type DeliveryTone = 'missing' | 'late' | 'onTime' | 'open'

/**
 * Sin entrega, la celda solo se pinta de rojo cuando la semana ya cerró: una
 * semana en curso todavía está a tiempo.
 */
function deliveryTone(entry: GradeEntry, today: string): DeliveryTone {
  if (entry.submissionId) return entry.isLate ? 'late' : 'onTime'
  return entry.weekEnd < today ? 'missing' : 'open'
}

const TONE_CLASSES: Record<DeliveryTone, string> = {
  missing: 'border-red-200 bg-red-50',
  late: 'border-amber-200 bg-amber-50',
  onTime: 'border-emerald-200 bg-emerald-50',
  open: 'border-ink-100 bg-white',
}

const TONE_TITLES: Record<DeliveryTone, string> = {
  missing: 'No entregó',
  late: 'Entrega tardía',
  onTime: 'Entregado a tiempo',
  open: 'Semana en curso',
}

/**
 * Centro de calificaciones — el Full Grade Center de Blackboard.
 *
 * Una fila por alumno y una columna por actividad (Reporte semana N). Cada
 * celda se edita ahí mismo: Enter guarda, Tab pasa a la siguiente. «–» es
 * «sin calificar»; el color dice cómo entregó: rojo no entregó, amarillo
 * tarde, verde a tiempo. El total solo cuenta lo ya calificado, como el Total de
 * Blackboard.
 */
export function GradeCenterPage() {
  const [filters, setFilter, clearFilters] = useFilters()
  const { entries, loading, error, isConnected, save } = useGradeEntries(filters)
  const canEdit = usePermissions().can('calificaciones', 'edicion')
  const [saveError, setSaveError] = useState<string | null>(null)
  const today = todayMonterrey()

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
            tone={deliveryTone(entry, today)}
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
          El color dice cómo entregó:{' '}
          <span className="rounded border border-red-200 bg-red-50 px-1.5 text-ink-700">rojo</span> no
          entregó,{' '}
          <span className="rounded border border-amber-200 bg-amber-50 px-1.5 text-ink-700">amarillo</span>{' '}
          entregó tarde y{' '}
          <span className="rounded border border-emerald-200 bg-emerald-50 px-1.5 text-ink-700">verde</span>{' '}
          a tiempo. <span className="text-ink-400">«–»</span> es sin calificar; el total solo cuenta lo
          ya calificado.
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
  tone,
  canEdit,
  onSave,
  onError,
}: {
  entry: GradeEntry
  tone: DeliveryTone
  canEdit: boolean
  onSave: (score: number | null) => Promise<void>
  onError: (message: string) => void
}) {
  const [text, setText] = useState(formatPoints(entry.score))

  // Si la calificación cambia por otro lado (la vista de Calificar), la celda la sigue.
  useEffect(() => {
    setText(formatPoints(entry.score))
  }, [entry.score])

  const title = `${TONE_TITLES[tone]}${entry.state === 'por_calificar' ? ' · sin calificar' : ''}`

  if (!canEdit) {
    return (
      <span
        title={title}
        className={`tnum inline-block w-16 rounded-md border px-2 py-1 text-right text-sm text-ink-900 ${TONE_CLASSES[tone]}`}
      >
        {entry.score === null ? <Dash /> : formatPoints(entry.score)}
      </span>
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

  return (
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
      title={title}
      className={`tnum w-16 rounded-md border px-2 py-1 text-right text-sm text-ink-900 placeholder:text-ink-300 hover:border-ink-300 focus:border-ink-400 focus:ring-2 focus:ring-ink-900/5 focus:outline-none ${TONE_CLASSES[tone]}`}
    />
  )
}
