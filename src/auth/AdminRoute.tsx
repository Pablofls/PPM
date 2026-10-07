import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'

import { useAuth } from './AuthProvider'

/**
 * Pantallas que solo existen en la vista de administrador (Configuración,
 * Fechas de entrega). Va DENTRO de ProtectedRoute: la sesión y el rol de staff
 * ya se comprobaron.
 *
 * Quien está en otra vista («Ver como» maestro o coordinador), o no es admin,
 * vuelve a Mis grupos. Como siempre, lo que de verdad protege es la base: las
 * escrituras de estas pantallas exigen `is_admin()`.
 */
export function AdminRoute({ children }: { children: ReactNode }) {
  const { viewingAsAdmin } = useAuth()
  if (!viewingAsAdmin) return <Navigate to="/mis-grupos" replace />
  return <>{children}</>
}
