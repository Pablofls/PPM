import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'

import { useAuth } from './AuthProvider'
import { LoginPage } from './LoginPage'
import { PendingPage } from './PendingPage'

/**
 * Puerta de entrada al panel.
 *
 * Sin sesión → login. Con rol `alumno` → su propia vista. Con sesión pero sin
 * rol → cuenta pendiente. Ver la regla «Toda pantalla nace protegida y
 * admin-only» de CLAUDE.md.
 */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { session, loading, isAdmin, isStudent } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-full items-center justify-center">
        <p className="text-sm text-ink-500">Cargando…</p>
      </div>
    )
  }

  if (!session) return <LoginPage />
  // Un alumno que escribe la dirección del panel no ve un error: va a su
  // pantalla. Lo que de verdad lo detiene es RLS, que no le devuelve una fila.
  if (isStudent) return <Navigate to="/alumno" replace />
  if (!isAdmin) return <PendingPage />

  return <>{children}</>
}
