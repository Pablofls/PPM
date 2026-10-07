import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

import { useRepositoryQuery } from '../data/hooks'
import { repository } from '../data/repository'
import type { RoleScreenAccess } from '../data/types'
import { SCREENS, hasAccess, type AccessLevel } from '../lib/screens'
import { useAuth } from './AuthProvider'

interface PermissionsState {
  loading: boolean
  /** El acceso de la vista activa («Ver como») a una pantalla. */
  access: (screen: string) => AccessLevel
  /** ¿Puede al menos `needed` (por omisión, leer)? */
  can: (screen: string, needed?: AccessLevel) => boolean
  /** La matriz completa por rol, para Usuarios y permisos. */
  matrix: RoleScreenAccess[]
  /** Vuelve a leer la matriz y las excepciones, después de cambiarlas. */
  refetch: () => void
}

const PermissionsContext = createContext<PermissionsState | null>(null)

const maxAccessOf = (screen: string): AccessLevel =>
  SCREENS.find((candidate) => candidate.code === screen)?.maxAccess ?? 'ninguno'

/**
 * Qué puede ver y editar la vista activa (`0038`).
 *
 * - Vista de administrador: todo.
 * - Vista de maestro o coordinador: la excepción de la persona que se está
 *   viendo, si la tiene; si no, lo que da ese rol en la matriz.
 * - Vista de alumno: lo que da el rol alumno (y sus excepciones, si es el
 *   propio alumno).
 *
 * Es lo que decide el menú, las rutas y los botones. Lo que de verdad protege
 * es la base: las mismas reglas están en RLS y en las funciones de escritura.
 * Una diferencia a propósito: la base da la UNIÓN de los roles de una persona;
 * la interfaz, solo los del rol que eligió en «Ver como».
 */
export function PermissionsProvider({ children }: { children: ReactNode }) {
  const { profile, isStudent, activeRole, viewUserId, viewingAsAdmin } = useAuth()
  const [refreshKey, setRefreshKey] = useState(0)
  const hasRoles = (profile?.roles.length ?? 0) > 0

  const { data: matrix, loading: loadingMatrix } = useRepositoryQuery(
    () => (hasRoles ? repository.getRoleScreenAccess() : Promise.resolve([] as RoleScreenAccess[])),
    [] as RoleScreenAccess[],
    [hasRoles, refreshKey],
  )

  // Las excepciones de la persona que se está viendo: la propia, o la que
  // eligió el admin. En la vista de alumno del admin no hay persona de
  // `profiles` a la mano (se elige un `students.id`): vale la matriz del rol.
  const overridesFor = isStudent
    ? (profile?.id ?? null)
    : activeRole === 'maestro' || activeRole === 'coordinador'
      ? viewUserId
      : null

  const { data: overrides, loading: loadingOverrides } = useRepositoryQuery(
    () =>
      overridesFor
        ? repository.getUserScreenAccess(overridesFor)
        : Promise.resolve({} as Record<string, AccessLevel>),
    {} as Record<string, AccessLevel>,
    [overridesFor, refreshKey],
  )

  const refetch = useCallback(() => setRefreshKey((key) => key + 1), [])

  const value = useMemo<PermissionsState>(() => {
    const access = (screen: string): AccessLevel => {
      if (viewingAsAdmin) return maxAccessOf(screen)
      if (screen in overrides) return overrides[screen]
      const row = matrix.find((cell) => cell.roleCode === activeRole && cell.screenCode === screen)
      return row?.access ?? 'ninguno'
    }
    return {
      loading: loadingMatrix || loadingOverrides,
      access,
      can: (screen, needed = 'lectura') => hasAccess(access(screen), needed),
      matrix,
      refetch,
    }
  }, [viewingAsAdmin, overrides, matrix, activeRole, loadingMatrix, loadingOverrides, refetch])

  return <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>
}

export function usePermissions(): PermissionsState {
  const context = useContext(PermissionsContext)
  if (!context) throw new Error('usePermissions debe usarse dentro de <PermissionsProvider>')
  return context
}
