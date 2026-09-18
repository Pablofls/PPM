import { useEffect, useMemo, useState, type ReactNode } from 'react'

export interface Column<T> {
  key: string
  header: string
  /** Ancho mínimo de la columna, p. ej. `min-w-48`. */
  width?: string
  /** Fija la columna al hacer scroll horizontal. Se usa para el nombre. */
  sticky?: boolean
  render: (row: T) => ReactNode
}

interface DataTableProps<T> {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => string
  loading?: boolean
  /** `false` mientras la base de datos no esté conectada. */
  isConnected: boolean
  /** Mensaje si la consulta falló. Se muestra en lugar del estado vacío. */
  error?: string | null
  /** Filas por página. Sin este valor la tabla muestra todo y no pagina. */
  pageSize?: number
  onRowClick?: (row: T) => void
}

/**
 * Tabla de datos del panel.
 *
 * El encabezado se mantiene visible incluso sin datos: el objetivo de esta
 * iteración es que el profesor valide las columnas, no ver contenido.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading = false,
  isConnected,
  error = null,
  pageSize,
  onRowClick,
}: DataTableProps<T>) {
  const [page, setPage] = useState(1)

  const totalPages = pageSize ? Math.max(1, Math.ceil(rows.length / pageSize)) : 1

  // Al cambiar los filtros, la página actual puede quedar fuera de rango.
  useEffect(() => {
    if (page > totalPages) setPage(1)
  }, [page, totalPages])

  const visibleRows = useMemo(() => {
    if (!pageSize) return rows
    const inicio = (page - 1) * pageSize
    return rows.slice(inicio, inicio + pageSize)
  }, [rows, page, pageSize])

  return (
    <div className="overflow-hidden rounded-xl border border-ink-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-ink-200 bg-ink-50">
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={[
                    'px-4 py-2.5 text-left text-[11px] font-semibold tracking-wider text-ink-500 uppercase whitespace-nowrap',
                    column.width ?? '',
                    column.sticky
                      ? 'sticky left-0 z-10 bg-ink-50 after:absolute after:top-0 after:right-0 after:h-full after:w-px after:bg-ink-200'
                      : '',
                  ].join(' ')}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              /*
                Filetes finos y nada de rayado: el hover es lo que mantiene al
                ojo en la fila cuando hay scroll horizontal, y con el rayado
                encima la tabla se ensucia.
              */
              <tr
                key={rowKey(row)}
                onClick={() => onRowClick?.(row)}
                className={`group border-b border-ink-100 last:border-0 ${
                  onRowClick ? 'cursor-pointer hover:bg-ink-50' : ''
                }`}
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={[
                      'px-4 py-3 align-top text-ink-700',
                      // La columna fija repite el fondo de la fila: si no, el
                      // hover se le ve por debajo.
                      column.sticky
                        ? 'sticky left-0 z-10 bg-white group-hover:bg-ink-50 after:absolute after:top-0 after:right-0 after:h-full after:w-px after:bg-ink-100'
                        : '',
                    ].join(' ')}
                  >
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/*
        El mensaje va fuera del contenedor con scroll horizontal: si viviera en
        una celda, quedaría centrado respecto al ancho total de la tabla y se
        saldría de la vista en las pantallas con muchas columnas.
      */}
      {rows.length === 0 && (
        <div className="border-t border-ink-100 px-4 py-20">
          <TableEmptyState loading={loading} isConnected={isConnected} error={error} />
        </div>
      )}
    </div>
  )
}

function TableEmptyState({
  loading,
  isConnected,
  error,
}: {
  loading: boolean
  isConnected: boolean
  error: string | null
}) {
  // El error va primero: una tabla vacía por un fallo de consulta no debe
  // leerse como "los alumnos no han respondido".
  if (error) {
    return (
      <div className="mx-auto max-w-md text-center">
        <p className="text-sm font-medium text-red-800">No se pudieron cargar los datos</p>
        <p className="mt-1 text-sm text-ink-500">{error}</p>
      </div>
    )
  }

  if (loading) {
    return <p className="text-center text-sm text-ink-500">Cargando respuestas…</p>
  }

  if (!isConnected) {
    return (
      <div className="mx-auto max-w-md text-center">
        <p className="text-base font-semibold tracking-tight text-ink-900">Fuente de datos sin conectar</p>
        <p className="mt-1 text-sm text-ink-500">Faltan las variables de entorno de Supabase.</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-md text-center">
      <p className="text-base font-semibold tracking-tight text-ink-900">Sin respuestas todavía</p>
      <p className="mt-1 text-sm text-ink-500">
        No hay respuestas que coincidan con estos filtros.
      </p>
    </div>
  )
}
