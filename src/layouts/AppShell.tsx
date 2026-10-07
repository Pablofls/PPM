import { Link, Navigate, NavLink, Outlet, useLocation } from 'react-router-dom'

import { repository } from '../data/repository'
import { FORMS, MODULE_TITLES, UPCOMING_SECTIONS } from '../lib/catalog'
import { formatGroupLabel } from '../lib/format'
import { GroupCover } from '../components/GroupCover'
import { RoleSwitcher } from '../components/RoleSwitcher'
import { SettingsMenu } from '../components/SettingsMenu'
import { useAuth } from '../auth/AuthProvider'
import { useGroups } from './GroupProvider'

/**
 * Marco de la aplicación: rail de navegación a la izquierda, barra de cuenta
 * arriba y contenido al centro.
 *
 * El rail es oscuro y el contenido claro, como en las plataformas académicas:
 * la navegación deja de competir con la tabla, que es lo que el profesor viene
 * a leer.
 */
export function AppShell() {
  const location = useLocation()
  const secciones = (['1', '2', 'A', 'B'] as const).map((moduleCode) => ({
    moduleCode,
    titulo: MODULE_TITLES[moduleCode],
    formularios: FORMS.filter((form) => form.moduleCode === moduleCode),
  }))
  const currentForm = FORMS.find((form) => form.path === location.pathname)
  const groupContext = useGroups()
  const { activeRole, viewingAsAdmin } = useAuth()

  // Sin grupo elegido en esta sesión, primero «Mis grupos» (como entrar a
  // Blackboard). `volver` regresa a la pantalla que se había pedido, para que
  // un enlace guardado siga sirviendo.
  if (groupContext && !groupContext.hasChosen) {
    const back = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`/mis-grupos?volver=${back}`} replace />
  }

  return (
    <div className="flex min-h-full">
      <aside className="sticky top-0 flex h-screen w-72 shrink-0 flex-col bg-ink-950">
        {/* El nombre de la plataforma regresa a Mis grupos, como el logo de Blackboard. */}
        <Link to="/mis-grupos" className="group block px-5 py-5">
          <p className="text-[15px] leading-tight font-semibold tracking-tight text-white group-hover:text-accent-300">
            Prácticas Profesionales
          </p>
          <p className="mt-1 text-xs text-ink-400">
            {activeRole === 'admin'
              ? 'Panel del administrador'
              : activeRole === 'coordinador'
                ? 'Panel del coordinador'
                : 'Panel del maestro'}
          </p>
        </Link>

        <CurrentGroup />

        <nav className="rail-scroll flex-1 overflow-y-auto px-2 pb-6">
          {secciones.map((seccion) => (
            <NavGroup key={seccion.moduleCode} title={seccion.titulo}>
              {seccion.formularios.map((form) => (
                <NavItem key={form.code} to={form.path} label={form.label} name={form.name} />
              ))}
            </NavGroup>
          ))}

          <NavGroup title="Entregas">
            <NavItem to="/entregas/estado-de-entregas" label="" name="Estado de Entregas" />
            {/* Asignar fechas es admin-only (form_deadlines, 0017). */}
            {viewingAsAdmin && (
              <NavItem to="/entregas/fechas-de-entrega" label="" name="Fechas de entrega" />
            )}
          </NavGroup>


          {/*
            Las secciones futuras se muestran deshabilitadas a propósito:
            comunican el alcance completo del proyecto sin prometer que ya
            funcionan. Ver regla «Alcance de las pantallas» de CLAUDE.md.
          */}
          {UPCOMING_SECTIONS.length > 0 && (
            <NavGroup title="Próximamente">
              {UPCOMING_SECTIONS.map((section) => (
                <li key={section}>
                  <span
                    title="Fuera del alcance de esta iteración"
                    className="block cursor-not-allowed rounded-lg px-3 py-2 text-sm text-ink-600"
                  >
                    {section}
                  </span>
                </li>
              ))}
            </NavGroup>
          )}
        </nav>

        <RoleSwitcher tone="rail" />

        {!repository.isConnected && (
          <p className="border-t border-white/10 px-5 py-4 text-xs leading-relaxed text-ink-400">
            Sin datos conectados. Las pantallas aún no consultan la base.
          </p>
        )}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-6 border-b border-ink-200 bg-white/90 px-8 py-3 backdrop-blur">
          <p className="truncate text-sm font-medium text-ink-600">
            {currentForm
              ? `Módulo ${currentForm.moduleCode} · ${currentForm.label} ${currentForm.name}`
              : 'Panel de Prácticas Profesionales'}
          </p>

          <SettingsMenu tone="light" />
        </header>

        <main className="flex-1 overflow-x-hidden px-8 py-7">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

/**
 * El grupo que se está mirando, arriba del rail. Toda la tarjeta es la salida
 * de vuelta a «Mis grupos». Filtra todas las pantallas a la vez.
 */
function CurrentGroup() {
  const context = useGroups()
  const group = context?.selectedGroup ?? null

  return (
    <Link
      to="/mis-grupos"
      title="Cambiar de grupo"
      className="group mx-3 mb-5 block overflow-hidden rounded-lg border border-white/10 bg-white/5 transition-colors hover:border-white/25 hover:bg-white/10"
    >
      {group ? (
        <div className="[&>div]:h-14">
          <GroupCover seed={group.id} title={group.periodCode} />
        </div>
      ) : null}
      <div className="px-3 py-2.5">
        <p className="text-[11px] font-semibold tracking-widest text-ink-500 uppercase">Grupo</p>
        <p className="mt-0.5 truncate text-sm font-medium text-white">
          {group ? formatGroupLabel(group) : 'Todos mis grupos'}
        </p>
        <span className="mt-1.5 inline-block text-xs font-medium text-accent-400 group-hover:text-accent-300">
          Cambiar de grupo
        </span>
      </div>
    </Link>
  )
}

function NavGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <p className="mb-1.5 px-3 text-[11px] font-semibold tracking-widest text-ink-500 uppercase">
        {title}
      </p>
      <ul className="space-y-0.5">{children}</ul>
    </div>
  )
}

function NavItem({ to, label, name }: { to: string; label: string; name: string }) {
  return (
    <li>
      {/*
        La pantalla activa se marca con la barra amarilla y el fondo claro; el
        resto del rail queda en un solo tono para que solo haya un punto de
        color en toda la pantalla.
      */}
      <NavLink
        to={to}
        className={({ isActive }) =>
          `relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
            isActive
              ? 'bg-white/10 font-semibold text-white'
              : 'font-medium text-ink-300 hover:bg-white/5 hover:text-white'
          }`
        }
      >
        {({ isActive }) => (
          <>
            {isActive && (
              <span className="absolute top-1 bottom-1 -left-2 w-1 rounded-r-full bg-accent-400" />
            )}
            <span
              className={`tnum w-6 shrink-0 text-xs ${
                isActive ? 'text-accent-400' : 'text-ink-500'
              }`}
            >
              {label}
            </span>
            <span className="truncate">{name}</span>
          </>
        )}
      </NavLink>
    </li>
  )
}
