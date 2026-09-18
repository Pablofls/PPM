import type { ReactNode } from 'react'

import { useAuth } from './AuthProvider'
import { LoginPage } from './LoginPage'
import { PendingPage } from './PendingPage'

/**
 * Puerta de entrada al panel.
 *
 * Sin sesión → login. Con sesión pero sin rol `admin` → cuenta pendiente.
 * Ver la regla «Toda pantalla nace protegida y admin-only» de CLAUDE.md.
 */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { session, loading, isAdmin } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-full items-center justify-center">
        <p className="text-sm text-ink-500">Cargando…</p>
      </div>
    )
  }

  if (!session) return <LoginPage />
  if (!isAdmin) return <PendingPage />

  return <>{children}</>
}
