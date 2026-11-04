import { useEffect, useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'

import { useAuth } from '../auth/AuthProvider'
import { usePermissions } from '../auth/PermissionsProvider'
import { RoleSwitcher } from '../components/RoleSwitcher'
import { NavGroup, NavItem } from './RailNav'

/**
 * Marco de la vista del alumno, gemelo del `AppShell` del profesor: rail
 * oscuro a la izquierda con sus secciones (Inicio y Calificaciones, como el
 * menú de un curso en Canvas) y la barra de cuenta arriba.
 *
 * En pantallas angostas —el alumno entra mucho desde el celular— el rail se
 * esconde y se abre como cajón con el botón ☰.
 */
export function StudentShell() {
  const { signOut, portalReadOnly, portalStudentId } = useAuth()
  const { can } = usePermissions()
  const location = useLocation()
  const [railOpen, setRailOpen] = useState(false)

  // Elegir una sección cierra el cajón.
  useEffect(() => {
    setRailOpen(false)
  }, [location.pathname])

  return (
    <div className="flex min-h-full flex-col">
      {/*
        El admin en «Ver como Alumno»: una franja que no deja olvidar que está
        viendo el portal de otra persona, con el selector para cambiar de
        alumno o volver a su vista.
      */}
      {portalReadOnly && (
        <div className="flex flex-wrap items-center justify-between gap-3 bg-ink-950 px-6 py-2.5 sm:px-8">
          <p className="text-xs font-medium text-accent-400">
            Vista de alumno · solo lectura
            {!portalStudentId && <span className="text-ink-300"> — elige un alumno</span>}
          </p>
          <RoleSwitcher tone="dark" />
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {railOpen && (
          <button
            type="button"
            aria-label="Cerrar el menú"
            onClick={() => setRailOpen(false)}
            className="fixed inset-0 z-30 bg-ink-950/40 lg:hidden"
          />
        )}
        <aside
          className={`fixed inset-y-0 left-0 z-40 flex w-64 shrink-0 flex-col bg-ink-950 transition-transform lg:sticky lg:top-0 lg:z-auto lg:h-screen lg:translate-x-0 ${
            railOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <Link to="/alumno" className="group block px-5 py-5">
            <p className="text-[15px] leading-tight font-semibold tracking-tight text-white group-hover:text-accent-300">
              Prácticas Profesionales
            </p>
            <p className="mt-1 text-xs text-ink-400">Portal del alumno</p>
          </Link>

          <nav className="rail-scroll flex-1 overflow-y-auto px-2 pb-6">
            <NavGroup title="Mi curso">
              <NavItem to="/alumno" end label="" name="Inicio" />
              {can('alumno_calificaciones') && (
                <NavItem to="/alumno/calificaciones" label="" name="Calificaciones" />
              )}
            </NavGroup>
          </nav>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 flex items-center justify-between gap-4 border-b border-ink-200 bg-white/90 px-4 py-3 backdrop-blur sm:px-8">
            <div className="flex min-w-0 items-center gap-2">
              <button
                type="button"
                aria-label="Abrir el menú"
                aria-expanded={railOpen}
                onClick={() => setRailOpen(true)}
                className="rounded-lg px-2 py-1 text-lg text-ink-600 hover:bg-ink-100 lg:hidden"
              >
                ☰
              </button>
              <p className="truncate text-sm font-medium text-ink-600">Portal del alumno</p>
            </div>

            <div className="flex shrink-0 items-center gap-1 text-sm sm:gap-3">
              {/* Su contraseña y su sesión no son del admin que lo está viendo. */}
              {!portalReadOnly && (
                <>
                  <Link
                    to="/alumno/perfil"
                    className="rounded-lg px-2.5 py-1.5 font-medium text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900"
                  >
                    Mi perfil
                  </Link>
                  <button
                    type="button"
                    onClick={signOut}
                    className="rounded-lg px-2.5 py-1.5 font-medium text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900"
                  >
                    Cerrar sesión
                  </button>
                </>
              )}
            </div>
          </header>

          <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-8 sm:py-10">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  )
}
