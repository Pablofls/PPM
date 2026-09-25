import { Link, Outlet } from 'react-router-dom'

import { useAuth } from '../auth/AuthProvider'

/**
 * Marco de la vista del alumno, gemelo del `AppShell` del profesor.
 *
 * No lleva rail: el alumno tiene dos tareas, no trece pantallas. La navegación
 * es el índice de `/alumno` y el título del encabezado, que siempre regresa
 * ahí. El rail del profesor sería una promesa de secciones que el alumno no
 * tiene (regla «Alcance de las pantallas» de CLAUDE.md).
 */
export function StudentShell() {
  const { profile, session, signOut } = useAuth()
  const correo = profile?.email ?? session?.user?.email

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-10 flex items-center justify-between gap-6 border-b border-ink-200 bg-white px-6 py-3 sm:px-8">
        <Link to="/alumno" className="min-w-0 rounded-lg">
          <p className="truncate text-sm font-semibold tracking-tight text-ink-900">
            Prácticas Profesionales
          </p>
          <p className="text-xs text-ink-500">Portal del alumno</p>
        </Link>

        <div className="flex shrink-0 items-center gap-3 text-sm">
          <span className="hidden max-w-56 truncate text-ink-600 sm:inline" title={correo}>
            {correo}
          </span>
          <button
            type="button"
            onClick={signOut}
            className="rounded-lg px-2.5 py-1.5 font-medium text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900"
          >
            Cerrar sesión
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-6 py-10 sm:px-8">
        <Outlet />
      </main>
    </div>
  )
}
