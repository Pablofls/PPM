import { NavLink, Outlet, useLocation } from 'react-router-dom'

import { useAuth } from '../auth/AuthProvider'
import { repository } from '../data/repository'
import { FORMS, MODULE_TITLES, UPCOMING_SECTIONS } from '../lib/catalog'
import { formatGroupLabel } from '../lib/format'
import { GroupProvider, useGroups } from './GroupProvider'

/**
 * Marco de la aplicación: rail de navegación a la izquierda, barra de cuenta
 * arriba y contenido al centro.
 *
 * El rail es oscuro y el contenido claro, como en las plataformas académicas:
 * la navegación deja de competir con la tabla, que es lo que el profesor viene
 * a leer.
 */
export function AppShell() {
  const { profile, signOut } = useAuth()
  const location = useLocation()
  const secciones = (['1', '2', 'A', 'B'] as const).map((moduleCode) => ({
    moduleCode,
    titulo: MODULE_TITLES[moduleCode],
    formularios: FORMS.filter((form) => form.moduleCode === moduleCode),
  }))
  const currentForm = FORMS.find((form) => form.path === location.pathname)

  return (
    <GroupProvider>
      <div className="flex min-h-full">
        <aside className="sticky top-0 flex h-screen w-72 shrink-0 flex-col bg-ink-950">
          <div className="px-5 py-5">
            <p className="text-[15px] leading-tight font-semibold tracking-tight text-white">
              Prácticas Profesionales
            </p>
            <p className="mt-1 text-xs text-ink-400">Panel del profesor</p>
          </div>

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
            </NavGroup>

            <NavGroup title="Administrador">
              <NavItem to="/administrador/panel" label="" name="Panel de Administrador" />
              <NavItem to="/administrador/alumnos-registrados" label="" name="Alumnos Registrados" />
              <NavItem to="/administrador/grupos" label="" name="Grupos" />
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

            <div className="flex shrink-0 items-center gap-3 text-sm">
              <GroupSelector />
              <span className="max-w-56 truncate text-ink-700" title={profile?.email}>
                {profile?.full_name || profile?.email}
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

          <main className="flex-1 overflow-x-hidden px-8 py-7">
            <Outlet />
          </main>
        </div>
      </div>
    </GroupProvider>
  )
}

/**
 * El grupo que se está mirando. Filtra todas las pantallas a la vez, por eso
 * vive en el encabezado y no en la barra de filtros de cada tabla.
 */
function GroupSelector() {
  const context = useGroups()
  if (!context || context.groups.length === 0) return null
  const { groups, selectedGroupId, setSelectedGroupId } = context

  // Con un solo maestro su nombre en cada opción es ruido; con varios, es lo
  // que distingue dos grupos con el mismo periodo, frecuencia e idioma.
  const severalTeachers = new Set(groups.map((group) => group.teacherId)).size > 1

  return (
    <select
      aria-label="Grupo"
      value={selectedGroupId}
      onChange={(event) => setSelectedGroupId(event.target.value)}
      className={`max-w-80 truncate rounded-lg border px-3 py-1.5 text-sm shadow-sm focus:border-ink-400 focus:ring-2 focus:ring-ink-900/5 focus:outline-none ${
        selectedGroupId
          ? 'border-ink-900 bg-ink-900 font-medium text-white'
          : 'border-ink-200 bg-white text-ink-600'
      }`}
    >
      <option value="">Todos los grupos</option>
      {groups.map((group) => (
        <option key={group.id} value={group.id}>
          {formatGroupLabel(group)}
          {severalTeachers ? ` — ${group.teacherName ?? group.teacherEmail}` : ''} (
          {group.studentCount})
        </option>
      ))}
    </select>
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
