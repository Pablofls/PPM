import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

import { useAuth } from '../auth/AuthProvider'
import { GroupCover } from '../components/GroupCover'
import type { Group } from '../data/types'
import { ALL_GROUPS, useGroups } from '../layouts/GroupProvider'
import { formatGroupLabel, formatLanguage, formatSessionDay } from '../lib/format'

/** Adonde se entra si no se venía de ninguna pantalla en particular. */
const DEFAULT_PATH = '/modulo1/datos-demograficos'

const FIELD_INPUT =
  'rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm text-ink-900 shadow-sm focus:border-ink-400 focus:ring-2 focus:ring-ink-900/5 focus:outline-none'

/**
 * Mis grupos: la pantalla de inicio del profesor, como la lista de materias
 * de Blackboard. Cada grupo es una tarjeta; al elegir una se entra al panel
 * ya filtrado a ese grupo. «Todos mis grupos» entra sin filtro.
 *
 * El panel (`AppShell`) manda aquí a quien todavía no eligió grupo en esta
 * sesión, con `?volver=` para regresarlo a la pantalla que había abierto.
 */
export function GroupPickerPage() {
  const { profile, signOut } = useAuth()
  const context = useGroups()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const groups = useMemo(() => context?.groups ?? [], [context?.groups])

  const periods = useMemo(
    // `v_groups` ya llega del periodo más reciente al más antiguo.
    () => [...new Set(groups.map((group) => group.periodCode))],
    [groups],
  )
  // `null` = el profesor no ha tocado el selector: se muestra el periodo más
  // reciente, que es el que está dando clase.
  const [period, setPeriod] = useState<string | null>(null)
  const activePeriod = period ?? periods[0] ?? ''
  const [search, setSearch] = useState('')

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return groups.filter((group) => {
      if (activePeriod && group.periodCode !== activePeriod) return false
      if (!needle) return true
      return [
        formatGroupLabel(group),
        group.teacherName ?? '',
        group.teacherEmail,
      ].some((text) => text.toLowerCase().includes(needle))
    })
  }, [groups, activePeriod, search])

  const totalStudents = groups.reduce((sum, group) => sum + group.studentCount, 0)

  function enter(id: string, path?: string) {
    context?.selectGroup(id)
    const back = searchParams.get('volver')
    // Solo rutas internas: `volver` llega por la URL y no debe poder mandar
    // al profesor a otro sitio.
    const target = path ?? (back && back.startsWith('/') && !back.startsWith('//') ? back : DEFAULT_PATH)
    navigate(target, { replace: true })
  }

  return (
    <div className="min-h-full bg-paper">
      <header className="flex items-center justify-between gap-6 bg-ink-950 px-8 py-4">
        <div>
          <p className="text-[15px] leading-tight font-semibold tracking-tight text-white">
            Prácticas Profesionales
          </p>
          <p className="mt-0.5 text-xs text-ink-400">Panel del profesor</p>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="max-w-56 truncate text-ink-300" title={profile?.email}>
            {profile?.full_name || profile?.email}
          </span>
          <button
            type="button"
            onClick={signOut}
            className="rounded-lg px-2.5 py-1.5 font-medium text-ink-400 transition-colors hover:bg-white/10 hover:text-white"
          >
            Cerrar sesión
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-8 py-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-ink-950">Mis grupos</h1>
            <p className="mt-1.5 text-sm text-ink-500">
              Elige un grupo para ver solo a sus alumnos. Puedes cambiarlo en cualquier momento
              desde el panel.
            </p>
          </div>
          <button
            type="button"
            onClick={() => enter(ALL_GROUPS, '/administrador/grupos')}
            className="rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm font-medium text-ink-700 shadow-sm hover:bg-ink-50"
          >
            Administrar grupos
          </button>
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-3">
          <input
            type="search"
            aria-label="Buscar grupo"
            placeholder="Buscar grupo…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className={`${FIELD_INPUT} w-72`}
          />
          <select
            aria-label="Periodo"
            value={activePeriod}
            onChange={(event) => setPeriod(event.target.value)}
            className={FIELD_INPUT}
          >
            {periods.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
            <option value="">Todos los periodos</option>
          </select>
          {!context?.loading && (
            <p className="text-sm text-ink-500">
              {visible.length} {visible.length === 1 ? 'grupo' : 'grupos'}
            </p>
          )}
        </div>

        {context?.error && (
          <p className="mb-4 text-sm text-red-700">
            No se pudieron cargar los grupos: {context.error}
          </p>
        )}

        {context?.loading ? (
          <p className="py-12 text-center text-sm text-ink-500">Cargando grupos…</p>
        ) : (
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <li>
              <AllGroupsCard
                groupCount={groups.length}
                studentCount={totalStudents}
                onSelect={() => enter(ALL_GROUPS)}
              />
            </li>
            {visible.map((group) => (
              <li key={group.id}>
                <GroupCard group={group} onSelect={() => enter(group.id)} />
              </li>
            ))}
          </ul>
        )}

        {!context?.loading && groups.length === 0 && (
          <p className="mt-6 text-sm text-ink-500">
            Todavía no hay grupos. Créalos en «Administrar grupos».
          </p>
        )}
      </main>
    </div>
  )
}

const CARD =
  'group flex h-full w-full flex-col overflow-hidden rounded-xl border border-ink-200 bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-2 focus-visible:ring-ink-900 focus-visible:outline-none'

/** Como en Blackboard: portada, cuántos alumnos, el grupo y abajo el maestro. */
function GroupCard({ group, onSelect }: { group: Group; onSelect: () => void }) {
  return (
    <button type="button" onClick={onSelect} className={CARD}>
      <GroupCover seed={group.id} title={group.periodCode} />
      <div className="flex flex-1 flex-col px-4 pt-3 pb-4">
        <p className="tnum text-xs text-ink-500">
          {group.studentCount} {group.studentCount === 1 ? 'alumno' : 'alumnos'}
        </p>
        <p className="mt-1 font-semibold text-ink-900 group-hover:underline">
          {formatSessionDay(group.sessionDay)} · {formatLanguage(group.language)}
        </p>
        <p className="mt-auto truncate border-t border-ink-100 pt-3 text-xs text-ink-600">
          {group.teacherName ?? group.teacherEmail}
        </p>
      </div>
    </button>
  )
}

function AllGroupsCard({
  groupCount,
  studentCount,
  onSelect,
}: {
  groupCount: number
  studentCount: number
  onSelect: () => void
}) {
  return (
    <button type="button" onClick={onSelect} className={CARD}>
      <div className="flex h-28 items-end bg-ink-900 px-4 pb-3">
        <span className="text-2xl font-semibold tracking-tight text-white">Todos</span>
      </div>
      <div className="flex flex-1 flex-col px-4 pt-3 pb-4">
        <p className="tnum text-xs text-ink-500">
          {studentCount} alumnos en {groupCount} {groupCount === 1 ? 'grupo' : 'grupos'}
        </p>
        <p className="mt-1 font-semibold text-ink-900 group-hover:underline">Todos mis grupos</p>
        <p className="mt-auto border-t border-ink-100 pt-3 text-xs text-ink-600">
          Todos los periodos, sin filtro de grupo
        </p>
      </div>
    </button>
  )
}
