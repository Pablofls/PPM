import { useEffect, useState } from 'react'

import type { FormCode } from '../lib/catalog'
import { repository } from './repository'
import type { FormSummary, PanelFilters } from './types'

interface QueryResult<T> {
  data: T
  loading: boolean
  /** `false` mientras la base de datos no esté conectada. */
  isConnected: boolean
}

/**
 * Ejecuta una consulta del repositorio y expone su resultado.
 *
 * `deps` controla cuándo se vuelve a consultar; normalmente son los filtros.
 */
export function useRepositoryQuery<T>(
  query: () => Promise<T>,
  fallback: T,
  deps: unknown[],
): QueryResult<T> {
  const [data, setData] = useState<T>(fallback)
  const [loading, setLoading] = useState(repository.isConnected)

  useEffect(() => {
    let cancelled = false

    // Sin base de datos no hay nada que consultar y `data` ya vale `fallback`.
    // Volver a asignarlo provocaría un render infinito, porque las pantallas
    // pasan un `fallback` literal ([]) que es un objeto nuevo en cada render.
    if (!repository.isConnected) return

    setLoading(true)
    query().then((result) => {
      if (!cancelled) {
        setData(result)
        setLoading(false)
      }
    })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return { data, loading, isConnected: repository.isConnected }
}

export function useFormSummary(formCode: FormCode, filters: PanelFilters) {
  return useRepositoryQuery<FormSummary | null>(
    () => repository.getSummary(formCode, filters),
    null,
    [formCode, filters],
  )
}
