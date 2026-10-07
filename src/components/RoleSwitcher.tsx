import { ROLE_LABELS, useAuth, type RoleCode } from '../auth/AuthProvider'

/**
 * «Ver como»: para quien tiene varios roles del panel (René es administrador
 * y maestro), con cuál está trabajando. Cambia qué grupos ve en Mis grupos y
 * qué secciones aparecen. Quien tiene un solo rol no lo ve.
 *
 * No da permisos: RLS deja leer la unión de los roles de la cuenta pase lo
 * que pase aquí. Solo acota lo que la interfaz muestra.
 */
export function RoleSwitcher({ tone }: { tone: 'dark' | 'rail' }) {
  const { staffRoles, activeRole, setActiveRole } = useAuth()
  if (staffRoles.length < 2) return null

  const select = (
    <select
      aria-label="Ver como"
      value={activeRole ?? ''}
      onChange={(event) => setActiveRole(event.target.value as RoleCode)}
      className={
        tone === 'rail'
          ? 'mt-1.5 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm font-medium text-white focus:border-accent-400 focus:outline-none'
          : 'rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 text-sm font-medium text-white focus:border-accent-400 focus:outline-none'
      }
    >
      {staffRoles.map((role) => (
        <option key={role} value={role} className="text-ink-900">
          {ROLE_LABELS[role]}
        </option>
      ))}
    </select>
  )

  if (tone === 'dark') {
    return (
      <label className="flex items-center gap-2 text-xs text-ink-400">
        Ver como
        {select}
      </label>
    )
  }

  return (
    <div className="border-t border-white/10 px-4 py-4">
      <p className="text-[11px] font-semibold tracking-widest text-accent-400 uppercase">
        Ver como
      </p>
      {select}
    </div>
  )
}
