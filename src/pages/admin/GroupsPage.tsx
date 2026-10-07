import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { Badge, Dash } from '../../components/Badge'
import { DataTable, type Column } from '../../components/DataTable'
import { Select } from '../../components/FilterBar'
import { useRepositoryQuery } from '../../data/hooks'
import { repository } from '../../data/repository'
import type { Group, Language, RegisteredStudent, SessionDay, Teacher } from '../../data/types'
import { ALL_GROUPS, useGroups } from '../../layouts/GroupProvider'
import { LANGUAGE_OPTIONS, SESSION_DAY_OPTIONS } from '../../lib/catalog'
import { formatGroupLabel, formatLanguage, formatSessionDay } from '../../lib/format'

const FIELD_INPUT =
  'rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm text-ink-900 shadow-sm focus:border-ink-400 focus:ring-2 focus:ring-ink-900/5 focus:outline-none'

const PRIMARY_BUTTON =
  'rounded-lg bg-ink-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-ink-800 disabled:cursor-not-allowed disabled:bg-ink-200 disabled:text-ink-400'

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
  const [search, setSearch] = useState('')

  const { data: teachers } = useRepositoryQuery(() => repository.getTeachers(), [] as Teacher[], [])

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

  async function handleCreate() {
    if (formError) return
    const created = await run(
      () =>
        repository.createGroup({
          periodCode,
          sessionDay: form.sessionDay as SessionDay,
          language: form.language as Language,
          teacherId,
        }),
      `Grupo ${periodCode} · ${formatSessionDay(form.sessionDay)} · ${formatLanguage(form.language)} creado.`,
    )
    if (created) setForm(EMPTY_FORM)
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
        teachers.length > 1 ? (
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
          <button
            type="button"
            className={LINK_BUTTON}
            onClick={() => void handleDelete(group)}
            disabled={sending || group.studentCount > 0}
            title={group.studentCount > 0 ? 'Solo se puede borrar un grupo sin alumnos' : undefined}
          >
            Borrar
          </button>
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
            disabled={sending || groups.length === 0}
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
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-ink-950">Administrar grupos</h1>
        <p className="mt-1.5 text-sm text-ink-500">
          Un grupo es un periodo, una frecuencia y un idioma con su maestro. Para trabajar con un
          grupo, elígelo en Mis grupos.
        </p>
      </header>

      {message && (
        <p className={`mb-4 text-sm ${message.tone === 'red' ? 'text-red-700' : 'text-emerald-700'}`}>
          {message.text}
        </p>
      )}

      <section className="mb-6 rounded-xl border border-ink-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-ink-900">Nuevo grupo</h2>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <input
            aria-label="Periodo"
            placeholder="Periodo (OT-26)"
            list="periodos-conocidos"
            value={form.periodCode}
            onChange={(event) => setForm({ ...form, periodCode: event.target.value })}
            className={`${FIELD_INPUT} w-40`}
          />
          <datalist id="periodos-conocidos">
            {knownPeriods.map((period) => (
              <option key={period} value={period} />
            ))}
          </datalist>
          <Select
            label="Frecuencia"
            value={form.sessionDay}
            options={SESSION_DAY_OPTIONS}
            onChange={(value) => setForm({ ...form, sessionDay: value })}
          />
          <Select
            label="Idioma"
            value={form.language}
            options={LANGUAGE_OPTIONS}
            onChange={(value) => setForm({ ...form, language: value })}
          />
          <Select
            label="Maestro"
            value={teacherId}
            options={teachers.map((teacher) => ({
              value: teacher.id,
              label: teacher.name ?? teacher.email,
            }))}
            onChange={(value) => setForm({ ...form, teacherId: value })}
          />
          <button
            type="button"
            disabled={!!formError || sending}
            onClick={() => void handleCreate()}
            className={PRIMARY_BUTTON}
          >
            {sending ? 'Guardando…' : 'Crear grupo'}
          </button>
        </div>
        {form.periodCode && formError && <p className="mt-3 text-sm text-ink-500">{formError}</p>}
      </section>

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
