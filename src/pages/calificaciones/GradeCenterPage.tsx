import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { usePermissions } from '../../auth/PermissionsProvider'
import { Dash } from '../../components/Badge'
import { useColumnPreferences } from '../../components/ColumnPicker'
import { DataTable, type Column } from '../../components/DataTable'
import { FilterBar, useFilters } from '../../components/FilterBar'
import { StudentDossier, useDossierParam } from '../../components/StudentDossier'
import { Toast } from '../../components/Toast'
import { ViewToggle, type ViewOption } from '../../components/ViewToggle'
import type { ActivityGradeEntry, GradeEntry } from '../../data/types'
import { activityTitle } from '../../lib/catalog'
import { formatSemester } from '../../lib/format'
import { todayMonterrey } from '../../lib/weeks'
import { computeTotal, formatPoints, parseScore, studentLabel } from './gradeUtils'
import { useActivityGradeEntries } from './useActivityGradeEntries'
import { useGradeEntries } from './useGradeEntries'

const VIEW_PARAM = 'vista'

/** Igual que Estado de Entregas: los formularios de la plataforma o los reportes semanales. */
type GradeView = 'formularios' | 'reportes'

const VIEW_OPTIONS: ViewOption<GradeView>[] = [
  { value: 'formularios', label: 'Formularios' },
  { value: 'reportes', label: 'Reportes' },
]

interface StudentRow {
  studentId: string
  fullName: string | null
  institutionalEmail: string
  degreeCode: string | null
  semester: number | null
  entries: Map<number, GradeEntry>
  /** Las actividades que no son bitácora (`0053`), por código de formulario. */
  activities: Map<string, ActivityGradeEntry>
}

interface WeekColumn {
  weekNumber: number
  pointsPossible: number
}

interface ActivityColumn {
  formCode: string
  displayOrder: number
  /** «1.0 Datos Demográficos». */
  title: string
  /** `null` si los grupos a la vista le dan puntos distintos. */
  pointsPossible: number | null
}

/** Lo que una celda necesita de una calificación, sea de semana o de actividad. */
type CellEntry = Pick<GradeEntry, 'score' | 'state' | 'fullName' | 'institutionalEmail'>

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

/** En una actividad, rojo solo cuando su fecha de entrega ya pasó. */
function activityTone(entry: ActivityGradeEntry, now: Date): DeliveryTone {
  if (entry.submissionId) return entry.isLate ? 'late' : 'onTime'
  return entry.dueAt && new Date(entry.dueAt) < now ? 'missing' : 'open'
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
  open: 'Todavía a tiempo',
}

/**
 * Centro de calificaciones — el Full Grade Center de Blackboard.
 *
 * Una fila por alumno y una columna por actividad: Reporte semana N y, después,
 * las actividades que se contestan en la plataforma (el 1.0, `0053`). Cada
 * celda se edita ahí mismo: Enter guarda, Tab pasa a la siguiente. «–» es
 * «sin calificar»; el color dice cómo entregó: rojo no entregó, amarillo
 * tarde, verde a tiempo. El total solo cuenta lo ya calificado, como el Total de
 * Blackboard.
 *
 * El switch Formularios / Reportes (como en Estado de Entregas, `?vista=`)
 * elige qué columnas se ven; el Total y el % son siempre de todo lo
 * calificado, de las dos vistas.
 */
export function GradeCenterPage() {
  const [filters, setFilter, clearFilters] = useFilters()
  const [searchParams, setSearchParams] = useSearchParams()
  const view: GradeView = searchParams.get(VIEW_PARAM) === 'reportes' ? 'reportes' : 'formularios'
  const chooseView = (next: GradeView) =>
    setSearchParams(
      (current) => {
        const params = new URLSearchParams(current)
        if (next === 'reportes') params.set(VIEW_PARAM, 'reportes')
        else params.delete(VIEW_PARAM)
        return params
      },
      { replace: true },
    )
  const { entries, loading, error, isConnected, save } = useGradeEntries(filters)
  const activityGrades = useActivityGradeEntries(filters)
  const canEdit = usePermissions().can('calificaciones', 'edicion')
  const [saveError, setSaveError] = useState<string | null>(null)
  const today = todayMonterrey()

  const now = new Date()

  const { students, weeks, activities } = useMemo(() => {
    const byStudent = new Map<string, StudentRow>()
    const byWeek = new Map<number, WeekColumn>()
    const byActivity = new Map<string, ActivityColumn>()
    const rowOf = (entry: GradeEntry | ActivityGradeEntry) => {
      let row = byStudent.get(entry.studentId)
      if (!row) {
        row = {
          studentId: entry.studentId,
          fullName: entry.fullName,
          institutionalEmail: entry.institutionalEmail,
          degreeCode: entry.degreeCode,
          semester: entry.semester,
          entries: new Map(),
          activities: new Map(),
        }
        byStudent.set(entry.studentId, row)
      }
      return row
    }
    for (const entry of activityGrades.entries) {
      rowOf(entry).activities.set(entry.formCode, entry)
      const column = byActivity.get(entry.formCode)
      if (!column) {
        byActivity.set(entry.formCode, {
          formCode: entry.formCode,
          displayOrder: entry.displayOrder,
          title: activityTitle(entry.formCode),
          pointsPossible: entry.pointsPossible,
        })
      } else if (column.pointsPossible !== entry.pointsPossible) {
        column.pointsPossible = null
      }
    }
    for (const entry of entries) {
      const row = rowOf(entry)
      row.entries.set(entry.weekNumber, entry)
      if (!byWeek.has(entry.weekNumber)) {
        byWeek.set(entry.weekNumber, {
          weekNumber: entry.weekNumber,
          pointsPossible: entry.pointsPossible,
        })
      }
    }
    return {
      students: [...byStudent.values()].sort((a, b) =>
        studentLabel(a).localeCompare(studentLabel(b), 'es'),
      ),
      weeks: [...byWeek.values()].sort((a, b) => a.weekNumber - b.weekNumber),
      activities: [...byActivity.values()].sort((a, b) => a.displayOrder - b.displayOrder),
    }
  }, [entries, activityGrades.entries])

  const totalOf = (row: StudentRow) =>
    computeTotal([...row.entries.values(), ...row.activities.values()])

  const dossier = useDossierParam(students, (row) => row.studentId, loading)

  const columns: Column<StudentRow>[] = [
    {
      key: 'name',
      header: 'Estudiante',
      width: 'min-w-56',
      sticky: true,
      // Solo la celda del nombre abre el expediente: las demás se editan con clic.
      onClick: dossier.open,
      render: (row) => (
        <div>
          <p className="font-medium text-ink-900">{studentLabel(row)}</p>
          <p className="text-xs text-ink-500">
            {[row.degreeCode, formatSemester(row.semester)].filter(Boolean).join(' · ')}
          </p>
        </div>
      ),
    },
    ...(view === 'reportes' ? weeks : []).map<Column<StudentRow>>((week) => ({
      key: `week-${week.weekNumber}`,
      header: `Semana ${week.weekNumber} · ${formatPoints(week.pointsPossible)} pts`,
      render: (row) => {
        const entry = row.entries.get(week.weekNumber)
        return entry ? (
          <GradeCell
            entry={entry}
            label={`Semana ${entry.weekNumber}`}
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
    ...(view === 'formularios' ? activities : []).map<Column<StudentRow>>((activity) => ({
      key: `activity-${activity.formCode}`,
      header:
        activity.pointsPossible === null
          ? activity.title
          : `${activity.title} · ${formatPoints(activity.pointsPossible)} pts`,
      render: (row) => {
        const entry = row.activities.get(activity.formCode)
        return entry ? (
          <GradeCell
            entry={entry}
            label={activity.title}
            tone={activityTone(entry, now)}
            canEdit={canEdit}
            onSave={(score) => activityGrades.save(entry, score, entry.comment)}
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
        const total = totalOf(row)
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
        const total = totalOf(row)
        return total ? (
          <span className="tnum font-semibold text-ink-900">{formatPoints(Math.round(total.percentage * 100) / 100)} %</span>
        ) : (
          <Dash />
        )
      },
    },
  ]

  const { visibleColumns, picker } = useColumnPreferences(
    view === 'reportes' ? 'centro-calificaciones' : 'centro-calificaciones-formularios',
    columns,
  )

  if (dossier.selected) {
    return (
      <StudentDossier
        row={dossier.selected}
        trail={['Calificaciones', 'Centro de calificaciones']}
        onClose={dossier.close}
        index={dossier.index}
        total={dossier.total}
        onPrev={dossier.onPrev}
        onNext={dossier.onNext}
      />
    )
  }

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
          a tiempo. <span className="text-ink-400">«–»</span> es sin calificar; el total suma
          formularios y reportes, y solo cuenta lo ya calificado.
        </p>
      </header>

      <FilterBar
        filters={filters}
        onChange={setFilter}
        onClear={clearFilters}
        viewToggle={<ViewToggle options={VIEW_OPTIONS} value={view} onChange={chooseView} />}
        columnPicker={picker}
      />

      {view === 'formularios' && !activityGrades.loading && !activityGrades.error && activities.length === 0 && (
        <p className="mb-4 rounded-xl border border-ink-200 bg-white px-4 py-3 text-sm text-ink-600 shadow-sm">
          Todavía no hay formularios de la plataforma publicados en este grupo (hoy, el 1.0 Datos
          Demográficos). Se publican en Actividades.
        </p>
      )}

      <DataTable
        columns={visibleColumns}
        rows={students}
        rowKey={(row) => row.studentId}
        loading={loading || activityGrades.loading}
        isConnected={isConnected}
        error={error ?? activityGrades.error}
        pageSize={0}
      />

      {saveError && <Toast message={saveError} tone="error" onDismiss={() => setSaveError(null)} />}
    </>
  )
}

/** Una celda del centro: edita la calificación de un alumno en una semana o una actividad. */
function GradeCell({
  entry,
  label,
  tone,
  canEdit,
  onSave,
  onError,
}: {
  entry: CellEntry
  /** «Semana 3», «1.0 Datos Demográficos»: para el lector de pantalla. */
  label: string
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
      aria-label={`${label} de ${studentLabel(entry)}`}
      title={title}
      className={`tnum w-16 rounded-md border px-2 py-1 text-right text-sm text-ink-900 placeholder:text-ink-300 hover:border-ink-300 focus:border-ink-400 focus:ring-2 focus:ring-ink-900/5 focus:outline-none ${TONE_CLASSES[tone]}`}
    />
  )
}
