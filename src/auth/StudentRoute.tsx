import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'

import { useAuth } from './AuthProvider'
import { LoginPage } from './LoginPage'
import { PendingPage } from './PendingPage'

/**
 * Puerta de entrada de la vista del alumno, gemela de `ProtectedRoute`.
 *
 * Mismo principio: estar autenticado no da acceso a nada. Hace falta el rol
 * `alumno`, activo. El profesor entrando aquí se va a su panel.
 *
 * Que esta pantalla exista no es lo que protege los datos de los demás alumnos:
 * las políticas de las tablas siguen exigiendo `is_admin()`, así que una sesión
 * de alumno no lee ni una fila de nadie.
 */
export function StudentRoute({ children }: { children: ReactNode }) {
  const { session, loading, isAdmin, isStudent } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-full items-center justify-center">
        <p className="text-sm text-ink-500">Cargando…</p>
      </div>
    )
  }

  if (!session) return <LoginPage />
  if (isAdmin) return <Navigate to="/" replace />
  if (!isStudent) return <PendingPage />

  return <>{children}</>
}
