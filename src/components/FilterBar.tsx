import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'

import {
  DEGREE_OPTIONS,
  LANGUAGE_OPTIONS,
  PERIOD_OPTIONS,
  SEMESTER_OPTIONS,
  SESSION_DAY_OPTIONS,
  type FilterOption,
} from '../lib/catalog'
import type { PanelFilters } from '../data/types'

/** Nombres de los parámetros en la URL. En español: el profesor los ve y los comparte. */
const PARAM_NAMES: Record<keyof PanelFilters, string> = {
  search: 'buscar',
  language: 'idioma',
  sessionDay: 'frecuencia',
  degree: 'carrera',
  semester: 'semestre',
  period: 'periodo',
}

/**
 * Los filtros viven en la URL para que el profesor pueda guardar o compartir una
 * vista filtrada. Son los mismos en todas las pantallas.
 */
export function useFilters(): [PanelFilters, (key: keyof PanelFilters, value: string) => void, () => void] {
  const [searchParams, setSearchParams] = useSearchParams()
  const queryString = searchParams.toString()

  // La identidad del objeto tiene que ser estable: es una dependencia de las
  // consultas al repositorio, y recrearlo en cada render provocaría un bucle.
  const filters = useMemo<PanelFilters>(() => {
    const params = new URLSearchParams(queryString)
    return {
      search: params.get('buscar') ?? '',
      language: params.get('idioma') ?? '',
      sessionDay: params.get('frecuencia') ?? '',
      degree: params.get('carrera') ?? '',
      semester: params.get('semestre') ?? '',
      period: params.get('periodo') ?? '',
    }
  }, [queryString])

  // Forma funcional: parte siempre de los parámetros vigentes, no de los que
  // había al renderizar. Sin esto, dos filtros cambiados en el mismo ciclo de
  // React se pisan y solo se aplica el último.
  const setFilter = useCallback(
    (key: keyof PanelFilters, value: string) => {
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current)
          if (value) {
            next.set(PARAM_NAMES[key], value)
          } else {
            next.delete(PARAM_NAMES[key])
          }
          return next
        },
        { replace: true },
      )
    },
    [setSearchParams],
  )

  const clearFilters = useCallback(
    () => setSearchParams(new URLSearchParams(), { replace: true }),
    [setSearchParams],
  )

  return [filters, setFilter, clearFilters]
}

interface FilterBarProps {
  filters: PanelFilters
  onChange: (key: keyof PanelFilters, value: string) => void
  onClear: () => void
  /** Controles adicionales de una pantalla específica, p. ej. el grupo de habilidades. */
  children?: React.ReactNode
}

export function FilterBar({ filters, onChange, onClear, children }: FilterBarProps) {
  const hasActiveFilters = Object.values(filters).some(Boolean)

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className="relative">
        <input
          type="search"
          value={filters.search}
          onChange={(event) => onChange('search', event.target.value)}
          placeholder="Buscar por correo institucional…"
          className="w-72 rounded-lg border border-slate-300 bg-white py-2 pr-3 pl-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none"
        />
      </div>

      <Select
        label="Idioma"
        value={filters.language}
        options={LANGUAGE_OPTIONS}
        onChange={(value) => onChange('language', value)}
      />
      <Select
        label="Frecuencia"
        value={filters.sessionDay}
        options={SESSION_DAY_OPTIONS}
        onChange={(value) => onChange('sessionDay', value)}
      />
      <Select
        label="Carrera"
        value={filters.degree}
        options={DEGREE_OPTIONS}
        onChange={(value) => onChange('degree', value)}
      />
      <Select
        label="Semestre"
        value={filters.semester}
        options={SEMESTER_OPTIONS}
        onChange={(value) => onChange('semester', value)}
      />
      <Select
        label="Período"
        value={filters.period}
        options={PERIOD_OPTIONS}
        onChange={(value) => onChange('period', value)}
      />

      {children}

      {hasActiveFilters && (
        <button
          type="button"
          onClick={onClear}
          className="ml-1 rounded-lg px-2 py-1 text-sm font-medium text-brand-700 hover:bg-brand-50"
        >
          Limpiar
        </button>
      )}
    </div>
  )
}

export function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: FilterOption[]
  onChange: (value: string) => void
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={`rounded-lg border px-3 py-2 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none ${
        value
          ? 'border-brand-200 bg-brand-50 font-medium text-brand-800'
          : 'border-slate-300 bg-white text-slate-500'
      }`}
    >
      <option value="">{label}</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  )
}
