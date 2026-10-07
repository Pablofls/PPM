import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'

import { usePermissions } from './PermissionsProvider'

/**
 * Una pantalla de Configuración que se abre según los permisos (`0038`):
 * quien no tiene al menos «Solo lectura» vuelve a Mis grupos. Las del panel
 * las cuida el `AppShell`. Lo que de verdad protege es la base.
 */
export function ScreenRoute({ screen, children }: { screen: string; children: ReactNode }) {
  const { can, loading } = usePermissions()
  if (loading) return null
  if (!can(screen)) return <Navigate to="/mis-grupos" replace />
  return <>{children}</>
}
