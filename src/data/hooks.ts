import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'

import type { FormCode, WeeklyFormCode } from '../lib/catalog'
import { repository } from './repository'
import { fetchEntry, getEntry, setSnapshot, stableStringify } from './queryCache'
import type {
  FormSummary,
  InternshipLogRow,
  JobSearchLogRow,
  PanelFilters,
  SyncStatus,
} from './types'

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
  /**
   * Reemplaza el dato en el caché sin volver a consultar, para reflejar una
   * escritura que ya se guardó (p. ej. una calificación).
   */
  mutate: (update: (current: T) => T) => void
  /**
   * Vuelve a consultar sin soltar el dato que ya se ve: la pantalla se
   * actualiza en silencio, sin «Cargando…».
   */
  refetch: () => void
}

/**
 * Calienta el caché de una consulta antes de que la pantalla la pida; por
 * ejemplo, al pasar el cursor sobre su liga del menú. Con la misma `key` y
 * `deps` que usará el hook.
 */
export function prefetchQuery<T>(key: string, query: () => Promise<T>, deps: unknown[]) {
  if (!repository.isConnected) return
  const entry = getEntry(`${key}${stableStringify(deps)}`)
  if (entry.snapshot.hasData || entry.inFlight) return
  void fetchEntry(entry, query)
}

/** `true` si algún filtro avisa que todavía no se sabe qué grupos ve la vista. */
function waitingForScope(deps: unknown[]): boolean {
  return deps.some(
    (dep) =>
      typeof dep === 'object' &&
      dep !== null &&
      (dep as Partial<PanelFilters>).scopeLoading === true,
  )
}

/**
 * Ejecuta una consulta del repositorio y expone su resultado.
 *
 * `deps` controla cuándo se vuelve a consultar; normalmente son los filtros.
 * La consulta se identifica por `key` (por omisión, el texto de la función) y
 * `deps`: dos pantallas que piden lo mismo comparten el resultado.
 */
export function useRepositoryQuery<T>(
  query: () => Promise<T>,
  fallback: T,
  deps: unknown[],
  key: string = query.toString(),
): QueryResult<T> {
  const fullKey = `${key}${stableStringify(deps)}`
  const entry = getEntry(fullKey)
  const waiting = waitingForScope(deps)

  const subscribe = useCallback(
    (listener: () => void) => {
      entry.listeners.add(listener)
      return () => {
        entry.listeners.delete(listener)
      }
    },
    [entry],
  )
  const snapshot = useSyncExternalStore(subscribe, () => entry.snapshot)

  useEffect(() => {
    // Sin base de datos no hay nada que consultar: `data` vale `fallback`.
    if (!repository.isConnected || waiting) return
    void fetchEntry(entry, query)
    // `entry` cambia con la clave —y cuando una escritura vacía el caché—, que
    // es justo cuándo hay que volver a consultar; `query` es una función nueva
    // en cada render y no debe disparar nada.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry, waiting])

  // La función de la consulta cambia en cada render; `refetch` usa la última.
  const queryRef = useRef(query)
  useEffect(() => {
    queryRef.current = query
  })
  const refetch = useCallback(() => {
    if (repository.isConnected && !waiting) void fetchEntry(entry, () => queryRef.current())
  }, [entry, waiting])

  const mutate = useCallback(
    (update: (current: T) => T) => {
      if (!entry.snapshot.hasData) return
      setSnapshot(entry, { ...entry.snapshot, data: update(entry.snapshot.data as T) })
    },
    [entry],
  )

  return useMemo(() => {
    if (!repository.isConnected) {
      return { data: fallback, loading: false, isConnected: false, error: null, mutate, refetch }
    }
    return {
      data: snapshot.hasData ? (snapshot.data as T) : fallback,
      // Con un dato en caché no se muestra "Cargando": se ve el dato mientras
      // llega la versión nueva.
      loading: !snapshot.hasData && snapshot.loading,
      isConnected: true,
      error: snapshot.error,
      mutate,
      refetch,
    }
    // `fallback` es un literal nuevo en cada render; solo importa su valor
    // cuando todavía no hay dato.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot, mutate, refetch])
}

export function useFormSummary(formCode: FormCode, filters: PanelFilters) {
  return useRepositoryQuery<FormSummary | null>(
    () => repository.getSummary(formCode, filters),
    null,
    [formCode, filters],
    'formSummary',
  )
}

/**
 * La última sincronización con el Sheets.
 *
 * Se consulta una sola vez al montar: el dato cambia cada hora y no vale la
 * pena sondear la base por él. Basta con que esté fresco al abrir la pantalla.
 *
 * `refetch` es lo que usa el botón "Procesar datos": después de una corrida
 * manual, el indicador de "Sincronizado hace…" tiene que reflejarla sin
 * esperar a que alguien recargue la pantalla.
 */
export function useSyncStatus() {
  const [refreshToken, setRefreshToken] = useState(0)
  const result = useRepositoryQuery<SyncStatus | null>(
    () => repository.getLastSync(),
    null,
    [refreshToken],
    'syncStatus',
  )
  const refetch = useCallback(() => setRefreshToken((token) => token + 1), [])

  return { ...result, refetch }
}

/**
 * Las entregas de una bitácora semanal del alumno, de la más reciente a la más
 * antigua. El inicio del portal y la pantalla de la bitácora piden lo mismo,
 * así que comparten el resultado.
 */
export function useWeeklyLogRows(code: WeeklyFormCode, studentId: string | null) {
  return useRepositoryQuery<(JobSearchLogRow | InternshipLogRow)[]>(
    () => {
      if (!studentId) return Promise.resolve([])
      return code === 'form_busqueda'
        ? repository.getJobSearchLogs(studentId)
        : repository.getInternshipLogs(studentId)
    },
    [],
    [code, studentId],
    'weeklyLogs',
  )
}
