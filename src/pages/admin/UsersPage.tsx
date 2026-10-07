import { useMemo, useState, type FormEvent } from 'react'

import { ROLE_LABELS, STAFF_ROLES, useAuth } from '../../auth/AuthProvider'
import { Badge, Dash } from '../../components/Badge'
import { DataTable, type Column } from '../../components/DataTable'
import { PasswordInput } from '../../components/PasswordInput'
import { useRepositoryQuery } from '../../data/hooks'
import { repository } from '../../data/repository'
import type { RoleCode, StaffAccountInput, UserAccount } from '../../data/types'

const FIELD_INPUT =
  'rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm text-ink-900 shadow-sm focus:border-ink-400 focus:ring-2 focus:ring-ink-900/5 focus:outline-none'

const PRIMARY_BUTTON =
  'rounded-lg bg-ink-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-ink-800 disabled:cursor-not-allowed disabled:bg-ink-200 disabled:text-ink-400'

const SECONDARY_BUTTON =
  'rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm font-medium text-ink-700 shadow-sm hover:bg-ink-50 disabled:cursor-not-allowed disabled:text-ink-400'

const MIN_PASSWORD = 8

const EMPTY_FORM: StaffAccountInput = {
  email: '',
  firstName: '',
  lastName: '',
  password: '',
  roles: [],
}

type Message = { tone: 'red' | 'green'; text: string } | null

function fullName(user: Pick<UserAccount, 'firstName' | 'lastName'>): string | null {
  return [user.firstName, user.lastName].filter(Boolean).join(' ') || null
}

/**
 * Configuración → Usuarios: las cuentas del panel (maestros, coordinadores y
 * administradores) y las pendientes de autorización. Los alumnos tienen su
 * propia pantalla, Alumnos registrados.
 *
 * Todo pasa por funciones admin-only (`0037`); las reglas —un alumno no tiene
 * otro rol, nadie se quita su propio admin, no se quita un rol en uso— las
 * hace cumplir la base, y aquí solo se muestra su mensaje.
 */
export function UsersPage() {
  const [form, setForm] = useState<StaffAccountInput>(EMPTY_FORM)
  const [creating, setCreating] = useState(false)
  const [message, setMessage] = useState<Message>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [search, setSearch] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)

  const {
    data: users,
    loading,
    isConnected,
    error,
  } = useRepositoryQuery(() => repository.getUsers(), [] as UserAccount[], [refreshKey])

  const refresh = () => setRefreshKey((key) => key + 1)

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase()
    if (!needle) return users
    return users.filter((user) =>
      [fullName(user) ?? '', user.email].some((text) => text.toLowerCase().includes(needle)),
    )
  }, [users, search])

  const editing = users.find((user) => user.id === editingId) ?? null
  const teachers = users.filter((user) => user.isActive && user.roles.includes('maestro'))

  const formError = !form.firstName.trim() || !form.lastName.trim()
    ? 'Escribe el nombre y el apellido.'
    : !/^\S+@\S+\.\S+$/.test(form.email.trim())
      ? 'Escribe un correo válido.'
      : form.password.length < MIN_PASSWORD
        ? `La contraseña inicial debe tener al menos ${MIN_PASSWORD} caracteres.`
        : form.roles.length === 0
          ? 'Elige al menos un rol.'
          : null

  async function handleCreate(event: FormEvent) {
    event.preventDefault()
    if (formError) return
    setCreating(true)
    setMessage(null)
    try {
      await repository.createStaffAccount({ ...form, email: form.email.trim() })
      setMessage({
        tone: 'green',
        text: `Cuenta de ${form.firstName.trim()} ${form.lastName.trim()} creada. Pásale su correo y la contraseña inicial; la puede cambiar en Mi perfil.`,
      })
      setForm(EMPTY_FORM)
      refresh()
    } catch (cause) {
      setMessage({ tone: 'red', text: cause instanceof Error ? cause.message : 'No se pudo crear la cuenta.' })
    } finally {
      setCreating(false)
    }
  }

  const columns: Column<UserAccount>[] = [
    {
      key: 'name',
      header: 'Nombre',
      width: 'min-w-52',
      sticky: true,
      render: (user) =>
        fullName(user) ? <span className="font-medium text-ink-900">{fullName(user)}</span> : <Dash />,
    },
    { key: 'email', header: 'Correo', width: 'min-w-64', render: (user) => user.email },
    {
      key: 'roles',
      header: 'Roles',
      width: 'min-w-56',
      render: (user) =>
        user.roles.length ? (
          <div className="flex flex-wrap gap-1">
            {user.roles.map((role) => (
              <Badge key={role} tone={role === 'admin' ? 'violet' : role === 'coordinador' ? 'blue' : 'green'}>
                {ROLE_LABELS[role]}
              </Badge>
            ))}
          </div>
        ) : (
          <Badge tone="amber">Pendiente</Badge>
        ),
    },
    {
      key: 'status',
      header: 'Estado',
      render: (user) =>
        user.isActive ? <Badge tone="green">Activa</Badge> : <Badge tone="red">Desactivada</Badge>,
    },
    {
      key: 'actions',
      header: '',
      render: (user) => (
        <button
          type="button"
          onClick={() => {
            setMessage(null)
            setEditingId(user.id === editingId ? null : user.id)
          }}
          className="rounded-lg px-2.5 py-1.5 text-sm font-medium text-ink-500 hover:bg-ink-100 hover:text-ink-900"
        >
          {user.id === editingId ? 'Cerrar' : 'Editar'}
        </button>
      ),
    },
  ]

  return (
    <>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-ink-950">Usuarios</h1>
        <p className="mt-1.5 text-sm text-ink-500">
          Maestros, coordinadores y administradores: crea sus cuentas, asigna sus roles y, a cada
          coordinador, los maestros que supervisa. Los alumnos están en Alumnos registrados.
        </p>
      </header>

      {message && (
        <p className={`mb-4 text-sm ${message.tone === 'red' ? 'text-red-700' : 'text-emerald-700'}`}>
          {message.text}
        </p>
      )}

      <form
        onSubmit={handleCreate}
        className="mb-6 rounded-xl border border-ink-200 bg-white p-5 shadow-sm"
      >
        <h2 className="text-sm font-semibold text-ink-900">Nuevo usuario</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <input
            aria-label="Nombre"
            placeholder="Nombre"
            value={form.firstName}
            onChange={(event) => setForm({ ...form, firstName: event.target.value })}
            className={FIELD_INPUT}
          />
          <input
            aria-label="Apellido"
            placeholder="Apellido"
            value={form.lastName}
            onChange={(event) => setForm({ ...form, lastName: event.target.value })}
            className={FIELD_INPUT}
          />
          <input
            aria-label="Correo"
            type="email"
            placeholder="Correo"
            value={form.email}
            onChange={(event) => setForm({ ...form, email: event.target.value })}
            className={FIELD_INPUT}
          />
          <div className="[&>div]:mt-0">
            <PasswordInput
              value={form.password}
              onChange={(password) => setForm({ ...form, password })}
              minLength={MIN_PASSWORD}
              autoComplete="new-password"
              placeholder="Contraseña inicial"
              ariaLabel="Contraseña inicial"
            />
          </div>
        </div>
        <RoleCheckboxes
          value={form.roles}
          onChange={(roles) => setForm({ ...form, roles })}
        />
        <div className="mt-4 flex items-center gap-3">
          <button type="submit" disabled={!!formError || creating} className={PRIMARY_BUTTON}>
            {creating ? 'Creando…' : 'Crear usuario'}
          </button>
          {(form.firstName || form.email) && formError && (
            <p className="text-sm text-ink-500">{formError}</p>
          )}
        </div>
      </form>

      {editing && (
        <UserEditor
          key={editing.id}
          user={editing}
          teachers={teachers}
          onMessage={setMessage}
          onChanged={refresh}
          onClose={() => setEditingId(null)}
        />
      )}

      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight text-ink-950">Cuentas</h2>
        <input
          type="search"
          aria-label="Buscar usuario"
          placeholder="Buscar por nombre o correo…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className={`${FIELD_INPUT} w-72`}
        />
      </div>
      <DataTable
        columns={columns}
        rows={visible}
        rowKey={(user) => user.id}
        rowAlert={(user) => !user.isActive || user.roles.length === 0}
        loading={loading}
        isConnected={isConnected}
        error={error}
      />
    </>
  )
}

function RoleCheckboxes({
  value,
  onChange,
}: {
  value: RoleCode[]
  onChange: (roles: RoleCode[]) => void
}) {
  return (
    <fieldset className="mt-4">
      <legend className="text-sm text-ink-700">Roles</legend>
      <div className="mt-2 flex flex-wrap gap-4">
        {STAFF_ROLES.map((role) => (
          <label key={role} className="flex items-center gap-2 text-sm text-ink-800">
            <input
              type="checkbox"
              checked={value.includes(role)}
              onChange={(event) =>
                onChange(
                  event.target.checked
                    ? STAFF_ROLES.filter((r) => r === role || value.includes(r))
                    : value.filter((r) => r !== role),
                )
              }
            />
            {ROLE_LABELS[role]}
          </label>
        ))}
      </div>
    </fieldset>
  )
}

/** Edición de una cuenta: nombre, roles, maestros (si coordina), contraseña y estado. */
function UserEditor({
  user,
  teachers,
  onMessage,
  onChanged,
  onClose,
}: {
  user: UserAccount
  teachers: UserAccount[]
  onMessage: (message: Message) => void
  onChanged: () => void
  onClose: () => void
}) {
  const { profile } = useAuth()
  const isSelf = profile?.id === user.id
  const [firstName, setFirstName] = useState(user.firstName ?? '')
  const [lastName, setLastName] = useState(user.lastName ?? '')
  const [roles, setRoles] = useState<RoleCode[]>(user.roles)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  const isCoordinator = user.roles.includes('coordinador')
  const { data: savedTeachers } = useRepositoryQuery(
    () => (isCoordinator ? repository.getCoordinatedTeacherIds(user.id) : Promise.resolve([] as string[])),
    [] as string[],
    [user.id, isCoordinator],
  )
  const [assigned, setAssigned] = useState<string[] | null>(null)
  const assignedTeachers = assigned ?? savedTeachers

  async function run(action: () => Promise<void>, success: string) {
    setBusy(true)
    onMessage(null)
    try {
      await action()
      onMessage({ tone: 'green', text: success })
      onChanged()
    } catch (cause) {
      onMessage({ tone: 'red', text: cause instanceof Error ? cause.message : 'No se pudo guardar.' })
    } finally {
      setBusy(false)
    }
  }

  const name = fullName(user) ?? user.email
  const rolesChanged = [...roles].sort().join() !== [...user.roles].sort().join()

  return (
    <section className="mb-6 rounded-xl border border-ink-300 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-ink-950">{name}</h2>
          <p className="text-sm text-ink-500">{user.email}</p>
        </div>
        <button type="button" onClick={onClose} className={SECONDARY_BUTTON}>
          Cerrar
        </button>
      </div>

      <div className="mt-5 grid gap-6 lg:grid-cols-2">
        <div>
          <h3 className="text-sm font-semibold text-ink-900">Nombre</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            <input
              aria-label="Nombre"
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
              className={`${FIELD_INPUT} w-40`}
            />
            <input
              aria-label="Apellido"
              value={lastName}
              onChange={(event) => setLastName(event.target.value)}
              className={`${FIELD_INPUT} w-48`}
            />
            <button
              type="button"
              disabled={busy || !firstName.trim() || !lastName.trim()}
              onClick={() =>
                void run(
                  () => repository.updateUserName(user.id, firstName, lastName),
                  'Nombre guardado.',
                )
              }
              className={SECONDARY_BUTTON}
            >
              Guardar
            </button>
          </div>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-ink-900">Roles</h3>
          <div className="-mt-2">
            <RoleCheckboxes value={roles} onChange={setRoles} />
          </div>
          <button
            type="button"
            disabled={busy || !rolesChanged}
            onClick={() =>
              void run(() => repository.setUserRoles(user.id, roles), `Roles de ${name} guardados.`)
            }
            className={`${SECONDARY_BUTTON} mt-3`}
          >
            Guardar roles
          </button>
        </div>

        {isCoordinator && (
          <div className="lg:col-span-2">
            <h3 className="text-sm font-semibold text-ink-900">Maestros que supervisa</h3>
            {teachers.filter((teacher) => teacher.id !== user.id).length === 0 ? (
              <p className="mt-2 text-sm text-ink-500">Todavía no hay cuentas con el rol de maestro.</p>
            ) : (
              <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
                {teachers
                  .filter((teacher) => teacher.id !== user.id)
                  .map((teacher) => (
                    <label key={teacher.id} className="flex items-center gap-2 text-sm text-ink-800">
                      <input
                        type="checkbox"
                        checked={assignedTeachers.includes(teacher.id)}
                        onChange={(event) =>
                          setAssigned(
                            event.target.checked
                              ? [...assignedTeachers, teacher.id]
                              : assignedTeachers.filter((id) => id !== teacher.id),
                          )
                        }
                      />
                      {fullName(teacher) ?? teacher.email}
                    </label>
                  ))}
              </div>
            )}
            <button
              type="button"
              disabled={busy || assigned === null}
              onClick={() =>
                void run(
                  () => repository.setCoordinatorTeachers(user.id, assignedTeachers),
                  `Maestros de ${name} guardados.`,
                )
              }
              className={`${SECONDARY_BUTTON} mt-3`}
            >
              Guardar maestros
            </button>
          </div>
        )}

        <div>
          <h3 className="text-sm font-semibold text-ink-900">Contraseña nueva</h3>
          <p className="mt-1 text-xs text-ink-500">
            Para quien olvidó la suya. Pásasela y que la cambie en Mi perfil.
          </p>
          <div className="mt-2 flex flex-wrap items-start gap-2">
            <div className="w-64 [&>div]:mt-0">
              <PasswordInput
                value={password}
                onChange={setPassword}
                minLength={MIN_PASSWORD}
                autoComplete="new-password"
                ariaLabel="Contraseña nueva"
              />
            </div>
            <button
              type="button"
              disabled={busy || password.length < MIN_PASSWORD}
              onClick={() =>
                void run(async () => {
                  await repository.setUserPassword(user.id, password)
                  setPassword('')
                }, `Contraseña de ${name} cambiada.`)
              }
              className={SECONDARY_BUTTON}
            >
              Cambiar
            </button>
          </div>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-ink-900">Estado</h3>
          <p className="mt-1 text-xs text-ink-500">
            Una cuenta desactivada no ve nada, pero no se borra: se puede reactivar.
          </p>
          <button
            type="button"
            disabled={busy || isSelf}
            title={isSelf ? 'No puedes desactivar tu propia cuenta' : undefined}
            onClick={() =>
              void run(
                () => repository.setUserActive(user.id, !user.isActive),
                user.isActive ? `${name} quedó desactivada.` : `${name} quedó activa.`,
              )
            }
            className={`${SECONDARY_BUTTON} mt-2`}
          >
            {user.isActive ? 'Desactivar cuenta' : 'Reactivar cuenta'}
          </button>
        </div>
      </div>
    </section>
  )
}
