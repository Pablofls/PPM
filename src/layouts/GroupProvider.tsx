import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

import { useAuth } from '../auth/AuthProvider'
import { useRepositoryQuery } from '../data/hooks'
import { repository } from '../data/repository'
import type { Group } from '../data/types'

/** El valor de «Todos mis grupos»: el panel sin filtro de grupo. */
export const ALL_GROUPS = 'todos'

/**
 * Dónde se recuerda el grupo elegido. `sessionStorage` y no `localStorage`, a
 * propósito: como en Blackboard, cada vez que el profesor entra empieza por
 * sus grupos (`GroupPickerPage`); dentro de la misma pestaña, el grupo se
 * conserva al recargar.
 */
const STORAGE_KEY = 'ppm.grupo'

interface GroupState {
  /** Los grupos que ve la vista activa («Ver como»): todos, los que coordina o los suyos. */
  groups: Group[]
  /**
   * Para filtrar el panel cuando no se eligió un grupo: los ids de `groups`,
   * o `null` en la vista de administrador (sin restricción).
   */
  scopeGroupIds: string[] | null
  loading: boolean
  error: string | null
  /** El profesor ya eligió un grupo (o «Todos») en esta sesión. */
  hasChosen: boolean
  /** El grupo por el que se filtra; `''` = todos. */
  selectedGroupId: string
  selectedGroup: Group | null
  /** Un `groups.id` o `ALL_GROUPS`. `''` vuelve a «sin elegir». */
  selectGroup: (id: string) => void
  /** Vuelve a leer los grupos, después de crear, borrar o mover alumnos. */
  refetch: () => void
}

const GroupContext = createContext<GroupState | null>(null)

function readStored(): string {
  try {
    return sessionStorage.getItem(STORAGE_KEY) ?? ''
  } catch {
    return ''
  }
}

/**
 * El grupo que el profesor está mirando, compartido por todas las pantallas
 * del panel y por la pantalla de inicio que lo elige.
 *
 * Vive aquí y no en la URL como los demás filtros: el rail navega a la ruta
 * limpia de cada pantalla, y el grupo tiene que sobrevivir a ese cambio. Un
 * filtro de la barra es «esta tabla»; el grupo es «mi clase».
 */
export function GroupProvider({ children }: { children: ReactNode }) {
  const [refreshKey, setRefreshKey] = useState(0)
  const [storedId, setStoredId] = useState(readStored)

  const { profile, activeRole } = useAuth()
  const userId = profile?.id ?? ''

  const { data: allGroups, loading: loadingGroups, error } = useRepositoryQuery(
    () => repository.getGroups(),
    [] as Group[],
    [refreshKey],
  )

  // Solo hace falta en la vista de coordinador.
  const { data: coordinatedTeachers, loading: loadingTeachers } = useRepositoryQuery(
    () =>
      activeRole === 'coordinador'
        ? repository.getCoordinatedTeacherIds(userId)
        : Promise.resolve([] as string[]),
    [] as string[],
    [activeRole, userId],
  )
  const loading = loadingGroups || loadingTeachers

  // RLS ya entrega la unión de los roles de la cuenta (René, admin y maestro,
  // recibe todos). Aquí se acota a la vista elegida.
  const groups = useMemo(() => {
    if (activeRole === 'admin') return allGroups
    if (activeRole === 'coordinador') {
      return allGroups.filter((group) => coordinatedTeachers.includes(group.teacherId))
    }
    return allGroups.filter((group) => group.teacherId === userId)
  }, [allGroups, coordinatedTeachers, activeRole, userId])

  const scopeGroupIds = useMemo(
    () => (activeRole === 'admin' ? null : groups.map((group) => group.id)),
    [activeRole, groups],
  )

  const selectGroup = useCallback((id: string) => {
    setStoredId(id)
    try {
      if (id) sessionStorage.setItem(STORAGE_KEY, id)
      else sessionStorage.removeItem(STORAGE_KEY)
    } catch {
      // Sin almacenamiento el grupo dura lo que dure la página. Basta.
    }
  }, [])

  const refetch = useCallback(() => setRefreshKey((key) => key + 1), [])

  const value = useMemo<GroupState>(() => {
    const selectedGroup = groups.find((group) => group.id === storedId) ?? null
    const isAll = storedId === ALL_GROUPS
    // Un id guardado de un grupo que ya no existe no cuenta como elegido: se
    // vuelve a la pantalla de grupos en vez de dejar todas las tablas vacías
    // sin explicación. Mientras la lista carga se confía en él, para no
    // rebotar al profesor a la pantalla de inicio en cada recarga.
    const hasChosen = isAll || selectedGroup !== null || (loading && storedId !== '')
    return {
      groups,
      scopeGroupIds,
      loading,
      error,
      hasChosen,
      selectedGroupId: isAll ? '' : loading ? storedId : (selectedGroup?.id ?? ''),
      selectedGroup,
      selectGroup,
      refetch,
    }
  }, [groups, scopeGroupIds, loading, error, storedId, selectGroup, refetch])

  return <GroupContext.Provider value={value}>{children}</GroupContext.Provider>
}

/**
 * `null` fuera del panel del profesor (el portal del alumno no tiene grupos
 * que elegir): quien lo use decide qué hacer sin él.
 */
export function useGroups(): GroupState | null {
  return useContext(GroupContext)
}
