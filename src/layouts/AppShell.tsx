import { NavLink, Outlet } from 'react-router-dom'

import { FORMS, UPCOMING_SECTIONS } from '../lib/catalog'
import { repository } from '../data/repository'

/**
 * Marco de la aplicación: sidebar fijo y área de contenido.
 *
 * El sidebar replica el de la plataforma actual en Apps Script para que el
 * profesor reconozca de inmediato dónde está.
 */
export function AppShell() {
  const module1 = FORMS.filter((form) => form.moduleCode === '1')
  const module2 = FORMS.filter((form) => form.moduleCode === '2')

  return (
    <div className="flex min-h-full">
      <aside className="flex w-64 shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-5 py-4">
          <p className="text-lg font-semibold text-slate-900">PPM</p>
          <p className="text-xs text-slate-500">Prácticas Profesionales</p>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
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
            funcionan. Ver regla 8 de CLAUDE.md.
          */}
          <NavGroup title="Próximamente">
            {UPCOMING_SECTIONS.map((section) => (
              <li key={section}>
                <span
                  title="Fuera del alcance de esta iteración"
                  className="block cursor-not-allowed rounded-lg px-3 py-2 text-sm text-slate-300"
                >
                  {section}
                </span>
              </li>
            ))}
          </NavGroup>
        </nav>

        {!repository.isConnected && (
          <div className="border-t border-slate-200 px-5 py-3">
            <p className="text-xs font-medium text-amber-700">Sin base de datos</p>
            <p className="mt-0.5 text-xs text-slate-500">
              Vista previa de pantallas
            </p>
          </div>
        )}
      </aside>

      <main className="flex-1 overflow-x-hidden px-8 py-7">
        <Outlet />
      </main>
    </div>
  )
}

function NavGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <p className="mb-1 px-3 text-xs font-semibold tracking-wider text-slate-400 uppercase">
        {title}
      </p>
      <ul>{children}</ul>
    </div>
  )
}

function NavItem({ to, label, name }: { to: string; label: string; name: string }) {
  return (
    <li>
      <NavLink
        to={to}
        className={({ isActive }) =>
          `block rounded-lg px-3 py-2 text-sm transition-colors ${
            isActive
              ? 'bg-blue-50 font-medium text-blue-700'
              : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
          }`
        }
      >
        <span className="text-slate-400">{label}</span> {name}
      </NavLink>
    </li>
  )
}
