import { NavLink } from 'react-router-dom'

/**
 * Las piezas del rail oscuro: lo comparten el panel del profesor (`AppShell`)
 * y el portal del alumno (`StudentShell`).
 */

export function NavGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <p className="mb-1.5 px-3 text-[11px] font-semibold tracking-widest text-ink-500 uppercase">
        {title}
      </p>
      <ul className="space-y-0.5">{children}</ul>
    </div>
  )
}

export function NavItem({
  to,
  label,
  name,
  onHover,
  end,
}: {
  to: string
  label: string
  name: string
  onHover?: () => void
  /** Activa solo en la ruta exacta (el «Inicio» del portal, `/alumno`). */
  end?: boolean
}) {
  return (
    <li>
      {/*
        La pantalla activa se marca con la barra amarilla y el fondo claro; el
        resto del rail queda en un solo tono para que solo haya un punto de
        color en toda la pantalla.
      */}
      <NavLink
        to={to}
        end={end}
        onMouseEnter={onHover}
        onFocus={onHover}
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
