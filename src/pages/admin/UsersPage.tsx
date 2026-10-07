import { useMemo, useState, type FormEvent } from 'react'

import { ROLE_LABELS, STAFF_ROLES, useAuth } from '../../auth/AuthProvider'
import { Badge, Dash } from '../../components/Badge'
import { DataTable, type Column } from '../../components/DataTable'
import { Modal } from '../../components/Modal'
import { ACCESS_TONES, PermissionsMatrix, levelsFor, sectionsOf } from './PermissionsMatrix'
import { useGroups } from '../../layouts/GroupProvider'
import { usePermissions } from '../../auth/PermissionsProvider'
import { ACCESS_LABELS, ACCESS_RANK, SCREENS, type AccessLevel, type ScreenMeta } from '../../lib/screens'
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

const LABEL = 'text-[11px] font-semibold tracking-wider text-ink-500 uppercase'

const MIN_PASSWORD = 8

const EMPTY_FORM: StaffAccountInput = {
  email: '',
  firstName: '',
  lastName: '',
  password: '',
  roles: [],
  teacherIds: [],
}

type Message = { tone: 'red' | 'green'; text: string } | null

function fullName(user: Pick<UserAccount, 'firstName' | 'lastName'>): string | null {
  return [user.firstName, user.lastName].filter(Boolean).join(' ') || null
}

/**
 * Una contraseña temporal legible: 12 caracteres sin los que se confunden al
 * dictarlos (0/O, 1/l/I). `crypto.getRandomValues`, no `Math.random`.
 */
function generatePassword(): string {
  const alphabet = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const values = crypto.getRandomValues(new Uint32Array(12))
  return Array.from(values, (value) => alphabet[value % alphabet.length]).join('')
}

/**
 * Configuración → Usuarios: las cuentas del panel (maestros, coordinadores y
 * administradores) y las pendientes de autorización. Los alumnos tienen su
 * propia pantalla, Alumnos registrados.
 *
 * Crear y editar se hacen en ventanas emergentes (botón «Nuevo usuario» y
 * «Editar»): la pantalla es la lista, no un formulario siempre abierto.
 *
 * Todo pasa por funciones admin-only (`0037`); las reglas —un alumno no tiene
 * otro rol, nadie se quita su propio admin, no se quita un rol en uso— las
 * hace cumplir la base, y aquí solo se muestra su mensaje.
 */
export function UsersPage() {
  const [message, setMessage] = useState<Message>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [search, setSearch] = useState('')
  // Usuarios y permisos: las cuentas, y la matriz de acceso por rol (0038).
  const [tab, setTab] = useState<'usuarios' | 'permisos'>('usuarios')
  const [creating, setCreating] = useState(false)
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
  const activeCount = users.filter((user) => user.isActive).length

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
            setEditingId(user.id)
          }}
          className={SECONDARY_BUTTON}
        >
          Editar
        </button>
      ),
    },
  ]

  return (
    <>
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink-950">Usuarios y permisos</h1>
          <p className="mt-1.5 text-sm text-ink-500">
            Las cuentas del panel, sus roles y qué ve y edita cada rol. Los alumnos están en
            Alumnos registrados.
          </p>
        </div>
        {tab === 'usuarios' && (
          <button
            type="button"
            onClick={() => {
              setMessage(null)
              setCreating(true)
            }}
            className="rounded-lg bg-accent-400 px-4 py-2.5 text-sm font-semibold text-ink-900 shadow-sm transition-colors hover:bg-accent-500"
          >
            + Nuevo usuario
          </button>
        )}
      </header>

      <div role="tablist" className="mb-6 flex gap-1 border-b border-ink-200">
        {(
          [
            ['usuarios', 'Usuarios'],
            ['permisos', 'Permisos por rol'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => {
              setMessage(null)
              setTab(key)
            }}
            className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === key
                ? 'border-ink-900 text-ink-950'
                : 'border-transparent text-ink-500 hover:text-ink-900'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'permisos' ? (
        <PermissionsMatrix />
      ) : (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-3">
            <Stat value={users.length} label="Usuarios" tone="text-ink-950" />
            <Stat value={activeCount} label="Activos" tone="text-emerald-700" />
            <Stat value={users.length - activeCount} label="Desactivados" tone="text-red-700" />
          </div>

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

          <div className="mb-3 flex items-center justify-between gap-3">
            <input
              type="search"
              aria-label="Buscar usuario"
              placeholder="Buscar por nombre o correo…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className={`${FIELD_INPUT} w-72`}
            />
            <p className="text-sm text-ink-500">{visible.length}</p>
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

          {creating && (
            <NewUserModal
              teachers={teachers}
              onClose={() => setCreating(false)}
              onCreated={(text) => {
                setCreating(false)
                setMessage({ tone: 'green', text })
                refresh()
              }}
            />
          )}
        </>
      )}

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

/** «+ Nuevo usuario»: la ventana emergente para crear una cuenta del panel. */
function NewUserModal({
  teachers,
  onClose,
  onCreated,
}: {
  /** Los maestros activos, para asignarlos si la cuenta es de coordinador. */
  teachers: UserAccount[]
  onClose: () => void
  onCreated: (message: string) => void
}) {
  const [form, setForm] = useState<StaffAccountInput>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [touched, setTouched] = useState(false)

  const formError = !form.firstName.trim() || !form.lastName.trim()
    ? 'Escribe el nombre y el apellido.'
    : !/^\S+@\S+\.\S+$/.test(form.email.trim())
      ? 'Escribe un correo válido.'
      : form.password.length < MIN_PASSWORD
        ? `La contraseña temporal debe tener al menos ${MIN_PASSWORD} caracteres.`
        : form.roles.length === 0
          ? 'Elige al menos un rol.'
          : null

  async function handleSubmit(event?: FormEvent) {
    event?.preventDefault()
    setTouched(true)
    if (formError) return
    setSaving(true)
    setError(null)
    try {
      const { existed } = await repository.createStaffAccount({
        ...form,
        email: form.email.trim(),
        // Solo un coordinador lleva maestros (la base lo exige, 0039).
        teacherIds: form.roles.includes('coordinador') ? form.teacherIds : [],
      })
      const name = `${form.firstName.trim()} ${form.lastName.trim()}`
      // La contraseña va en el aviso porque la ventana se cierra: el admin
      // la necesita para pasársela a la persona.
      onCreated(
        existed
          ? `${name} ya tenía cuenta (estaba pendiente): ahora tiene sus roles. Su contraseña no cambió.`
          : `Cuenta de ${name} creada. Pásale su correo (${form.email.trim()}) y la contraseña temporal: ${form.password} — la puede cambiar en Mi perfil.`,
      )
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo crear la cuenta.')
      setSaving(false)
    }
  }

  return (
    <Modal
      title="Nuevo usuario"
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className={SECONDARY_BUTTON}>
            Cancelar
          </button>
          <button
            type="button"
            disabled={saving || (touched && !!formError)}
            onClick={() => void handleSubmit()}
            className={PRIMARY_BUTTON}
          >
            {saving ? 'Creando…' : 'Crear usuario'}
          </button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className={LABEL}>Nombre</span>
            <input
              value={form.firstName}
              onChange={(event) => setForm({ ...form, firstName: event.target.value })}
              placeholder="Ej: Juan"
              autoComplete="off"
              className={`${FIELD_INPUT} mt-1.5 w-full`}
            />
          </label>
          <label className="block">
            <span className={LABEL}>Apellido</span>
            <input
              value={form.lastName}
              onChange={(event) => setForm({ ...form, lastName: event.target.value })}
              placeholder="Ej: Pérez"
              autoComplete="off"
              className={`${FIELD_INPUT} mt-1.5 w-full`}
            />
          </label>
        </div>

        <label className="block">
          <span className={LABEL}>Correo electrónico</span>
          <input
            type="email"
            value={form.email}
            onChange={(event) => setForm({ ...form, email: event.target.value })}
            placeholder="nombre.apellido@udem.edu"
            autoComplete="off"
            className={`${FIELD_INPUT} mt-1.5 w-full`}
          />
        </label>

        <div>
          <span className={LABEL}>Contraseña temporal</span>
          <div className="mt-1.5 flex gap-2">
            {/* Texto visible a propósito: es temporal y el admin tiene que pasarla. */}
            <input
              value={form.password}
              onChange={(event) => setForm({ ...form, password: event.target.value })}
              placeholder={`Mínimo ${MIN_PASSWORD} caracteres`}
              autoComplete="off"
              spellCheck={false}
              className={`${FIELD_INPUT} w-full font-mono`}
            />
            <button
              type="button"
              onClick={() => setForm({ ...form, password: generatePassword() })}
              className={SECONDARY_BUTTON}
            >
              Generar
            </button>
          </div>
          <p className="mt-1 text-xs text-ink-500">La persona la cambia en Mi perfil.</p>
        </div>

        <div>
          <span className={LABEL}>Roles</span>
          <RoleCheckboxes
            value={form.roles}
            onChange={(roles) =>
              // Sin el rol de coordinador, los maestros elegidos ya no aplican.
              setForm({ ...form, roles, teacherIds: roles.includes('coordinador') ? form.teacherIds : [] })
            }
          />
          <p className="mt-2 text-xs text-ink-500">
            Puede tener varios: un coordinador que también da clase es Coordinador y Maestro.
          </p>
        </div>

        {form.roles.includes('coordinador') && (
          <div>
            <span className={LABEL}>Maestros que supervisa</span>
            <TeacherPicker
              teachers={teachers}
              value={form.teacherIds}
              onChange={(teacherIds) => setForm({ ...form, teacherIds })}
            />
          </div>
        )}

        {(error || (touched && formError)) && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
            {error ?? formError}
          </p>
        )}

        {/* Enter en cualquier campo crea la cuenta. */}
        <button type="submit" hidden />
      </form>
    </Modal>
  )
}

/**
 * Los maestros que supervisa un coordinador, como chips. Opcional: se pueden
 * asignar después en «Editar».
 */
function TeacherPicker({
  teachers,
  value,
  onChange,
  excludeId,
}: {
  teachers: UserAccount[]
  value: string[]
  onChange: (ids: string[]) => void
  /** El propio coordinador, si también es maestro: no se supervisa a sí mismo. */
  excludeId?: string
}) {
  const options = teachers.filter((teacher) => teacher.id !== excludeId)
  if (options.length === 0) {
    return (
      <p className="mt-2 text-sm text-ink-500">
        Todavía no hay cuentas activas con el rol de maestro. Puedes asignarlos después en
        «Editar».
      </p>
    )
  }
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {options.map((teacher) => {
        const checked = value.includes(teacher.id)
        return (
          <label
            key={teacher.id}
            className={`flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors ${
              checked
                ? 'border-ink-900 bg-ink-900 text-white'
                : 'border-ink-200 bg-white text-ink-700 hover:bg-ink-50'
            }`}
          >
            <input
              type="checkbox"
              className="sr-only"
              checked={checked}
              onChange={(event) =>
                onChange(
                  event.target.checked
                    ? [...value, teacher.id]
                    : value.filter((id) => id !== teacher.id),
                )
              }
            />
            {fullName(teacher) ?? teacher.email}
          </label>
        )
      })}
    </div>
  )
}

function RoleCheckboxes({
  value,
  onChange,
  locked = {},
}: {
  value: RoleCode[]
  onChange: (roles: RoleCode[]) => void
  /** Roles que no se pueden cambiar aquí, con el motivo (se muestra al pasar el cursor). */
  locked?: Partial<Record<RoleCode, string>>
}) {
  return (
    <fieldset className="mt-2">
      <legend className="sr-only">Roles</legend>
      <div className="flex flex-wrap gap-2">
        {STAFF_ROLES.map((role) => (
          <label
            key={role}
            title={locked[role]}
            className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors ${
              locked[role] ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
            } ${
              value.includes(role)
                ? 'border-ink-900 bg-ink-900 text-white'
                : 'border-ink-200 bg-white text-ink-700 hover:bg-ink-50'
            }`}
          >
            <input
              type="checkbox"
              className="sr-only"
              disabled={Boolean(locked[role])}
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

/**
 * «Editar», en ventana emergente: nombre, roles, maestros (si coordina),
 * contraseña nueva y estado. Cada parte se guarda por separado: un error de
 * roles no debe perder un cambio de nombre ya guardado.
 */
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

  // Los grupos que imparte (la vista de admin ve todos): quitarle «Maestro»
  // o desactivarlo deja a esos alumnos sin maestro.
  const groupCount = (useGroups()?.groups ?? []).filter((group) => group.teacherId === user.id).length
  const lockedRoles: Partial<Record<RoleCode, string>> = {
    ...(isSelf && user.roles.includes('admin')
      ? { admin: 'No puedes quitarte tu propio rol de administrador' }
      : {}),
    ...(groupCount > 0 && user.roles.includes('maestro')
      ? {
          maestro: `Imparte ${groupCount} ${groupCount === 1 ? 'grupo' : 'grupos'}: reasígnalos en Administrar grupos antes de quitarle este rol`,
        }
      : {}),
  }

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
    <Modal
      title={`Editar · ${name}`}
      onClose={onClose}
      width="max-w-2xl"
      footer={
        <button type="button" onClick={onClose} className={SECONDARY_BUTTON}>
          Listo
        </button>
      }
    >
      <p className="-mt-1 mb-5 text-sm text-ink-500">{user.email}</p>
      <div className="grid gap-6 sm:grid-cols-2">
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

        <div className="sm:col-span-2">
          <h3 className="text-sm font-semibold text-ink-900">Roles</h3>
          <RoleCheckboxes value={roles} onChange={setRoles} locked={lockedRoles} />
          {roles.includes('coordinador') && (
            <div className="mt-4">
              <h3 className="text-sm font-semibold text-ink-900">Maestros que supervisa</h3>
              <TeacherPicker
                teachers={teachers}
                value={assignedTeachers}
                onChange={setAssigned}
                excludeId={user.id}
              />
            </div>
          )}
          {!roles.includes('coordinador') && savedTeachers.length > 0 && (
            <p className="mt-3 text-xs text-ink-500">
              Al quitarle el rol de coordinador deja de supervisar a sus {savedTeachers.length}{' '}
              {savedTeachers.length === 1 ? 'maestro' : 'maestros'}.
            </p>
          )}
          <button
            type="button"
            disabled={busy || (!rolesChanged && assigned === null)}
            onClick={() =>
              void run(async () => {
                await repository.setUserRoles(user.id, roles)
                // Después de los roles: la base exige que ya sea coordinador.
                if (roles.includes('coordinador')) {
                  await repository.setCoordinatorTeachers(user.id, assignedTeachers)
                }
                setAssigned(null)
              }, `Roles de ${name} guardados.`)
            }
            className={`${SECONDARY_BUTTON} mt-3`}
          >
            Guardar roles
          </button>
        </div>

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
            onClick={() => {
              // Desactivar no quita sus grupos: sus alumnos se quedan sin quien
              // los vea (salvo el admin y su coordinador). Se avisa antes.
              if (
                user.isActive &&
                groupCount > 0 &&
                !window.confirm(
                  `${name} imparte ${groupCount} ${groupCount === 1 ? 'grupo' : 'grupos'}. Si la desactivas, nadie más que el administrador y su coordinador verá a esos alumnos hasta que reasignes los grupos. ¿Desactivar de todos modos?`,
                )
              ) {
                return
              }
              void run(
                () => repository.setUserActive(user.id, !user.isActive),
                user.isActive ? `${name} quedó desactivada.` : `${name} quedó activa.`,
              )
            }}
            className={`${SECONDARY_BUTTON} mt-2`}
          >
            {user.isActive ? 'Desactivar cuenta' : 'Reactivar cuenta'}
          </button>
        </div>

        <div className="sm:col-span-2">
          <UserPermissions user={user} onMessage={onMessage} />
        </div>
      </div>
    </Modal>
  )
}

/**
 * Las excepciones de una persona (`user_screen_access`, `0038`): por pantalla,
 * «Como su rol» (sin excepción) o un nivel que reemplaza al de sus roles. Se
 * guardan en cuanto se eligen.
 */
function UserPermissions({
  user,
  onMessage,
}: {
  user: UserAccount
  onMessage: (message: Message) => void
}) {
  const { matrix, refetch } = usePermissions()
  const [refreshKey, setRefreshKey] = useState(0)
  const [savingScreen, setSavingScreen] = useState<string | null>(null)
  const { data: overrides } = useRepositoryQuery(
    () => repository.getUserScreenAccess(user.id),
    {} as Record<string, AccessLevel>,
    [user.id, refreshKey],
  )

  const staffRoles: RoleCode[] = user.roles.filter(
    (role) => role === 'coordinador' || role === 'maestro',
  )
  if (user.roles.includes('admin')) {
    return (
      <>
        <h3 className="text-sm font-semibold text-ink-900">Permisos de esta persona</h3>
        <p className="mt-1 text-xs text-ink-500">
          Es administrador: tiene acceso total y no lleva excepciones.
        </p>
      </>
    )
  }
  if (staffRoles.length === 0) {
    return (
      <>
        <h3 className="text-sm font-semibold text-ink-900">Permisos de esta persona</h3>
        <p className="mt-1 text-xs text-ink-500">Dale primero un rol: sin rol no ve nada.</p>
      </>
    )
  }

  // Lo que le darían sus roles: el mayor de ellos, igual que la base.
  const fromRoles = (screen: ScreenMeta): AccessLevel =>
    matrix
      .filter((cell) => cell.screenCode === screen.code && staffRoles.includes(cell.roleCode))
      .reduce<AccessLevel>(
        (best, cell) => (ACCESS_RANK[cell.access] > ACCESS_RANK[best] ? cell.access : best),
        'ninguno',
      )

  async function change(screen: ScreenMeta, value: string) {
    setSavingScreen(screen.code)
    onMessage(null)
    try {
      await repository.setUserScreenAccess(user.id, screen.code, (value || null) as AccessLevel | null)
      onMessage({
        tone: 'green',
        text: value
          ? `${screen.name}: ${ACCESS_LABELS[value as AccessLevel]} para esta persona.`
          : `${screen.name}: vuelve a lo que da su rol.`,
      })
      setRefreshKey((key) => key + 1)
      refetch()
    } catch (cause) {
      onMessage({ tone: 'red', text: cause instanceof Error ? cause.message : 'No se pudo guardar.' })
    } finally {
      setSavingScreen(null)
    }
  }

  const screens = SCREENS.filter((screen) => screen.audience !== 'portal')

  return (
    <>
      <h3 className="text-sm font-semibold text-ink-900">Permisos de esta persona</h3>
      <p className="mt-1 text-xs text-ink-500">
        Por omisión, lo que da su rol (Permisos por rol). Una excepción lo reemplaza solo para
        esta persona.
      </p>
      <div className="mt-3 max-h-80 overflow-y-auto rounded-lg border border-ink-200">
        <table className="w-full border-collapse text-sm">
          <tbody>
            {sectionsOf(screens).map(({ section, screens: rows }) => [
              <tr key={section} className="bg-ink-50">
                <td
                  colSpan={2}
                  className="px-3 py-1.5 text-[11px] font-semibold tracking-widest text-ink-500 uppercase"
                >
                  {section}
                </td>
              </tr>,
              ...rows.map((screen) => {
                const override = overrides[screen.code]
                const effective = override ?? fromRoles(screen)
                return (
                  <tr key={screen.code} className="border-t border-ink-100">
                    <td className="px-3 py-1.5 text-ink-800">{screen.name}</td>
                    <td className="w-56 px-3 py-1.5">
                      <select
                        aria-label={`Permiso de ${screen.name}`}
                        value={override ?? ''}
                        disabled={savingScreen === screen.code}
                        onChange={(event) => void change(screen, event.target.value)}
                        className={`w-full rounded-lg border px-2 py-1 text-sm focus:outline-none ${
                          override ? ACCESS_TONES[effective] : 'border-ink-200 bg-white text-ink-600'
                        }`}
                      >
                        <option value="">Como su rol ({ACCESS_LABELS[fromRoles(screen)]})</option>
                        {levelsFor(screen).map((level) => (
                          <option key={level} value={level}>
                            {ACCESS_LABELS[level]}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                )
              }),
            ])}
          </tbody>
        </table>
      </div>
    </>
  )
}
