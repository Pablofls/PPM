import { useState, type ReactNode } from 'react'

import { useFormSummary } from '../data/hooks'
import { repository } from '../data/repository'
import type { BaseRow } from '../data/types'
import type { FormMeta } from '../lib/catalog'
import { formatSemester, formatSessionDay } from '../lib/format'
import { Dash, LanguageBadge } from './Badge'
import { DataTable, type Column } from './DataTable'
import { FilterBar, useFilters } from './FilterBar'
import { PageHeader } from './PageHeader'
import { StudentPanel } from './StudentPanel'

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
  /** Detalle específico del formulario dentro del panel lateral. */
  renderDetail?: (row: T) => ReactNode
}

/**
 * Estructura compartida por todas las pantallas de formulario:
 * encabezado, filtros, tabla y panel del alumno.
 *
 * Cada pantalla solo aporta sus columnas y su consulta.
 */
export function FormPage<T extends BaseRow>({
  form,
  columns,
  useRows,
  filterControls,
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
      />

      <FilterBar filters={filters} onChange={setFilter} onClear={clearFilters}>
        {filterControls}
      </FilterBar>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.submissionId || row.studentId}
        loading={loading}
        isConnected={repository.isConnected}
        error={error}
        onRowClick={setSelectedRow}
      />

      <StudentPanel row={selectedRow} form={form} onClose={() => setSelectedRow(null)}>
        {renderDetail}
      </StudentPanel>
    </>
  )
}

/** Columnas del alumno, presentes al inicio de todas las pantallas. */
export function studentColumns<T extends BaseRow>(): Column<T>[] {
  return [
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
