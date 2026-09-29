import { DataTable, type Column } from '../../components/DataTable'
import { FilterBar, useFilters } from '../../components/FilterBar'
import {
  SubmissionStatusLegend,
  SubmissionStatusSquare,
} from '../../components/SubmissionStatusGrid'
import { useRepositoryQuery } from '../../data/hooks'
import { repository } from '../../data/repository'
import type { SubmissionStatusRow } from '../../data/types'
import { DEADLINE_FORMS } from '../../lib/catalog'
import { formatSemester } from '../../lib/format'

const columns: Column<SubmissionStatusRow>[] = [
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
  ...DEADLINE_FORMS.map<Column<SubmissionStatusRow>>((form) => ({
    key: form.code,
    header: form.label,
    render: (row) => <SubmissionStatusSquare cell={row.statuses[form.code]} />,
  })),
  {
    key: 'resumen',
    header: 'Resumen',
    width: 'min-w-32',
    render: (row) => <Summary row={row} />,
  },
]

/**
 * Estado de Entregas — la matriz alumno × formulario.
 *
 * Compara la `marca temporal` de cada entrega (`v_submission_status`) contra
 * la fecha límite que se asignó en el Panel de Administrador. Sin entrega, se
 * pinta gris (no rojo) hasta que esa fecha pasa —o si nadie la configuró—: no
 * se penaliza al alumno por una fecha que no ha llegado o que nadie puso.
 */
export function SubmissionStatusPage() {
  const [filters, setFilter, clearFilters] = useFilters()
  const {
    data: rows,
    loading,
    error,
  } = useRepositoryQuery(() => repository.getSubmissionStatus(filters), [], [filters])

  return (
    <>
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink-950">
            Estado de Entregas
          </h1>
          <p className="mt-1.5 text-sm text-ink-500">
            Compara la marca temporal de cada entrega contra la fecha límite asignada.
          </p>
        </div>
        <SubmissionStatusLegend />
      </header>

      <FilterBar filters={filters} onChange={setFilter} onClear={clearFilters} />

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.studentId}
        loading={loading}
        isConnected={repository.isConnected}
        error={error}
      />
    </>
  )
}

/** Cuántos de los formularios de este alumno cayeron en cada estado. */
function Summary({ row }: { row: SubmissionStatusRow }) {
  let onTime = 0
  let late = 0
  let missing = 0

  for (const form of DEADLINE_FORMS) {
    const state = row.statuses[form.code]?.state ?? 'sin_fecha'
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
