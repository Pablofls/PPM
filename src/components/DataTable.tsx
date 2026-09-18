import type { ReactNode } from 'react'

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
  onRowClick,
}: DataTableProps<T>) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-brand-700 bg-brand-800">
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={[
                    'px-4 py-3 text-left text-xs font-semibold tracking-wide text-white uppercase whitespace-nowrap',
                    column.width ?? '',
                    column.sticky
                      ? 'sticky left-0 z-10 bg-brand-800 after:absolute after:top-0 after:right-0 after:h-full after:w-px after:bg-brand-600'
                      : '',
                  ].join(' ')}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              /*
                El rayado alterno se hace con `even:` y no con un borde por fila:
                con muchas columnas y scroll horizontal, el fondo es lo que
                mantiene al ojo en la misma fila.
              */
              <tr
                key={rowKey(row)}
                onClick={() => onRowClick?.(row)}
                className={`group border-b border-slate-100 last:border-0 even:bg-slate-50/70 ${
                  onRowClick ? 'cursor-pointer hover:bg-accent-50 even:hover:bg-accent-50' : ''
                }`}
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={[
                      'px-4 py-3 align-top text-slate-700',
                      // La columna fija repite el fondo de la fila: si no, el
                      // rayado y el hover se le ven por debajo.
                      column.sticky
                        ? 'sticky left-0 z-10 bg-white group-even:bg-slate-50 group-hover:bg-accent-50 group-even:group-hover:bg-accent-50'
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
        <div className="border-t border-slate-200 px-4 py-16">
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
        <p className="text-sm font-semibold text-red-700">No se pudieron cargar los datos</p>
        <p className="mt-1 text-sm text-slate-500">{error}</p>
      </div>
    )
  }

  if (loading) {
    return <p className="text-center text-sm text-slate-500">Cargando respuestas…</p>
  }

  if (!isConnected) {
    return (
      <div className="mx-auto max-w-md text-center">
        <p className="text-sm font-medium text-slate-700">
          Fuente de datos sin conectar
        </p>
        <p className="mt-1 text-sm text-slate-500">
          Faltan las variables de entorno de Supabase.
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-md text-center">
      <p className="text-sm font-medium text-slate-700">Sin respuestas todavía</p>
      <p className="mt-1 text-sm text-slate-500">
        No hay respuestas que coincidan con estos filtros.
      </p>
    </div>
  )
}
