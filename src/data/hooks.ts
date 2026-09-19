import { useEffect, useState } from 'react'

import type { FormCode } from '../lib/catalog'
import { repository } from './repository'
import type { FormSummary, PanelFilters, SyncStatus } from './types'

interface QueryResult<T> {
  data: T
  loading: boolean
  /** `false` mientras la base de datos no esté conectada. */
  isConnected: boolean
  /**
   * Mensaje de error si la consulta falló.
   *
   * Importa distinguirlo de una lista vacía: si RLS rechaza la consulta o se cae
   * la red, mostrar "no hay respuestas" haría creer al profesor que los alumnos
   * no han contestado.
   */
  error: string | null
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
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    // Sin base de datos no hay nada que consultar y `data` ya vale `fallback`.
    // Volver a asignarlo provocaría un render infinito, porque las pantallas
    // pasan un `fallback` literal ([]) que es un objeto nuevo en cada render.
    if (!repository.isConnected) return

    setLoading(true)
    setError(null)

    query()
      .then((result) => {
        if (cancelled) return
        setData(result)
        setLoading(false)
      })
      .catch((cause: unknown) => {
        if (cancelled) return
        setData(fallback)
        setError(cause instanceof Error ? cause.message : 'Error desconocido')
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return { data, loading, isConnected: repository.isConnected, error }
}

export function useFormSummary(formCode: FormCode, filters: PanelFilters) {
  return useRepositoryQuery<FormSummary | null>(
    () => repository.getSummary(formCode, filters),
    null,
    [formCode, filters],
  )
}

/**
 * La última sincronización con el Sheets.
 *
 * Se consulta una sola vez al montar: el dato cambia cada hora y no vale la
 * pena sondear la base por él. Basta con que esté fresco al abrir la pantalla.
 */
export function useLastSync() {
  return useRepositoryQuery<SyncStatus | null>(() => repository.getLastSync(), null, [])
}
