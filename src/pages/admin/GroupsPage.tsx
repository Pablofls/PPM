import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { Badge, Dash } from '../../components/Badge'
import { DataTable, type Column } from '../../components/DataTable'
import { Modal } from '../../components/Modal'
import { useRepositoryQuery } from '../../data/hooks'
import { repository } from '../../data/repository'
import type { Group, Language, RegisteredStudent, SessionDay, Teacher } from '../../data/types'
import { ALL_GROUPS, useGroups } from '../../layouts/GroupProvider'
import { useAuth } from '../../auth/AuthProvider'
import { usePermissions } from '../../auth/PermissionsProvider'
import { LANGUAGE_OPTIONS, SESSION_DAY_OPTIONS, type FilterOption } from '../../lib/catalog'
import { formatGroupLabel, formatLanguage, formatSessionDay } from '../../lib/format'

const FIELD_INPUT =
  'rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm text-ink-900 shadow-sm focus:border-ink-400 focus:ring-2 focus:ring-ink-900/5 focus:outline-none'

const PRIMARY_BUTTON =
  'rounded-lg bg-ink-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-ink-800 disabled:cursor-not-allowed disabled:bg-ink-200 disabled:text-ink-400'

const SECONDARY_BUTTON =
  'rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm font-medium text-ink-700 shadow-sm hover:bg-ink-50 disabled:cursor-not-allowed disabled:text-ink-400'

const LABEL = 'text-[11px] font-semibold tracking-wider text-ink-500 uppercase'

const LINK_BUTTON =
  'rounded-lg px-2.5 py-1.5 text-sm font-medium text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900 disabled:cursor-not-allowed disabled:text-ink-300 disabled:hover:bg-transparent'

const PERIOD_FORMAT = /^[A-Z]{2}-\d{2}$/

interface GroupForm {
  periodCode: string
  sessionDay: string
  language: string
  teacherId: string
}

const EMPTY_FORM: GroupForm = { periodCode: '', sessionDay: '', language: '', teacherId: '' }

/**
 * Grupos: cada alumno pertenece a la clase de un maestro (`0032`).
 *
 * Un grupo es periodo + frecuencia + idioma + maestro. Los alumnos que llegan
 * por el 1.0 se inscriben solos cuando su respuesta coincide con un único
 * grupo; los demás aparecen aquí como «sin grupo» para asignarlos a mano.
 */
export function GroupsPage() {
  const groupContext = useGroups()
  const navigate = useNavigate()
  const groups = groupContext?.groups ?? []
  const [form, setForm] = useState<GroupForm>(EMPTY_FORM)
  const [sending, setSending] = useState(false)
  const [message, setMessage] = useState<{ tone: 'red' | 'green'; text: string } | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [onlyUnassigned, setOnlyUnassigned] = useState(true)
  const [creating, setCreating] = useState(false)
  const [touched, setTouched] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const { viewingAsAdmin, profile, activeRole } = useAuth()
  // Crear, mover, reasignar y borrar exigen «Puede editar» (0038); quien no es
  // admin lo hace solo con sus grupos y alumnos (la base lo hace cumplir).
  const canEdit = usePermissions().can('grupos', 'edicion')

  const { data: allTeachers } = useRepositoryQuery(
    () => (viewingAsAdmin ? repository.getTeachers() : Promise.resolve([] as Teacher[])),
    [] as Teacher[],
    [viewingAsAdmin],
  )
  // Un coordinador puede crear grupos para sus maestros aunque todavía no
  // tengan ninguno: se leen sus cuentas (profiles_select_scope, 0036).
  const { data: coordinatedTeachers } = useRepositoryQuery(
    async () =>
      !viewingAsAdmin && activeRole === 'coordinador' && profile
        ? repository.getUsersByIds(await repository.getCoordinatedTeacherIds(profile.id))
        : ([] as Teacher[]),
    [] as Teacher[],
    [viewingAsAdmin, activeRole, profile?.id],
  )

  // Fuera de la vista de admin no se leen los roles de los demás: los maestros
  // posibles son uno mismo (si es maestro), los que coordina y los de los
  // grupos que ya ve.
  const teachers = useMemo<Teacher[]>(() => {
    if (viewingAsAdmin) return allTeachers
    const byId = new Map<string, Teacher>()
    if (activeRole === 'maestro' && profile) {
      byId.set(profile.id, {
        id: profile.id,
        name: [profile.first_name, profile.last_name].filter(Boolean).join(' ') || null,
        email: profile.email,
      })
    }
    for (const teacher of coordinatedTeachers) byId.set(teacher.id, teacher)
    for (const group of groups) {
      if (!byId.has(group.teacherId)) {
        byId.set(group.teacherId, { id: group.teacherId, name: group.teacherName, email: group.teacherEmail })
      }
    }
    return [...byId.values()]
  }, [viewingAsAdmin, allTeachers, coordinatedTeachers, activeRole, profile, groups])

  const {
    data: students,
    loading,
    isConnected,
    error,
  } = useRepositoryQuery(() => repository.getRegisteredStudents(), [] as RegisteredStudent[], [
    refreshKey,
  ])

  const groupById = useMemo(() => new Map(groups.map((group) => [group.id, group])), [groups])
  const unassignedCount = students.filter((student) => !student.groupId).length
  // Sin alumnos sin grupo, «solo sin grupo» dejaría la tabla vacía: se ignora.
  const showOnlyUnassigned = onlyUnassigned && unassignedCount > 0

  const visibleStudents = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return students.filter(
      (student) =>
        (!showOnlyUnassigned || !student.groupId) &&
        (!needle ||
          student.email.toLowerCase().includes(needle) ||
          (student.fullName ?? '').toLowerCase().includes(needle)),
    )
  }, [students, showOnlyUnassigned, search])

  // Con un solo maestro, ya está elegido.
  const teacherId = form.teacherId || (teachers.length === 1 ? teachers[0].id : '')
  const periodCode = form.periodCode.trim().toUpperCase()
  const formError = !PERIOD_FORMAT.test(periodCode)
    ? 'El periodo lleva el formato OT-26.'
    : !form.sessionDay || !form.language || !teacherId
      ? 'Elige frecuencia, idioma y maestro.'
      : null

  const knownPeriods = useMemo(
    () => [...new Set(groups.map((group) => group.periodCode))],
    [groups],
  )

  function refresh() {
    setRefreshKey((key) => key + 1)
    groupContext?.refetch()
  }

  async function run(action: () => Promise<void>, success: string) {
    setSending(true)
    setMessage(null)
    try {
      await action()
      setMessage({ tone: 'green', text: success })
      refresh()
      return true
    } catch (cause) {
      setMessage({
        tone: 'red',
        text: cause instanceof Error ? cause.message : 'No se pudo completar la operación.',
      })
      return false
    } finally {
      setSending(false)
    }
  }

  function closeCreate() {
    setCreating(false)
    setForm(EMPTY_FORM)
    setTouched(false)
    setCreateError(null)
  }

  // El error de crear se muestra dentro de la ventana (que sigue abierta),
  // no en el aviso de la página.
  async function handleCreate() {
    setTouched(true)
    if (formError) return
    setSending(true)
    setCreateError(null)
    try {
      await repository.createGroup({
        periodCode,
        sessionDay: form.sessionDay as SessionDay,
        language: form.language as Language,
        teacherId,
      })
      closeCreate()
      setMessage({
        tone: 'green',
        text: `Grupo ${periodCode} · ${formatSessionDay(form.sessionDay)} · ${formatLanguage(form.language)} creado.`,
      })
      refresh()
    } catch (cause) {
      setCreateError(cause instanceof Error ? cause.message : 'No se pudo crear el grupo.')
    } finally {
      setSending(false)
    }
  }

  async function handleDelete(group: Group) {
    if (!window.confirm(`¿Borrar el grupo ${formatGroupLabel(group)}?`)) return
    if (groupContext?.selectedGroupId === group.id) groupContext.selectGroup(ALL_GROUPS)
    await run(() => repository.deleteGroup(group.id), `Grupo ${formatGroupLabel(group)} borrado.`)
  }

  async function handleMove(student: RegisteredStudent, groupId: string) {
    const group = groupById.get(groupId)
    if (!group) return
    await run(
      () => repository.moveStudentToGroup(student.studentId, groupId),
      `${student.fullName ?? student.email} ahora está en ${formatGroupLabel(group)}.`,
    )
  }

  const groupColumns: Column<Group>[] = [
    {
      key: 'group',
      header: 'Grupo',
      width: 'min-w-56',
      sticky: true,
      render: (group) => <span className="font-medium text-ink-900">{formatGroupLabel(group)}</span>,
    },
    {
      key: 'teacher',
      header: 'Maestro',
      width: 'min-w-48',
      // Reasignar el maestro: con uno solo no hay a quién, y se muestra el nombre.
      render: (group) =>
        canEdit && teachers.length > 1 ? (
          <select
            aria-label={`Maestro de ${formatGroupLabel(group)}`}
            value={group.teacherId}
            disabled={sending}
            onChange={(event) => {
              const teacher = teachers.find((candidate) => candidate.id === event.target.value)
              void run(
                () => repository.setGroupTeacher(group.id, event.target.value),
                `${formatGroupLabel(group)} ahora es de ${teacher?.name ?? teacher?.email ?? 'otro maestro'}.`,
              )
            }}
            className={`${FIELD_INPUT} py-1.5`}
          >
            {/* Un maestro desactivado ya no está en la lista: se muestra igual,
                para no aparentar que el grupo es de otro. */}
            {!teachers.some((teacher) => teacher.id === group.teacherId) && (
              <option value={group.teacherId} disabled>
                {group.teacherName ?? group.teacherEmail} (no disponible)
              </option>
            )}
            {teachers.map((teacher) => (
              <option key={teacher.id} value={teacher.id}>
                {teacher.name ?? teacher.email}
              </option>
            ))}
          </select>
        ) : (
          (group.teacherName ?? group.teacherEmail)
        ),
    },
    { key: 'count', header: 'Alumnos', render: (group) => <span className="tnum">{group.studentCount}</span> },
    {
      key: 'actions',
      header: '',
      render: (group) => (
        <div className="flex gap-1">
          <button
            type="button"
            className={LINK_BUTTON}
            onClick={() => {
              groupContext?.selectGroup(group.id)
              navigate('/modulo1/datos-demograficos')
            }}
          >
            Entrar al grupo
          </button>
          {canEdit && (
            <button
              type="button"
              className={LINK_BUTTON}
              onClick={() => void handleDelete(group)}
              disabled={sending || group.studentCount > 0}
              title={group.studentCount > 0 ? 'Solo se puede borrar un grupo sin alumnos' : undefined}
            >
              Borrar
            </button>
          )}
        </div>
      ),
    },
  ]

  const studentColumns: Column<RegisteredStudent>[] = [
    { key: 'email', header: 'Correo', width: 'min-w-64', sticky: true, render: (row) => row.email },
    { key: 'name', header: 'Nombre', width: 'min-w-48', render: (row) => row.fullName ?? <Dash /> },
    {
      // Sin grupo, esto es lo que contestó en el 1.0 (o lo que se registró):
      // la pista para saber a qué grupo va.
      key: 'answered',
      header: 'Periodo · Frecuencia · Idioma',
      width: 'min-w-56',
      render: (row) =>
        row.periodCode || row.sessionDay || row.language ? (
          [row.periodCode, formatSessionDay(row.sessionDay), formatLanguage(row.language)]
            .map((value) => value || '—')
            .join(' · ')
        ) : (
          <Dash />
        ),
    },
    {
      key: 'group',
      header: 'Grupo',
      width: 'min-w-72',
      render: (row) => (
        <div className="flex items-center gap-2">
          {!row.groupId && <Badge tone="red">Sin grupo</Badge>}
          <select
            aria-label={`Grupo de ${row.email}`}
            value={row.groupId ?? ''}
            disabled={!canEdit || sending || groups.length === 0}
            onChange={(event) => void handleMove(row, event.target.value)}
            className={`${FIELD_INPUT} py-1.5`}
          >
            {!row.groupId && (
              <option value="" disabled>
                Asignar a…
              </option>
            )}
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {formatGroupLabel(group)}
                {teachers.length > 1 ? ` — ${group.teacherName ?? group.teacherEmail}` : ''}
              </option>
            ))}
          </select>
        </div>
      ),
    },
  ]

  return (
    <>
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink-950">Administrar grupos</h1>
          <p className="mt-1.5 text-sm text-ink-500">
            Un grupo es un periodo, una frecuencia y un idioma con su maestro. Para trabajar con un
            grupo, elígelo en Mis grupos.
          </p>
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={() => {
              setMessage(null)
              setCreating(true)
            }}
            className="rounded-lg bg-accent-400 px-4 py-2.5 text-sm font-semibold text-ink-900 shadow-sm transition-colors hover:bg-accent-500"
          >
            + Nuevo grupo
          </button>
        )}
      </header>

      {message && (
        <p
          role="status"
          className={`mb-4 rounded-lg px-3 py-2 text-sm ${
            message.tone === 'red' ? 'bg-red-50 text-red-800' : 'bg-emerald-50 text-emerald-800'
          }`}
        >
          {message.text}
        </p>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat value={groups.length} label="Grupos" tone="text-ink-950" />
        <Stat value={students.length - unassignedCount} label="Alumnos con grupo" tone="text-emerald-700" />
        <Stat value={unassignedCount} label="Sin grupo" tone="text-red-700" />
      </div>

      {creating && (
        <Modal
          title="Nuevo grupo"
          onClose={closeCreate}
          footer={
            <>
              <button type="button" onClick={closeCreate} className={SECONDARY_BUTTON}>
                Cancelar
              </button>
              <button
                type="button"
                disabled={sending || (touched && !!formError)}
                onClick={() => void handleCreate()}
                className={PRIMARY_BUTTON}
              >
                {sending ? 'Creando…' : 'Crear grupo'}
              </button>
            </>
          }
        >
          <form
            onSubmit={(event) => {
              event.preventDefault()
              void handleCreate()
            }}
            className="space-y-5"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className={LABEL}>Periodo</span>
                <input
                  placeholder="OT-26"
                  list="periodos-conocidos"
                  value={form.periodCode}
                  onChange={(event) => setForm({ ...form, periodCode: event.target.value })}
                  autoComplete="off"
                  className={`${FIELD_INPUT} mt-1.5 w-full`}
                />
                <datalist id="periodos-conocidos">
                  {knownPeriods.map((period) => (
                    <option key={period} value={period} />
                  ))}
                </datalist>
              </label>
              <FieldSelect
                label="Maestro"
                value={teacherId}
                options={teachers.map((teacher) => ({
                  value: teacher.id,
                  label: teacher.name ?? teacher.email,
                }))}
                onChange={(value) => setForm({ ...form, teacherId: value })}
              />
              <FieldSelect
                label="Frecuencia"
                value={form.sessionDay}
                options={SESSION_DAY_OPTIONS}
                onChange={(value) => setForm({ ...form, sessionDay: value })}
              />
              <FieldSelect
                label="Idioma"
                value={form.language}
                options={LANGUAGE_OPTIONS}
                onChange={(value) => setForm({ ...form, language: value })}
              />
            </div>
            {teachers.length === 0 && (
              <p role="alert" className="rounded-lg bg-accent-100 px-3 py-2 text-sm text-ink-800">
                {viewingAsAdmin
                  ? 'No hay cuentas activas con el rol de maestro. Crea una en Usuarios y permisos y vuelve.'
                  : 'No tienes maestros a quienes asignar un grupo.'}
              </p>
            )}
            <p className="text-xs text-ink-500">
              Un periodo nuevo se da de alta solo. Si hay alumnos sin grupo que contestaron
              exactamente este periodo, frecuencia e idioma, quedan inscritos al crearlo.
            </p>
            {(createError || (touched && formError)) && (
              <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
                {createError ?? formError}
              </p>
            )}
            <button type="submit" hidden />
          </form>
        </Modal>
      )}

      <section className="mb-8">
        <DataTable
          columns={groupColumns}
          rows={groups}
          rowKey={(group) => group.id}
          loading={groupContext?.loading}
          isConnected={isConnected}
          error={groupContext?.error}
        />
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-ink-950">Alumnos</h2>
            <p className="mt-0.5 text-sm text-ink-500">
              {unassignedCount === 0
                ? 'Todos los alumnos tienen grupo.'
                : `${unassignedCount} ${unassignedCount === 1 ? 'alumno sin grupo' : 'alumnos sin grupo'}.`}{' '}
              Cambiar el grupo reemplaza el de ese mismo periodo; un grupo de otro periodo se agrega
              como su nueva inscripción.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="search"
              aria-label="Buscar alumno"
              placeholder="Buscar por correo o nombre…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className={`${FIELD_INPUT} w-64`}
            />
            {unassignedCount > 0 && (
              <label className="flex items-center gap-2 text-sm text-ink-600">
                <input
                  type="checkbox"
                  checked={onlyUnassigned}
                  onChange={(event) => setOnlyUnassigned(event.target.checked)}
                />
                Solo sin grupo
              </label>
            )}
          </div>
        </div>
        <DataTable
          columns={studentColumns}
          rows={visibleStudents}
          rowKey={(row) => row.studentId}
          rowAlert={(row) => !row.groupId}
          loading={loading}
          isConnected={isConnected}
          error={error}
        />
      </section>
    </>
  )
}

function Stat({ value, label, tone }: { value: number; label: string; tone: string }) {
  return (
    <div className="rounded-xl border border-ink-200 bg-white px-5 py-4 shadow-sm">
      <p className={`tnum text-3xl font-semibold ${tone}`}>{value}</p>
      <p className="mt-1 text-sm text-ink-500">{label}</p>
    </div>
  )
}

function FieldSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: FilterOption[]
  onChange: (value: string) => void
}) {
  return (
    <label className="block">
      <span className={LABEL}>{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`${FIELD_INPUT} mt-1.5 w-full`}
      >
        <option value="">Elige…</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}
