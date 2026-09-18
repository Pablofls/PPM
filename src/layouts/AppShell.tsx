import { NavLink, Outlet, useLocation } from 'react-router-dom'

import { useAuth } from '../auth/AuthProvider'
import { repository } from '../data/repository'
import { FORMS, UPCOMING_SECTIONS } from '../lib/catalog'

/**
 * Marco de la aplicación: rail de navegación a la izquierda, barra de cuenta
 * arriba y contenido al centro.
 *
 * El rail es oscuro y el contenido claro, como en las plataformas académicas:
 * la navegación deja de competir con la tabla, que es lo que el profesor
 * viene a leer.
 */
export function AppShell() {
  const { profile, signOut } = useAuth()
  const location = useLocation()
  const module1 = FORMS.filter((form) => form.moduleCode === '1')
  const module2 = FORMS.filter((form) => form.moduleCode === '2')
  const currentForm = FORMS.find((form) => form.path === location.pathname)

  return (
    <div className="flex min-h-full">
      <aside className="flex w-64 shrink-0 flex-col bg-ink-900">
        <div className="px-6 py-6">
          <p className="font-serif text-lg leading-tight text-white">
            Prácticas
            <br />
            Profesionales
          </p>
          <p className="mt-2 text-[11px] tracking-widest text-ink-400 uppercase">
            Panel del profesor
          </p>
        </div>

        <nav className="flex-1 overflow-y-auto pb-6">
          <NavGroup title="Módulo 1 · Conócete">
            {module1.map((form) => (
              <NavItem key={form.code} to={form.path} label={form.label} name={form.name} />
            ))}
          </NavGroup>

          <NavGroup title="Módulo 2 · Actúa">
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
                  className="block cursor-not-allowed py-1.5 pr-4 pl-11 text-sm text-ink-500"
                >
                  {section}
                </span>
              </li>
            ))}
          </NavGroup>
        </nav>

        {!repository.isConnected && (
          <p className="border-t border-white/10 px-6 py-4 text-xs leading-relaxed text-ink-400">
            Sin datos conectados. Las pantallas aún no consultan la base.
          </p>
        )}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-6 border-b border-ink-200 bg-white px-10 py-3">
          <p className="truncate text-sm text-ink-500">
            {currentForm
              ? `Módulo ${currentForm.moduleCode} · ${currentForm.label} ${currentForm.name}`
              : 'Panel de Prácticas Profesionales'}
          </p>

          <div className="flex shrink-0 items-center gap-4 text-sm">
            <span className="max-w-56 truncate text-ink-700" title={profile?.email}>
              {profile?.full_name || profile?.email}
            </span>
            <button
              type="button"
              onClick={signOut}
              className="text-ink-500 underline-offset-4 hover:text-ink-900 hover:underline"
            >
              Cerrar sesión
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-x-hidden px-10 py-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

function NavGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-7">
      <p className="mb-2 px-6 text-[11px] font-medium tracking-widest text-ink-400 uppercase">
        {title}
      </p>
      <ul>{children}</ul>
    </div>
  )
}

function NavItem({ to, label, name }: { to: string; label: string; name: string }) {
  return (
    <li>
      {/*
        La marca de la pantalla activa es una barra amarilla a ras del borde del
        rail, no una pastilla: el menú se lee como una lista continua y el
        amarillo aparece una sola vez en pantalla.
      */}
      <NavLink
        to={to}
        className={({ isActive }) =>
          `flex items-baseline gap-3 border-l-3 py-1.5 pr-4 pl-5 text-sm transition-colors ${
            isActive
              ? 'border-accent-400 bg-white/5 text-white'
              : 'border-transparent text-ink-300 hover:bg-white/5 hover:text-white'
          }`
        }
      >
        <span className="tnum w-6 shrink-0 text-xs text-ink-500">{label}</span>
        <span className="truncate">{name}</span>
      </NavLink>
    </li>
  )
}
