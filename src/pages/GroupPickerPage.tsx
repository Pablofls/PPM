import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

import { useAuth } from '../auth/AuthProvider'
import { useColumnPreferences } from '../components/ColumnPicker'
import { DataTable, type Column } from '../components/DataTable'
import { GroupCover } from '../components/GroupCover'
import { ViewToggle, type ViewOption } from '../components/ViewToggle'
import { repository } from '../data/repository'
import type { Group } from '../data/types'
import { ALL_GROUPS, useGroups } from '../layouts/GroupProvider'
import { formatGroupLabel, formatLanguage, formatSessionDay } from '../lib/format'

/** Adonde se entra si no se venía de ninguna pantalla en particular. */
const DEFAULT_PATH = '/modulo1/datos-demograficos'

/** El periodo que el profesor eligió la última vez (`''` = todos los periodos). */
const PERIOD_KEY = 'ppm.periodo'

/** Tarjetas o tabla, la última que eligió el profesor. */
const VIEW_KEY = 'ppm.misGrupos.vista'

type PickerView = 'tarjetas' | 'tabla'

function readStoredView(): PickerView {
  try {
    return localStorage.getItem(VIEW_KEY) === 'tabla' ? 'tabla' : 'tarjetas'
  } catch {
    return 'tarjetas'
  }
}

const GROUP_COLUMNS: Column<Group>[] = [
  {
    key: 'group',
    header: 'Grupo',
    width: 'min-w-56',
    sticky: true,
    render: (group) => <span className="font-medium text-ink-900">{formatGroupLabel(group)}</span>,
  },
  { key: 'period', header: 'Periodo', render: (group) => group.periodCode },
  { key: 'sessionDay', header: 'Frecuencia', render: (group) => formatSessionDay(group.sessionDay) },
  { key: 'language', header: 'Idioma', render: (group) => formatLanguage(group.language) },
  {
    key: 'teacher',
    header: 'Maestro',
    width: 'min-w-48',
    render: (group) => group.teacherName ?? group.teacherEmail,
  },
  {
    key: 'students',
    header: 'Alumnos',
    render: (group) => <span className="tnum">{group.studentCount}</span>,
  },
]

function readStoredPeriod(): string | null {
  try {
    return localStorage.getItem(PERIOD_KEY)
  } catch {
    return null
  }
}

const FIELD_INPUT =
  'rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm text-ink-900 shadow-sm focus:border-ink-400 focus:ring-2 focus:ring-ink-900/5 focus:outline-none'

/**
 * Mis grupos: la pantalla de inicio del profesor, como la lista de materias
 * de Blackboard. La barra de arriba y el menú Configuración son de `HomeShell`. Cada grupo es una tarjeta; al elegir una se entra al panel
 * ya filtrado a ese grupo. «Todos mis grupos» entra sin filtro.
 *
 * El panel (`AppShell`) manda aquí a quien todavía no eligió grupo en esta
 * sesión, con `?volver=` para regresarlo a la pantalla que había abierto.
 */
export function GroupPickerPage() {
  const context = useGroups()
  const { activeRole, viewingAsAdmin } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const groups = useMemo(() => context?.groups ?? [], [context?.groups])

  const periods = useMemo(
    // `v_groups` ya llega del periodo más reciente al más antiguo.
    () => [...new Set(groups.map((group) => group.periodCode))],
    [groups],
  )
  // `null` = el profesor no ha elegido nunca: se muestra el periodo más
  // reciente, que es el que está dando clase. Lo que elige se recuerda en el
  // navegador (también «Todos los periodos»), para no tener que repetirlo.
  const [period, setPeriod] = useState<string | null>(readStoredPeriod)
  // Un periodo guardado que ya no existe en la lista cae al más reciente.
  const activePeriod =
    period !== null && (period === '' || periods.includes(period)) ? period : (periods[0] ?? '')

  function choosePeriod(value: string) {
    setPeriod(value)
    try {
      localStorage.setItem(PERIOD_KEY, value)
    } catch {
      // Sin almacenamiento la elección dura lo que dure la pantalla.
    }
  }
  const [search, setSearch] = useState('')
  const [view, setView] = useState<PickerView>(readStoredView)
  const { visibleColumns, picker } = useColumnPreferences('mis-grupos', GROUP_COLUMNS)

  function chooseView(value: PickerView) {
    setView(value)
    try {
      localStorage.setItem(VIEW_KEY, value)
    } catch {
      // Sin almacenamiento la vista dura lo que dure la pantalla.
    }
  }

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

  function enter(id: string) {
    context?.selectGroup(id)
    const back = searchParams.get('volver')
    // Solo rutas internas: `volver` llega por la URL y no debe poder mandar
    // al profesor a otro sitio.
    const target = back && back.startsWith('/') && !back.startsWith('//') ? back : DEFAULT_PATH
    navigate(target, { replace: true })
  }

  return (
    // `w-full`: dentro del flex de `HomeShell`, `mx-auto` solo encogería la
    // página al ancho de su contenido, y tarjetas y tabla miden distinto.
    <main className="mx-auto w-full max-w-6xl px-8 py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink-950">Mis grupos</h1>
          <p className="mt-1.5 text-sm text-ink-500">
            Elige un grupo para ver solo a sus alumnos. Puedes cambiarlo en cualquier momento
            desde el panel.
          </p>
        </div>
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
          onChange={(event) => choosePeriod(event.target.value)}
          className={FIELD_INPUT}
        >
          {periods.map((code) => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
          <option value="">Todos los periodos</option>
        </select>
        <ViewToggle options={VIEW_OPTIONS} value={view} onChange={chooseView} />
        {view === 'tabla' && picker}
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

      {view === 'tabla' ? (
        <>
          <button
            type="button"
            onClick={() => enter(ALL_GROUPS)}
            className="mb-3 flex w-full items-center justify-between rounded-xl border border-ink-200 bg-white px-4 py-3 text-left shadow-sm transition-colors hover:bg-ink-50"
          >
            <span className="font-semibold text-ink-900">Todos mis grupos</span>
            <span className="tnum text-sm text-ink-500">
              {totalStudents} alumnos en {groups.length} {groups.length === 1 ? 'grupo' : 'grupos'} ·
              sin filtro de grupo
            </span>
          </button>
          <DataTable
            columns={visibleColumns}
            rows={visible}
            rowKey={(group) => group.id}
            loading={context?.loading}
            isConnected={repository.isConnected}
            error={context?.error}
            pageSize={0}
            onRowClick={(group) => enter(group.id)}
          />
        </>
      ) : context?.loading ? (
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
          {viewingAsAdmin
            ? 'Todavía no hay grupos. Créalos en Configuración → Administrar grupos.'
            : activeRole === 'coordinador'
              ? 'Todavía no tienes maestros asignados, o tus maestros no tienen grupos. Pídelo a un administrador.'
              : 'Todavía no tienes grupos asignados. Pídelo a un administrador.'}
        </p>
      )}
    </main>
  )
}

/** Tarjetas o tabla, al lado del periodo. */
const VIEW_OPTIONS: ViewOption<PickerView>[] = [
  { value: 'tarjetas', label: 'Tarjetas', icon: 'M2.5 2.5h4.5v4.5h-4.5zM9 2.5h4.5v4.5H9zM2.5 9h4.5v4.5h-4.5zM9 9h4.5v4.5H9z' },
  { value: 'tabla', label: 'Tabla', icon: 'M2.5 3h11M2.5 6.33h11M2.5 9.67h11M2.5 13h11' },
]

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
