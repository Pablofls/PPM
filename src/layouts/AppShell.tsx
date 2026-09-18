import { NavLink, Outlet, useLocation } from 'react-router-dom'

import { useAuth } from '../auth/AuthProvider'
import { repository } from '../data/repository'
import { FORMS, UPCOMING_SECTIONS } from '../lib/catalog'

/**
 * Marco de la aplicación: barra lateral fija y área de contenido.
 *
 * La barra lateral es oscura y siempre visible, como en las plataformas
 * universitarias que el profesor ya usa (Canvas, Blackboard): el menú se lee
 * como una sola pieza y el contenido queda claramente separado de la navegación.
 */
export function AppShell() {
  const { profile, signOut } = useAuth()
  const location = useLocation()
  const module1 = FORMS.filter((form) => form.moduleCode === '1')
  const module2 = FORMS.filter((form) => form.moduleCode === '2')
  const currentForm = FORMS.find((form) => form.path === location.pathname)

  return (
    <div className="flex min-h-full">
      <aside className="flex w-68 shrink-0 flex-col bg-brand-900 text-brand-100">
        <div className="flex items-center gap-3 border-b border-white/10 px-5 py-4">
          <span className="flex size-10 items-center justify-center rounded-lg bg-accent-400 text-sm font-bold text-brand-900">
            PPM
          </span>
          <div>
            <p className="text-sm font-semibold text-white">Prácticas Profesionales</p>
            <p className="text-xs text-brand-300">Panel del profesor</p>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-5">
          <NavGroup title="Módulo 1: Conócete">
            {module1.map((form) => (
              <NavItem key={form.code} to={form.path} label={form.label} name={form.name} />
            ))}
          </NavGroup>

          <NavGroup title="Módulo 2: Actúa">
            {module2.map((form) => (
              <NavItem key={form.code} to={form.path} label={form.label} name={form.name} />
            ))}
          </NavGroup>

          {/*
            Las secciones futuras se muestran deshabilitadas a propósito:
            comunican el alcance completo del proyecto sin prometer que ya
            funcionan. Ver regla «Alcance de las pantallas» de CLAUDE.md.
          */}
          <NavGroup title="Próximamente">
            {UPCOMING_SECTIONS.map((section) => (
              <li key={section}>
                <span
                  title="Fuera del alcance de esta iteración"
                  className="block cursor-not-allowed rounded-lg px-3 py-2 text-sm text-brand-400/70"
                >
                  {section}
                </span>
              </li>
            ))}
          </NavGroup>
        </nav>

        {!repository.isConnected && (
          <div className="mx-3 mb-3 rounded-lg border-l-4 border-accent-400 bg-white/5 px-3 py-2.5">
            <p className="text-xs font-semibold text-accent-300">Sin datos conectados</p>
            <p className="mt-0.5 text-xs text-brand-300">
              Las pantallas aún no consultan la base
            </p>
          </div>
        )}

        <div className="flex items-center gap-3 border-t border-white/10 px-4 py-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-700 text-xs font-semibold text-accent-300">
            {initials(profile?.full_name || profile?.email)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-white" title={profile?.email}>
              {profile?.full_name || profile?.email}
            </p>
            <button
              type="button"
              onClick={signOut}
              className="text-xs font-medium text-brand-300 hover:text-accent-300"
            >
              Cerrar sesión
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/*
          Barra superior: repite dónde está parado el profesor. Con once
          pantallas casi idénticas, el título de la tabla no basta.
        */}
        <header className="flex items-center justify-between gap-4 border-b border-slate-200 bg-white px-8 py-3">
          <p className="text-sm text-slate-500">
            {currentForm ? (
              <>
                <span className="font-medium text-brand-700">
                  Módulo {currentForm.moduleCode}
                </span>
                <span className="mx-2 text-slate-300">/</span>
                <span className="text-slate-700">
                  {currentForm.label} {currentForm.name}
                </span>
              </>
            ) : (
              'Panel de Prácticas Profesionales'
            )}
          </p>
          <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700">
            Iteración 2
          </span>
        </header>

        <main className="flex-1 overflow-x-hidden px-8 py-7">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

/** Iniciales para el avatar. Con un solo nombre basta la primera letra. */
function initials(name: string | null | undefined) {
  if (!name) return '··'
  const parts = name.trim().split(/\s+/).slice(0, 2)
  return parts.map((part) => part[0]?.toUpperCase() ?? '').join('') || '··'
}

function NavGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <p className="mb-1.5 px-3 text-[11px] font-semibold tracking-wider text-accent-300/80 uppercase">
        {title}
      </p>
      <ul className="space-y-0.5">{children}</ul>
    </div>
  )
}

function NavItem({ to, label, name }: { to: string; label: string; name: string }) {
  return (
    <li>
      <NavLink
        to={to}
        className={({ isActive }) =>
          `flex items-center gap-2 rounded-lg border-l-4 px-3 py-2 text-sm transition-colors ${
            isActive
              ? 'border-accent-400 bg-white/10 font-medium text-white'
              : 'border-transparent text-brand-200 hover:bg-white/5 hover:text-white'
          }`
        }
      >
        {({ isActive }) => (
          <>
            <span
              className={`w-7 shrink-0 text-xs font-semibold tabular-nums ${
                isActive ? 'text-accent-300' : 'text-brand-400'
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
