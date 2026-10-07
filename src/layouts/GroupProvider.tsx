import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

import { useRepositoryQuery } from '../data/hooks'
import { repository } from '../data/repository'
import type { Group } from '../data/types'

/** Dónde se recuerda el grupo elegido entre visitas. Solo una comodidad: sin él, «Todos». */
const STORAGE_KEY = 'ppm.grupo'

interface GroupState {
  groups: Group[]
  loading: boolean
  error: string | null
  /** `''` = todos los grupos. */
  selectedGroupId: string
  selectedGroup: Group | null
  setSelectedGroupId: (id: string) => void
  /** Vuelve a leer los grupos, después de crear, borrar o mover alumnos. */
  refetch: () => void
}

const GroupContext = createContext<GroupState | null>(null)

function readStored(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? ''
  } catch {
    return ''
  }
}

/**
 * El grupo que el profesor está mirando, compartido por todas las pantallas
 * del panel.
 *
 * Vive aquí y no en la URL como los demás filtros: el rail navega a la ruta
 * limpia de cada pantalla, y el grupo tiene que sobrevivir a ese cambio. Un
 * filtro de la barra es «esta tabla»; el grupo es «mi clase».
 */
export function GroupProvider({ children }: { children: ReactNode }) {
  const [refreshKey, setRefreshKey] = useState(0)
  const [storedId, setStoredId] = useState(readStored)

  const { data: groups, loading, error } = useRepositoryQuery(
    () => repository.getGroups(),
    [] as Group[],
    [refreshKey],
  )

  const setSelectedGroupId = useCallback((id: string) => {
    setStoredId(id)
    try {
      if (id) localStorage.setItem(STORAGE_KEY, id)
      else localStorage.removeItem(STORAGE_KEY)
    } catch {
      // Sin almacenamiento el grupo dura lo que dure la pestaña. Basta.
    }
  }, [])

  const refetch = useCallback(() => setRefreshKey((key) => key + 1), [])

  const value = useMemo<GroupState>(() => {
    // Un id guardado de un grupo que ya no existe no puede filtrar: dejaría
    // todas las tablas vacías sin explicación. Mientras la lista carga se
    // confía en él, para no consultar primero todo y luego volver a consultar.
    const selectedGroup = groups.find((group) => group.id === storedId) ?? null
    return {
      groups,
      loading,
      error,
      selectedGroupId: loading ? storedId : (selectedGroup?.id ?? ''),
      selectedGroup,
      setSelectedGroupId,
      refetch,
    }
  }, [groups, loading, error, storedId, setSelectedGroupId, refetch])

  return <GroupContext.Provider value={value}>{children}</GroupContext.Provider>
}

/**
 * `null` fuera del panel del profesor (el portal del alumno no tiene selector
 * de grupo): quien lo use decide qué hacer sin él.
 */
export function useGroups(): GroupState | null {
  return useContext(GroupContext)
}
