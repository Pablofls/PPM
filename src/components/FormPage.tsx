import { useState, type ReactNode } from 'react'

import { useFormSummary } from '../data/hooks'
import { repository } from '../data/repository'
import type { BaseRow } from '../data/types'
import type { FormMeta } from '../lib/catalog'
import { formatDateTime, formatSemester, formatSessionDay } from '../lib/format'
import { Dash, LanguageBadge } from './Badge'
import { DataTable, type Column } from './DataTable'
import { FilterBar, useFilters } from './FilterBar'
import { PageHeader } from './PageHeader'
import { StudentDossier } from './StudentDossier'

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
  const { data: rows, loading, error } = useRows(filters)
  const { data: summary } = useFormSummary(form.code, filters)
  const [selectedRow, setSelectedRow] = useState<T | null>(null)

  return (
    <>
      <PageHeader
        label={form.label}
        title={form.name}
        subtitle={form.subtitle}
        summary={summary}
        isConnected={repository.isConnected}
        hideProcessAction={hideProcessAction}
      />

      <FilterBar
        filters={filters}
        onChange={setFilter}
        onClear={clearFilters}
        mode={filterMode}
        searchPlaceholder={searchPlaceholder}
      >
        {filterControls}
      </FilterBar>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.submissionId || row.studentId}
        loading={loading}
        isConnected={repository.isConnected}
        error={error}
        pageSize={pageSize}
        onRowClick={setSelectedRow}
      />

      <StudentDossier row={selectedRow} form={form} onClose={() => setSelectedRow(null)}>
        {renderDetail}
      </StudentDossier>
    </>
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
