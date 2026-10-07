import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'

import { useAuth } from '../auth/AuthProvider'

/** Las pantallas del menú Configuración. Viven aquí, no en el rail del panel. */
const SETTINGS_ITEMS = [
  { to: '/configuracion/alumnos-registrados', label: 'Alumnos registrados' },
  { to: '/configuracion/grupos', label: 'Administrar grupos' },
]

/**
 * Marco de la parte de afuera del panel: «Mis grupos» y lo que se configura
 * antes de entrar a un grupo (alumnos registrados, grupos).
 *
 * Es la barra oscura de arriba, sin rail: el rail es la navegación dentro de
 * un grupo, y aquí todavía no se ha elegido ninguno.
 */
export function HomeShell() {
  const { profile, signOut } = useAuth()
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
        <div className="flex items-center gap-3 text-sm">
          <SettingsMenu />
          <span className="max-w-56 truncate text-ink-300" title={profile?.email}>
            {profile?.full_name || profile?.email}
          </span>
          <button
            type="button"
            onClick={signOut}
            className="rounded-lg px-2.5 py-1.5 font-medium text-ink-400 transition-colors hover:bg-white/10 hover:text-white"
          >
            Cerrar sesión
          </button>
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

function SettingsMenu() {
  const [open, setOpen] = useState(false)
  const menu = useRef<HTMLDivElement>(null)

  // Se cierra al elegir una opción, al hacer clic afuera y con Escape.
  useEffect(() => {
    if (!open) return
    const onClick = (event: MouseEvent) => {
      if (!menu.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={menu} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={`rounded-lg px-2.5 py-1.5 font-medium transition-colors hover:bg-white/10 hover:text-white ${
          open ? 'bg-white/10 text-white' : 'text-ink-300'
        }`}
      >
        Configuración ▾
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-2 w-56 overflow-hidden rounded-lg border border-ink-200 bg-white py-1 shadow-lg"
        >
          {SETTINGS_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              role="menuitem"
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `block px-4 py-2 text-sm ${
                  isActive ? 'bg-ink-100 font-medium text-ink-900' : 'text-ink-700 hover:bg-ink-50'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  )
}
