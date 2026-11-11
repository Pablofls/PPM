import { useCallback, useMemo, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'

import { useRepositoryQuery } from '../data/hooks'
import { repository } from '../data/repository'
import type { BaseRow, FormRosterEntry } from '../data/types'
import type { FormMeta } from '../lib/catalog'
import { formatDateTime, formatSemester, formatSessionDay } from '../lib/format'
import { Dash, LanguageBadge } from './Badge'
import { useColumnPreferences } from './ColumnPicker'
import { DataTable, type Column } from './DataTable'
import { FilterBar, useFilters } from './FilterBar'
import { PageHeader, type FormCounts, type StatusFilter } from './PageHeader'
import { StudentDossier, useDossierParam } from './StudentDossier'

const rowKey = (row: BaseRow) => row.submissionId || row.studentId

/** Parámetro de la URL del contador activo. En español, como los demás filtros. */
const STATUS_PARAM = 'estado'
const STATUS_VALUES: StatusFilter[] = ['respondidos', 'sin_responder', 'tarde', 'a_tiempo']

/**
 * Las columnas que una fila de alumno sin responder sí sabe llenar: lo que se
 * conoce de él por el registro o el directorio. Todas las demás columnas, que
 * son respuestas del formulario, se pintan «—» sin llamar a su `render` —
 * así ninguna pantalla tiene que cuidarse de campos indefinidos.
 */
const STUDENT_KEYS = new Set([
  'fullName',
  'studentNumber',
  'institutionalEmail',
  'language',
  'sessionDay',
  'degreeCode',
  'semester',
  'periodCode',
  'submissionState',
])

interface FormPageProps<T extends BaseRow> {
  form: FormMeta
  /** Columnas de la tabla. Las pantallas componen `studentColumns()` al inicio. */
  columns: Column<T>[]
  /** Consulta al repositorio, ya filtrada. */
  useRows: (filters: ReturnType<typeof useFilters>[0]) => {
    data: T[]
    loading: boolean
    error: string | null
  }
  /** Controles extra en la barra de filtros. */
  filterControls?: ReactNode
  /**
   * `'completos'` muestra los cinco selectores compartidos.
   * `'solo-busqueda'` deja únicamente el buscador: es lo que tienen las
   * pantallas de los apéndices en la plataforma anterior.
   */
  filterMode?: 'completos' | 'solo-busqueda'
  /** Texto del buscador. */
  searchPlaceholder?: string
  /** Filas por página. Sin valor, las 80 de `DataTable`. */
  pageSize?: number
  /** Oculta el botón "Procesar datos", que los apéndices no tienen. */
  hideProcessAction?: boolean
  /** Detalle específico del formulario dentro del expediente del alumno. */
  renderDetail?: (row: T) => ReactNode
}

/**
 * Estructura compartida por todas las pantallas de formulario:
 * encabezado, filtros, tabla y expediente del alumno.
 *
 * Cada pantalla solo aporta sus columnas y su consulta.
 */
export function FormPage<T extends BaseRow>({
  form,
  columns,
  useRows,
  filterControls,
  filterMode = 'completos',
  searchPlaceholder,
  pageSize,
  hideProcessAction = false,
  renderDetail,
}: FormPageProps<T>) {
  const [filters, setFilter, clearFilters] = useFilters()
  const [status, setStatus] = useStatusFilter()
  const { data: answered, loading: rowsLoading, error: rowsError } = useRows(filters)
  const {
    data: roster,
    loading: rosterLoading,
    error: rosterError,
  } = useRepositoryQuery<FormRosterEntry[]>(
    () => repository.getFormRoster(form.code, filters, filterMode),
    [],
    [form.code, filters, filterMode],
    'formRoster',
  )
  const loading = rowsLoading || rosterLoading
  const error = rowsError ?? rosterError

  const allRows = useMemo(() => mergeRoster(answered, roster), [answered, roster])
  const counts = useMemo(() => (loading ? null : countRows(allRows, roster)), [loading, allRows, roster])
  const rows = useMemo(
    () => (status ? allRows.filter((row) => matchesStatus(row, status)) : allRows),
    [allRows, status],
  )

  const { visibleColumns, picker } = useColumnPreferences(form.code, columns)
  const tableColumns = useMemo(() => visibleColumns.map(missingAware), [visibleColumns])
  const dossier = useDossierParam(rows, rowKey, loading)

  if (dossier.selected) {
    return (
      <StudentDossier
        row={dossier.selected}
        trail={[`Módulo ${form.moduleCode}`, `${form.label} ${form.name}`]}
        onClose={dossier.close}
        index={dossier.index}
        total={dossier.total}
        onPrev={dossier.onPrev}
        onNext={dossier.onNext}
      >
        {(row) =>
          row.missing ? (
            <p className="text-sm text-red-800">Todavía no responde este formulario.</p>
          ) : (
            renderDetail?.(row)
          )
        }
      </StudentDossier>
    )
  }

  return (
    <>
      <PageHeader
        label={form.label}
        title={form.name}
        subtitle={form.subtitle}
        counts={counts}
        activeStatus={status}
        onStatusChange={setStatus}
        isConnected={repository.isConnected}
        hideProcessAction={hideProcessAction}
      />

      <FilterBar
        filters={filters}
        onChange={setFilter}
        onClear={clearFilters}
        mode={filterMode}
        searchPlaceholder={searchPlaceholder}
        columnPicker={picker}
        extraActive={status !== null}
      >
        {filterControls}
      </FilterBar>

      <DataTable
        columns={tableColumns}
        rows={rows}
        rowKey={rowKey}
        loading={loading}
        isConnected={repository.isConnected}
        error={error}
        pageSize={pageSize}
        onRowClick={dossier.open}
        rowAlert={(row) => row.missing === true}
      />
    </>
  )
}

/** El contador activo, leído y escrito en `?estado=` (se comparte con la URL). */
function useStatusFilter(): [StatusFilter | null, (status: StatusFilter | null) => void] {
  const [searchParams, setSearchParams] = useSearchParams()
  const raw = searchParams.get(STATUS_PARAM)
  const status = STATUS_VALUES.includes(raw as StatusFilter) ? (raw as StatusFilter) : null

  const setStatus = useCallback(
    (next: StatusFilter | null) =>
      setSearchParams(
        (current) => {
          const params = new URLSearchParams(current)
          if (next) params.set(STATUS_PARAM, next)
          else params.delete(STATUS_PARAM)
          return params
        },
        { replace: true },
      ),
    [setSearchParams],
  )

  return [status, setStatus]
}

/**
 * Las respuestas del formulario más una fila por cada alumno del alcance que
 * todavía no responde. A las respuestas se les pone el estado de entrega
 * (a tiempo / tarde) que calcula la base contra la fecha límite del grupo.
 */
function mergeRoster<T extends BaseRow>(answered: T[], roster: FormRosterEntry[]): T[] {
  const byStudent = new Map(roster.map((entry) => [entry.studentId, entry]))
  const answeredIds = new Set(answered.map((row) => row.studentId))

  const rows: T[] = answered.map((row) => {
    const entry = byStudent.get(row.studentId)
    return entry ? { ...row, submissionState: entry.state } : row
  })

  for (const entry of roster) {
    // Si la base dice que sí entregó pero su fila no vino (en el 1.0 los
    // filtros leen el período del formulario y no el del grupo), no es un
    // faltante: no se inventa.
    if (answeredIds.has(entry.studentId) || entry.submittedAt) continue
    // Solo lleva los campos del alumno: `missingAware` evita que las columnas
    // del formulario lean el resto.
    rows.push({
      studentId: entry.studentId,
      institutionalEmail: entry.institutionalEmail,
      fullName: entry.fullName,
      studentNumber: entry.studentNumber,
      language: entry.language,
      sessionDay: entry.sessionDay,
      degreeCode: entry.degreeCode,
      semester: entry.semester,
      periodCode: entry.periodCode,
      submissionId: '',
      submittedAt: null,
      submissionState: entry.state,
      missing: true,
    } as unknown as T)
  }

  // El mismo orden de la consulta: por nombre. Sin nombre (no ha contestado el
  // 1.0), por correo.
  return rows.sort((a, b) =>
    (a.fullName ?? a.institutionalEmail).localeCompare(b.fullName ?? b.institutionalEmail, 'es', {
      sensitivity: 'base',
    }),
  )
}

/**
 * Los contadores, sobre todas las filas (antes del filtro por estado: si no,
 * activar uno dejaría los demás en cero). «Tarde» y «A tiempo» solo tienen
 * sentido si alguien del alcance tiene fecha límite; si no, quedan en «—».
 */
function countRows(rows: BaseRow[], roster: FormRosterEntry[]): FormCounts {
  const hasDeadline = roster.some((entry) => entry.dueAt !== null)
  const count = (status: StatusFilter) => rows.filter((row) => matchesStatus(row, status)).length
  return {
    responses: count('respondidos'),
    pending: count('sin_responder'),
    late: hasDeadline ? count('tarde') : null,
    onTime: hasDeadline ? count('a_tiempo') : null,
  }
}

function matchesStatus(row: BaseRow, status: StatusFilter): boolean {
  switch (status) {
    case 'respondidos':
      return !row.missing
    case 'sin_responder':
      return row.missing === true
    case 'tarde':
      return !row.missing && row.submissionState === 'tarde'
    case 'a_tiempo':
      return !row.missing && row.submissionState === 'a_tiempo'
  }
}

/**
 * Adapta una columna a las filas de alumnos sin responder: las columnas del
 * alumno se pintan igual, el nombre lleva la marca «Sin responder» (con el
 * correo si todavía no hay nombre) y el resto queda en «—».
 */
function missingAware<T extends BaseRow>(column: Column<T>): Column<T> {
  return {
    ...column,
    render: (row) => {
      if (!row.missing) return column.render(row)
      if (column.key === 'fullName') return <MissingName row={row} />
      return STUDENT_KEYS.has(column.key) ? column.render(row) : <Dash />
    },
  }
}

function MissingName({ row }: { row: BaseRow }) {
  return (
    <span className="flex items-center gap-2">
      {row.fullName ? (
        <span className="font-medium text-ink-900">{row.fullName}</span>
      ) : (
        // Sin 1.0 no hay nombre; el correo es lo que lo identifica (los
        // apéndices ni siquiera tienen columna de correo).
        <span className="block max-w-44 truncate text-ink-600" title={row.institutionalEmail}>
          {row.institutionalEmail}
        </span>
      )}
      <span className="shrink-0 rounded-md bg-red-100 px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap text-red-800">
        Sin responder
      </span>
    </span>
  )
}

/**
 * Columnas del alumno, presentes al inicio de todas las pantallas.
 *
 * `omitEmail` deja fuera el correo institucional: las pantallas de los apéndices
 * no lo muestran, porque ahí la columna que identifica el registro es la empresa.
 */
export function studentColumns<T extends BaseRow>(
  { omitEmail = false }: { omitEmail?: boolean } = {},
): Column<T>[] {
  const columnas: Column<T>[] = [
    {
      key: 'fullName',
      header: 'Nombre',
      width: 'min-w-52',
      sticky: true,
      render: (row) =>
        row.fullName ? (
          <span className="font-medium text-ink-900">{row.fullName}</span>
        ) : (
          <Dash />
        ),
    },
    {
      key: 'institutionalEmail',
      header: 'Correo Institucional',
      width: 'min-w-56',
      render: (row) => (
        <span className="block max-w-56 truncate" title={row.institutionalEmail}>
          {row.institutionalEmail}
        </span>
      ),
    },
    {
      key: 'language',
      header: 'Idioma',
      render: (row) => <LanguageBadge value={row.language} />,
    },
  ]

  return omitEmail
    ? columnas.filter((columna) => columna.key !== 'institutionalEmail')
    : columnas
}

/** Columnas de contexto académico, al final de las pantallas que no son 1.0. */
export function academicColumns<T extends BaseRow>(): Column<T>[] {
  return [
    {
      key: 'sessionDay',
      header: 'Frecuencia',
      render: (row) => formatSessionDay(row.sessionDay) || <Dash />,
    },
    {
      key: 'degreeCode',
      header: 'Carrera',
      render: (row) => row.degreeCode ?? <Dash />,
    },
    {
      key: 'semester',
      header: 'Semestre',
      render: (row) => formatSemester(row.semester) || <Dash />,
    },
    {
      key: 'periodCode',
      header: 'Período',
      render: (row) => row.periodCode ?? <Dash />,
    },
  ]
}

/** Marca temporal de la entrega. Va al fondo de todas las pantallas de formulario. */
export function submittedAtColumn<T extends BaseRow>(): Column<T>[] {
  return [
    {
      key: 'submittedAt',
      header: 'Fecha de Entrega',
      width: 'min-w-40',
      render: (row) => formatDateTime(row.submittedAt) || <Dash />,
    },
  ]
}
