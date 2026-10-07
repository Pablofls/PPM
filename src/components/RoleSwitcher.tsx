import { useNavigate } from 'react-router-dom'

import { ROLE_LABELS, useAuth, type RoleCode } from '../auth/AuthProvider'
import { useRepositoryQuery } from '../data/hooks'
import { repository } from '../data/repository'

type Tone = 'dark' | 'rail' | 'light'

const SELECT: Record<Tone, string> = {
  rail: 'w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm font-medium text-white focus:border-accent-400 focus:outline-none',
  dark: 'max-w-56 rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 text-sm font-medium text-white focus:border-accent-400 focus:outline-none',
  light:
    'max-w-56 rounded-lg border border-ink-200 bg-white px-2.5 py-1.5 text-sm font-medium text-ink-900 focus:border-ink-400 focus:outline-none',
}

/**
 * «Ver como».
 *
 * - El **admin** elige cualquiera de los cuatro roles, aunque no los tenga, y
 *   en maestro, coordinador o alumno elige además A QUIÉN: ve exactamente lo
 *   que esa persona ve. El portal de un alumno se muestra en solo lectura.
 * - Quien tiene varios roles sin ser admin (un coordinador que también es
 *   maestro) cambia solo entre los suyos, y siempre se ve a sí mismo.
 * - Quien tiene un solo rol no ve el selector.
 *
 * No da permisos: RLS deja leer lo que la cuenta tiene. Solo acota lo que la
 * interfaz muestra.
 */
export function RoleSwitcher({ tone }: { tone: Tone }) {
  const { viewRoles, activeRole, viewUserId, portalStudentId, setView, isAdmin } = useAuth()
  const navigate = useNavigate()

  // La lista de personas solo hace falta al admin, y solo la del rol elegido.
  const { data: people } = useRepositoryQuery(
    async () => {
      if (!isAdmin) return []
      if (activeRole === 'maestro') return toOptions(await repository.getTeachers())
      if (activeRole === 'coordinador') return toOptions(await repository.getCoordinators())
      if (activeRole === 'alumno') {
        const students = await repository.getRegisteredStudents()
        return students
          .map((student) => ({ id: student.studentId, label: student.fullName ?? student.email }))
          .sort((a, b) => a.label.localeCompare(b.label, 'es'))
      }
      return []
    },
    [] as { id: string; label: string }[],
    [isAdmin, activeRole],
  )

  if (viewRoles.length < 2) return null

  const personId = activeRole === 'alumno' ? portalStudentId : viewUserId
  const choosesPerson = isAdmin && activeRole !== null && activeRole !== 'admin'

  function changeRole(role: RoleCode) {
    setView(role, null)
    // Cada vista tiene su propia entrada: el portal del alumno o Mis grupos.
    navigate(role === 'alumno' ? '/alumno' : '/mis-grupos')
  }

  function changePerson(id: string) {
    if (!activeRole) return
    setView(activeRole, id || null)
    navigate(activeRole === 'alumno' ? '/alumno' : '/mis-grupos')
  }

  const roleSelect = (
    <select
      aria-label="Ver como"
      value={activeRole ?? ''}
      onChange={(event) => changeRole(event.target.value as RoleCode)}
      className={SELECT[tone]}
    >
      {viewRoles.map((role) => (
        <option key={role} value={role} className="text-ink-900">
          {ROLE_LABELS[role]}
        </option>
      ))}
    </select>
  )

  const personSelect = choosesPerson ? (
    <select
      aria-label={`Qué ${ROLE_LABELS[activeRole!].toLowerCase()} ver`}
      value={personId ?? ''}
      onChange={(event) => changePerson(event.target.value)}
      className={SELECT[tone]}
    >
      <option value="" className="text-ink-900">
        {activeRole === 'alumno' ? 'Elige un alumno…' : `Elige un ${ROLE_LABELS[activeRole!].toLowerCase()}…`}
      </option>
      {people.map((person) => (
        <option key={person.id} value={person.id} className="text-ink-900">
          {person.label}
        </option>
      ))}
    </select>
  ) : null

  if (tone === 'rail') {
    return (
      <div className="space-y-1.5 border-t border-white/10 px-4 py-4">
        <p className="text-[11px] font-semibold tracking-widest text-accent-400 uppercase">
          Ver como
        </p>
        {roleSelect}
        {personSelect}
      </div>
    )
  }

  return (
    <div
      className={`flex flex-wrap items-center gap-2 text-xs ${
        tone === 'dark' ? 'text-ink-400' : 'text-ink-500'
      }`}
    >
      <span>Ver como</span>
      {roleSelect}
      {personSelect}
    </div>
  )
}

function toOptions(users: { id: string; name: string | null; email: string }[]) {
  return users.map((user) => ({ id: user.id, label: user.name ?? user.email }))
}
