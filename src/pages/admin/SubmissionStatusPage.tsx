import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'

import { Dash } from '../../components/Badge'
import { useColumnPreferences } from '../../components/ColumnPicker'
import { DataTable, type Column } from '../../components/DataTable'
import { FilterBar, useFilters } from '../../components/FilterBar'
import {
  SubmissionStatusLegend,
  SubmissionStatusSquare,
} from '../../components/SubmissionStatusGrid'
import { ViewToggle, type ViewOption } from '../../components/ViewToggle'
import { useRepositoryQuery } from '../../data/hooks'
import { repository } from '../../data/repository'
import type {
  SubmissionState,
  SubmissionStatusCell,
  SubmissionStatusRow,
  WeeklyLogStatusCell,
} from '../../data/types'
import { DEADLINE_FORMS, type WeeklyFormCode } from '../../lib/catalog'
import { formatSemester } from '../../lib/format'

const VIEW_PARAM = 'vista'

type StatusView = 'formularios' | 'reportes'

const VIEW_OPTIONS: ViewOption<StatusView>[] = [
  { value: 'formularios', label: 'Formularios' },
  { value: 'reportes', label: 'Reportes' },
]

const studentColumns: Column<SubmissionStatusRow>[] = [
  {
    key: 'fullName',
    header: 'Nombre',
    width: 'min-w-52',
    sticky: true,
    render: (row) => <span className="font-medium text-ink-900">{row.fullName ?? '—'}</span>,
  },
  {
    key: 'degreeCode',
    header: 'Carrera',
    render: (row) => row.degreeCode ?? '—',
  },
  {
    key: 'semester',
    header: 'Sem.',
    render: (row) => formatSemester(row.semester) || '—',
  },
]

const columns: Column<SubmissionStatusRow>[] = [
  ...studentColumns,
  ...DEADLINE_FORMS.map<Column<SubmissionStatusRow>>((form) => ({
    key: form.code,
    header: form.label,
    render: (row) => <SubmissionStatusSquare cell={row.statuses[form.code]} />,
  })),
  {
    key: 'resumen',
    header: 'Resumen',
    width: 'min-w-32',
    render: (row) => (
      <Summary states={DEADLINE_FORMS.map((form) => row.statuses[form.code]?.state)} />
    ),
  },
]

/**
 * Estado de Entregas — la matriz alumno × formulario.
 *
 * Compara la `marca temporal` de cada entrega (`v_submission_status`) contra
 * la fecha límite que se asignó en el Panel de Administrador. Sin entrega, se
 * pinta gris (no rojo) hasta que esa fecha pasa —o si nadie la configuró—: no
 * se penaliza al alumno por una fecha que no ha llegado o que nadie puso.
 *
 * Con el toggle «Reportes» la matriz es alumno × semana de las bitácoras
 * (Búsqueda o Prácticas), con el mismo código de color. La vista va en la URL.
 */
export function SubmissionStatusPage() {
  const [filters, setFilter, clearFilters] = useFilters()
  const [searchParams, setSearchParams] = useSearchParams()
  const view: StatusView = searchParams.get(VIEW_PARAM) === 'reportes' ? 'reportes' : 'formularios'
  const {
    data: rows,
    loading,
    error,
  } = useRepositoryQuery(() => repository.getSubmissionStatus(filters), [], [filters])
  const { visibleColumns, picker } = useColumnPreferences('estado-entregas', columns)

  // Los alumnos salen de la consulta ya filtrada: la vista de semanas no
  // trae columnas de filtro.
  const studentIds = useMemo(() => rows.map((row) => row.studentId), [rows])
  const {
    data: weeksByStudent,
    loading: loadingWeeks,
    error: weeksError,
  } = useRepositoryQuery(
    () =>
      view === 'reportes'
        ? repository.getWeeklyLogStatus(studentIds)
        : Promise.resolve({} as Record<string, WeeklyLogStatusCell[]>),
    {} as Record<string, WeeklyLogStatusCell[]>,
    [view, studentIds.join(',')],
  )
  const weekColumns = useMemo(() => buildWeekColumns(weeksByStudent), [weeksByStudent])
  const { visibleColumns: visibleWeekColumns, picker: weekPicker } = useColumnPreferences(
    'estado-entregas-reportes',
    weekColumns,
  )
  // Memoizadas: la tabla vuelve a la página 1 cada vez que cambian las filas.
  const weekRows = useMemo<WeeklyStatusRow[]>(
    () => rows.map((row) => ({ ...row, weeks: weeksByStudent[row.studentId] ?? [] })),
    [rows, weeksByStudent],
  )
  const hasWeeks = Object.values(weeksByStudent).some((weeks) => weeks.length > 0)

  const chooseView = (next: StatusView) =>
    setSearchParams(
      (current) => {
        const params = new URLSearchParams(current)
        if (next === 'reportes') params.set(VIEW_PARAM, 'reportes')
        else params.delete(VIEW_PARAM)
        return params
      },
      { replace: true },
    )

  return (
    <>
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink-950">
            Estado de Entregas
          </h1>
          <p className="mt-1.5 text-sm text-ink-500">
            {view === 'reportes'
              ? 'Cada semana del reporte (Búsqueda o Prácticas) contra el cierre de esa semana.'
              : 'Compara la marca temporal de cada entrega contra la fecha límite asignada.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <SubmissionStatusLegend />
          <ViewToggle options={VIEW_OPTIONS} value={view} onChange={chooseView} />
        </div>
      </header>

      <FilterBar
        filters={filters}
        onChange={setFilter}
        onClear={clearFilters}
        columnPicker={view === 'reportes' ? weekPicker : picker}
      />

      {view === 'reportes' ? (
        <>
          {!loading && !loadingWeeks && !weeksError && rows.length > 0 && !hasWeeks && (
            <p className="mb-3 rounded-lg border border-ink-200 bg-white px-4 py-3 text-sm text-ink-500">
              No hay semanas configuradas para estos grupos. Se configuran en Fechas de entrega.
            </p>
          )}
          <DataTable
            columns={visibleWeekColumns}
            rows={weekRows}
            rowKey={(row) => row.studentId}
            loading={loading || loadingWeeks}
            isConnected={repository.isConnected}
            error={error ?? weeksError}
          />
        </>
      ) : (
        <DataTable
          columns={visibleColumns}
          rows={rows}
          rowKey={(row) => row.studentId}
          loading={loading}
          isConnected={repository.isConnected}
          error={error}
        />
      )}
    </>
  )
}

/** Un alumno con sus semanas, para la vista Reportes. */
type WeeklyStatusRow = SubmissionStatusRow & { weeks: WeeklyLogStatusCell[] }

/**
 * Una columna por número de semana de los grupos a la vista. Un alumno cuyo
 * grupo no tiene esa semana la ve vacía.
 */
function buildWeekColumns(
  weeksByStudent: Record<string, WeeklyLogStatusCell[]>,
): Column<WeeklyStatusRow>[] {
  const weekNumbers = [
    ...new Set(Object.values(weeksByStudent).flatMap((weeks) => weeks.map((week) => week.weekNumber))),
  ].sort((a, b) => a - b)

  return [
    ...(studentColumns as Column<WeeklyStatusRow>[]),
    {
      key: 'reporte',
      header: 'Reporte',
      render: (row) => <ReportKind row={row} />,
    },
    ...weekNumbers.map<Column<WeeklyStatusRow>>((weekNumber) => ({
      key: `semana-${weekNumber}`,
      header: `Sem. ${weekNumber}`,
      render: (row) => {
        const cell = row.weeks.find((week) => week.weekNumber === weekNumber)
        return cell ? <SubmissionStatusSquare cell={cell} /> : <Dash />
      },
    })),
    {
      key: 'resumen',
      header: 'Resumen',
      width: 'min-w-32',
      render: (row) => <Summary states={row.weeks.map((week) => week.state)} />,
    },
  ]
}

/** Búsqueda o Prácticas: la bitácora que el alumno entregó más recientemente. */
function ReportKind({ row }: { row: SubmissionStatusRow }) {
  // `v_submission_status` también trae las dos bitácoras (están en `forms`
  // desde `0011`), aunque `FormCode` no las incluya.
  const statuses = row.statuses as Partial<Record<WeeklyFormCode, SubmissionStatusCell>>
  const busqueda = statuses.form_busqueda?.submittedAt ?? null
  const practicas = statuses.form_practicas?.submittedAt ?? null
  if (!busqueda && !practicas) return <Dash />
  return (practicas ?? '') > (busqueda ?? '') ? 'Prácticas' : 'Búsqueda'
}

/** Cuántos formularios (o semanas) de este alumno cayeron en cada estado. */
function Summary({ states }: { states: (SubmissionState | undefined)[] }) {
  let onTime = 0
  let late = 0
  let missing = 0

  for (const state of states) {
    if (state === 'a_tiempo') onTime++
    else if (state === 'tarde') late++
    else if (state === 'pendiente') missing++
  }

  return (
    <div className="tnum flex items-center gap-2.5 text-xs">
      <span className="flex items-center gap-1 text-emerald-700">
        <span className="size-2 rounded-sm bg-emerald-500" />
        {onTime}
      </span>
      <span className="flex items-center gap-1 text-accent-700">
        <span className="size-2 rounded-sm bg-accent-500" />
        {late}
      </span>
      <span className="flex items-center gap-1 text-red-700">
        <span className="size-2 rounded-sm bg-red-500" />
        {missing}
      </span>
    </div>
  )
}
