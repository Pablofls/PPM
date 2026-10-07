import { useEffect, useRef, useState } from 'react'
import { NavLink } from 'react-router-dom'

import { profileDisplayName, useAuth } from '../auth/AuthProvider'

/** Las pantallas de Configuración. Viven aquí, no en el rail del panel. */
const SETTINGS_ITEMS = [
  { to: '/configuracion/alumnos-registrados', label: 'Alumnos registrados' },
  { to: '/configuracion/grupos', label: 'Administrar grupos' },
  { to: '/configuracion/usuarios', label: 'Usuarios' },
]

/**
 * El engrane de la barra de arriba: Mi perfil, Configuración y la sesión en
 * un solo lugar, para que la barra quede limpia. Lo usan Mis grupos (barra oscura) y
 * el panel (barra clara).
 */
export function SettingsMenu({ tone }: { tone: 'dark' | 'light' }) {
  const { profile, session, signOut, viewingAsAdmin } = useAuth()
  const [open, setOpen] = useState(false)
  const menu = useRef<HTMLDivElement>(null)
  const name = profileDisplayName(profile)
  const email = profile?.email ?? session?.user?.email ?? ''
  const initials =
    [profile?.first_name, profile?.last_name]
      .map((part) => part?.trim().charAt(0) ?? '')
      .join('')
      .toUpperCase() || email.charAt(0).toUpperCase()

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

  const buttonTone =
    tone === 'dark'
      ? open
        ? 'bg-white/10 text-white'
        : 'text-ink-300 hover:bg-white/10 hover:text-white'
      : open
        ? 'bg-ink-100 text-ink-900'
        : 'text-ink-500 hover:bg-ink-100 hover:text-ink-900'

  return (
    <div ref={menu} className="relative">
      <button
        type="button"
        aria-label="Configuración"
        title="Configuración"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${buttonTone}`}
      >
        <GearIcon />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-2 w-64 overflow-hidden rounded-lg border border-ink-200 bg-white py-1 shadow-lg"
        >
          {/* Arriba, la cuenta: lleva a Mi perfil (nombre, rol y contraseña). */}
          <NavLink
            to="/mi-perfil"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 border-b border-ink-100 px-4 py-3 hover:bg-ink-50"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink-900 text-sm font-semibold text-white">
              {initials}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-ink-900">
                {name ?? 'Mi perfil'}
              </span>
              <span className="block truncate text-xs text-ink-500">
                {name ? 'Ver mi perfil' : email}
              </span>
            </span>
          </NavLink>

          {/* Configuración es de la vista de administrador. */}
          {viewingAsAdmin && (
            <>
              <p className="px-4 pt-2.5 pb-1 text-[11px] font-semibold tracking-widest text-ink-400 uppercase">
                Configuración
              </p>
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
            </>
          )}

          <div className="mt-1 border-t border-ink-100 pt-1">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false)
                void signOut()
              }}
              className="block w-full px-4 py-2 text-left text-sm text-ink-700 hover:bg-ink-50"
            >
              Cerrar sesión
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function GearIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}
