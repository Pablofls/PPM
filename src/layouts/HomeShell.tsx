import { Link, Outlet, useLocation } from 'react-router-dom'

import { RoleSwitcher } from '../components/RoleSwitcher'
import { SettingsMenu } from '../components/SettingsMenu'

/**
 * Marco de la parte de afuera del panel: «Mis grupos» y lo que se configura
 * antes de entrar a un grupo (alumnos registrados, grupos).
 *
 * Es la barra oscura de arriba, sin rail: el rail es la navegación dentro de
 * un grupo, y aquí todavía no se ha elegido ninguno.
 */
export function HomeShell() {
  const location = useLocation()
  const isHome = location.pathname === '/mis-grupos'

  return (
    <div className="flex min-h-full flex-col bg-paper">
      <header className="flex items-center justify-between gap-6 bg-ink-950 px-8 py-4">
        <Link to="/mis-grupos" className="group">
          <p className="text-[15px] leading-tight font-semibold tracking-tight text-white">
            Prácticas Profesionales
          </p>
          <p className="mt-0.5 text-xs text-ink-400 group-hover:text-ink-300">Mis grupos</p>
        </Link>
        <div className="flex items-center gap-4">
          <RoleSwitcher tone="dark" />
          <SettingsMenu tone="dark" />
        </div>
      </header>

      {isHome ? (
        <Outlet />
      ) : (
        <main className="flex-1 overflow-x-hidden px-8 py-7">
          <Link
            to="/mis-grupos"
            className="mb-4 inline-block text-sm font-medium text-ink-500 hover:text-ink-900"
          >
            ← Mis grupos
          </Link>
          <Outlet />
        </main>
      )}
    </div>
  )
}
