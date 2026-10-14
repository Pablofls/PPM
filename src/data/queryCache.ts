import { supabase } from './supabaseClient'

// ---------------------------------------------------------------------------
// Caché
// ---------------------------------------------------------------------------
// Qué se ve al volver a una pantalla: lo último que se supo de ella, al
// instante, mientras se consulta de nuevo en segundo plano (stale-while-
// revalidate). Vive en memoria: recargar la página lo vacía, y así ningún dato
// personal queda guardado en el navegador.

export interface Snapshot {
  data: unknown
  hasData: boolean
  loading: boolean
  error: string | null
}

export interface Entry {
  snapshot: Snapshot
  inFlight: Promise<void> | null
  listeners: Set<() => void>
}

export const cache = new Map<string, Entry>()

export function getEntry(key: string): Entry {
  let entry = cache.get(key)
  if (!entry) {
    entry = {
      snapshot: { data: undefined, hasData: false, loading: true, error: null },
      inFlight: null,
      listeners: new Set(),
    }
    cache.set(key, entry)
  }
  return entry
}

export function setSnapshot(entry: Entry, snapshot: Snapshot) {
  entry.snapshot = snapshot
  entry.listeners.forEach((listener) => listener())
}

/** Claves de objeto ordenadas: `{a,b}` y `{b,a}` son la misma consulta. */
export function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  )
}

export function fetchEntry<T>(entry: Entry, query: () => Promise<T>): Promise<void> {
  // Varias pantallas montadas a la vez comparten la misma consulta en vuelo.
  if (entry.inFlight) return entry.inFlight

  const promise = query()
    .then((result) => {
      setSnapshot(entry, { data: result, hasData: true, loading: false, error: null })
    })
    .catch((cause: unknown) => {
      setSnapshot(entry, {
        data: undefined,
        hasData: false,
        loading: false,
        error: cause instanceof Error ? cause.message : 'Error desconocido',
      })
    })
    .finally(() => {
      entry.inFlight = null
    })
  entry.inFlight = promise
  return promise
}

/** Vacía el caché. Se llama tras cualquier escritura y al cambiar de cuenta. */
export function clearQueryCache() {
  cache.clear()
}

// Los datos son los de la sesión: al entrar con otra cuenta o salir no puede
// quedar nada de la anterior. (`SIGNED_IN` también se emite al volver a la
// pestaña con la misma cuenta; por eso se compara el usuario.)
let cachedUserId: string | null = null
supabase.auth.onAuthStateChange((_event, session) => {
  const userId = session?.user.id ?? null
  if (userId !== cachedUserId) {
    cachedUserId = userId
    clearQueryCache()
  }
})

