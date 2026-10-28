import { useMemo, useRef, useState } from 'react'

import { Badge, Dash, LanguageBadge } from '../../components/Badge'
import { useColumnPreferences } from '../../components/ColumnPicker'
import { DataTable, type Column } from '../../components/DataTable'
import { Modal } from '../../components/Modal'
import { useRepositoryQuery } from '../../data/hooks'
import { repository } from '../../data/repository'
import type {
  RegisteredStudent,
  RegistrationResult,
  StudentRegistrationInput,
} from '../../data/types'
import type { FilterOption } from '../../lib/catalog'
import { formatGroupLabel, formatSessionDay } from '../../lib/format'
import { useGroups } from '../../layouts/GroupProvider'
import { usePermissions } from '../../auth/PermissionsProvider'
import { useAuth } from '../../auth/AuthProvider'
import {
  downloadRegistrationTemplate,
  parseRegistrationFile,
  validateRegistration,
  type ParsedRegistrationRow,
} from '../../lib/registrationImport'

const FIELD_INPUT =
  'rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm text-ink-900 shadow-sm focus:border-ink-400 focus:ring-2 focus:ring-ink-900/5 focus:outline-none'

const PRIMARY_BUTTON =
  'rounded-lg bg-ink-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-ink-800 disabled:cursor-not-allowed disabled:bg-ink-200 disabled:text-ink-400'

const SECONDARY_BUTTON =
  'rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm font-medium text-ink-700 shadow-sm hover:bg-ink-50 disabled:cursor-not-allowed disabled:text-ink-400'

const ACCENT_BUTTON =
  'rounded-lg bg-accent-400 px-4 py-2.5 text-sm font-semibold text-ink-900 shadow-sm transition-colors hover:bg-accent-500'

const LABEL = 'text-[11px] font-semibold tracking-wider text-ink-500 uppercase'

const BASE_COLUMNS: Column<RegisteredStudent>[] = [
  { key: 'email', header: 'Correo', width: 'min-w-64', sticky: true, render: (row) => row.email },
  { key: 'name', header: 'Nombre', width: 'min-w-48', render: (row) => row.fullName ?? <Dash /> },
  { key: 'number', header: 'Matrícula', render: (row) => row.studentNumber ?? <Dash /> },
  { key: 'period', header: 'Periodo', render: (row) => row.periodCode ?? <Dash /> },
  {
    key: 'day',
    header: 'Frecuencia',
    render: (row) => (row.sessionDay ? formatSessionDay(row.sessionDay) : <Dash />),
  },
  { key: 'language', header: 'Idioma', render: (row) => <LanguageBadge value={row.language} /> },
]

type Message = { tone: 'red' | 'green'; text: string } | null

/**
 * Alumnos Registrados: el profesor da de alta alumnos sin que contesten el 1.0,
 * de uno a n en una tabla o con un Excel. Cada alta crea también la cuenta de acceso
 * (usuario = correo, contraseña inicial = matrícula). Ver `0031`.
 *
 * La pantalla es la lista: registrar («+ Registrar alumnos») e importar el
 * Excel se hacen en ventanas emergentes, como en Usuarios.
 */
export function RegisteredStudentsPage() {
  const [message, setMessage] = useState<Message>(null)
  const [results, setResults] = useState<RegistrationResult[] | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [search, setSearch] = useState('')
  const [dialog, setDialog] = useState<'single' | 'import' | null>(null)

  const groupContext = useGroups()
  const groups = groupContext?.groups
  // Registrar exige «Puede editar» (0038); con «Solo lectura» queda la lista.
  const canEdit = usePermissions().can('alumnos_registrados', 'edicion')
  const { viewingAsAdmin } = useAuth()

  // Maestros que se ven en esta vista (los grupos ya vienen acotados por rol).
  const teacherOptions = useMemo<FilterOption[]>(() => {
    const byId = new Map<string, string>()
    for (const group of groups ?? []) {
      byId.set(group.teacherId, group.teacherName ?? group.teacherEmail)
    }
    return [...byId].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label))
  }, [groups])
  const [teacherFilter, setTeacherFilter] = useState('')

  const {
    data: students,
    loading,
    isConnected,
    error,
  } = useRepositoryQuery(() => repository.getRegisteredStudents(), [] as RegisteredStudent[], [
    refreshKey,
  ])

  // «Ver como» maestro o coordinador: solo los alumnos de los grupos de esa vista.
  const scoped = useMemo(() => {
    if (viewingAsAdmin) return students
    const ids = new Set((groups ?? []).map((group) => group.id))
    return students.filter((student) => student.groupId && ids.has(student.groupId))
  }, [students, groups, viewingAsAdmin])

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return scoped.filter(
      (student) =>
        (!teacherFilter || student.teacherId === teacherFilter) &&
        (!needle ||
          [student.email, student.fullName ?? '', student.studentNumber ?? ''].some((text) =>
            text.toLowerCase().includes(needle),
          )),
    )
  }, [scoped, search, teacherFilter])

  const withoutDemographics = scoped.filter((student) => student.fullName === null).length
  const withoutGroup = scoped.filter((student) => !student.groupId).length
  const showTeacher = teacherOptions.length > 1

  // «Registrar alumnos» elige un grupo existente; con varios maestros se aclara de quién es.
  const groupOptions = useMemo<FilterOption[]>(
    () =>
      (groups ?? []).map((group) => ({
        value: group.id,
        label: `${formatGroupLabel(group)}${showTeacher ? ` — ${group.teacherName ?? group.teacherEmail}` : ''}`,
      })),
    [groups, showTeacher],
  )

  // Es una pantalla de Configuración, fuera de un grupo: lista a los alumnos
  // que le tocan a quien mira, con la columna Grupo (y Maestro si ve a varios).
  const columns: Column<RegisteredStudent>[] = [
    ...BASE_COLUMNS,
    {
      key: 'group',
      header: 'Grupo',
      width: 'min-w-48',
      render: (row) => {
        const group = groups?.find((candidate) => candidate.id === row.groupId)
        return group ? formatGroupLabel(group) : <Badge tone="red">Sin grupo</Badge>
      },
    },
    ...(showTeacher
      ? [
          {
            key: 'teacher',
            header: 'Maestro',
            width: 'min-w-44',
            render: (row: RegisteredStudent) => row.teacherName ?? <Dash />,
          } satisfies Column<RegisteredStudent>,
        ]
      : []),
  ]

  /** La lista y los conteos de alumnos por grupo cambiaron. */
  function refreshRegistered() {
    setRefreshKey((key) => key + 1)
    groupContext?.refetch()
  }

  /** Lo que comparten las dos ventanas al terminar: refrescar y mostrar el resultado. */
  function afterRegister(rows: RegistrationResult[]) {
    refreshRegistered()
    setDialog(null)
    const failed = rows.filter((row) => row.outcome.startsWith('error')).length
    if (rows.length === 1 && failed === 0) {
      setResults(null)
      setMessage({
        tone: 'green',
        text: `${rows[0].email}: ${rows[0].outcome}${rows[0].account ? ` · cuenta: ${rows[0].account}` : ''}.`,
      })
    } else {
      setMessage(null)
      setResults(rows)
    }
  }

  const { visibleColumns, picker } = useColumnPreferences('alumnos-registrados', columns)

  return (
    <>
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink-950">Alumnos Registrados</h1>
          <p className="mt-1.5 max-w-3xl text-sm text-ink-500">
            Da de alta alumnos para que tengan cuenta sin contestar los Datos Demográficos. Su
            usuario es el correo y su contraseña inicial es la matrícula. Periodo, frecuencia e
            idioma deben corresponder a un grupo que ya exista (ver Administrar grupos).
          </p>
        </div>
        {canEdit && (
          <div className="flex gap-2">
            <button type="button" onClick={() => setDialog('import')} className={SECONDARY_BUTTON}>
              Importar Excel
            </button>
            <button type="button" onClick={() => setDialog('single')} className={ACCENT_BUTTON}>
              + Registrar alumnos
            </button>
          </div>
        )}
      </header>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat value={scoped.length} label="Alumnos" tone="text-ink-950" />
        <Stat value={withoutDemographics} label="Sin Datos Demográficos" tone="text-red-700" />
        <Stat value={withoutGroup} label="Sin grupo" tone="text-red-700" />
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

      {results && <ResultsSection results={results} onDismiss={() => setResults(null)} />}

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <input
          type="search"
          aria-label="Buscar alumno"
          placeholder="Buscar por correo, nombre o matrícula…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className={`${FIELD_INPUT} w-80`}
        />
        {picker}
        {showTeacher && (
          <select
            aria-label="Filtrar por maestro"
            value={teacherFilter}
            onChange={(event) => setTeacherFilter(event.target.value)}
            className={FIELD_INPUT}
          >
            <option value="">Todos los maestros</option>
            {teacherOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        )}
        <p className="text-xs text-ink-500">
          En rojo, los alumnos que todavía no contestan los Datos Demográficos.
        </p>
      </div>
      <DataTable
        columns={visibleColumns}
        rows={visible}
        rowKey={(row) => row.studentId}
        // El nombre solo llega con el formulario 1.0: sin él, el alumno no lo ha contestado.
        rowAlert={(row) => row.fullName === null}
        loading={loading}
        isConnected={isConnected}
        error={error}
      />

      {dialog === 'single' && (
        <RegisterModal
          groupOptions={groupOptions}
          onClose={() => setDialog(null)}
          onRegistered={refreshRegistered}
          onDone={afterRegister}
        />
      )}
      {dialog === 'import' && (
        <ImportModal
          teacherOptions={teacherOptions}
          onClose={() => setDialog(null)}
          onDone={afterRegister}
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

/** Una fila de «Registrar alumnos», mientras se captura. */
interface DraftRow {
  id: number
  email: string
  studentNumber: string
  groupId: string
  /** Motivo de la base si esta fila falló al registrar. */
  serverError?: string
}

let nextDraftId = 1

function emptyDraft(groupId = ''): DraftRow {
  return { id: nextDraftId++, email: '', studentNumber: '', groupId }
}

const isBlank = (row: DraftRow) => !row.email.trim() && !row.studentNumber.trim()

/**
 * «+ Registrar alumnos»: una tabla a la que se le van agregando filas, de uno
 * a n alumnos en un solo envío. La fila nueva hereda el grupo de la anterior,
 * porque casi siempre se captura a varios del mismo grupo.
 */
function RegisterModal({
  groupOptions,
  onClose,
  onRegistered,
  onDone,
}: {
  groupOptions: FilterOption[]
  onClose: () => void
  /** Algunas filas entraron y otras no: refrescar la lista sin cerrar. */
  onRegistered: () => void
  onDone: (results: RegistrationResult[]) => void
}) {
  const groupContext = useGroups()
  const [rows, setRows] = useState<DraftRow[]>(() => [emptyDraft()])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [touched, setTouched] = useState(false)
  const focusId = useRef<number | null>(null)

  // El grupo elegido pone periodo, frecuencia, idioma y maestro.
  function toInput(row: DraftRow): StudentRegistrationInput {
    const group = groupContext?.groups.find((candidate) => candidate.id === row.groupId)
    return {
      email: row.email.trim(),
      studentNumber: row.studentNumber.trim(),
      periodCode: group?.periodCode ?? '',
      sessionDay: group?.sessionDay ?? '',
      language: group?.language ?? '',
      teacherId: group?.teacherId,
    }
  }

  const filled = rows.filter((row) => !isBlank(row))
  const emailCounts = new Map<string, number>()
  for (const row of filled) {
    const key = row.email.trim().toLowerCase()
    emailCounts.set(key, (emailCounts.get(key) ?? 0) + 1)
  }

  function rowError(row: DraftRow): string | null {
    if (isBlank(row)) return null
    const local = validateRegistration(toInput(row))
    if (local === 'Correo institucional inválido' || local === 'Matrícula inválida') return local
    if (!row.groupId) return 'Elige un grupo'
    if (local) return local
    if ((emailCounts.get(row.email.trim().toLowerCase()) ?? 0) > 1) return 'Correo repetido en la lista'
    return row.serverError ?? null
  }

  const hasErrors = filled.some((row) => rowError(row))

  function update(id: number, patch: Partial<DraftRow>) {
    setRows((current) =>
      current.map((row) => (row.id === id ? { ...row, ...patch, serverError: undefined } : row)),
    )
  }

  function addRow() {
    setRows((current) => {
      const draft = emptyDraft(current[current.length - 1]?.groupId ?? '')
      focusId.current = draft.id
      return [...current, draft]
    })
  }

  function removeRow(id: number) {
    setRows((current) => (current.length > 1 ? current.filter((row) => row.id !== id) : current))
  }

  async function handleSubmit() {
    setTouched(true)
    if (filled.length === 0 || hasErrors) return
    setSaving(true)
    setError(null)
    try {
      const results = await repository.registerStudents(filled.map(toInput))
      const failedByRow = new Map(
        results
          .filter((result) => result.outcome.startsWith('error'))
          .map((result) => [result.row, result.outcome.replace(/^error:\s*/, '')]),
      )
      if (failedByRow.size === 0) {
        onDone(results)
        return
      }
      // Las que entraron se van; las que fallaron se quedan con el motivo,
      // para corregirlas sin volver a capturar las demás.
      const failedRows = filled.flatMap((row, index) => {
        const reason = failedByRow.get(index + 1)
        return reason ? [{ ...row, serverError: reason }] : []
      })
      setRows(failedRows)
      if (failedRows.length < filled.length) onRegistered()
      setSaving(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo registrar a los alumnos.')
      setSaving(false)
    }
  }

  const count = filled.length

  return (
    <Modal
      title="Registrar alumnos"
      onClose={onClose}
      width="max-w-4xl"
      footer={
        <>
          <button type="button" onClick={onClose} className={SECONDARY_BUTTON}>
            Cancelar
          </button>
          <button
            type="button"
            disabled={saving || count === 0 || (touched && hasErrors)}
            onClick={() => void handleSubmit()}
            className={PRIMARY_BUTTON}
          >
            {saving
              ? 'Registrando…'
              : count > 0
                ? `Registrar ${count} ${count === 1 ? 'alumno' : 'alumnos'}`
                : 'Registrar'}
          </button>
        </>
      }
    >
      <div className="overflow-x-auto rounded-lg border border-ink-200">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-ink-200 bg-ink-50 text-left text-[11px] font-semibold tracking-wider text-ink-500 uppercase">
              <th className="w-10 px-3 py-2">#</th>
              <th className="px-2 py-2">Correo UDEM</th>
              <th className="w-36 px-2 py-2">Matrícula</th>
              <th className="px-2 py-2">Grupo</th>
              <th className="w-10 px-2 py-2">
                <span className="sr-only">Quitar</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const message = touched || row.serverError ? rowError(row) : null
              const isLast = index === rows.length - 1
              // Enter en la última fila agrega otra; en las demás no hace nada.
              const onKeyDown = (event: React.KeyboardEvent) => {
                if (event.key !== 'Enter') return
                event.preventDefault()
                if (isLast) addRow()
              }
              const invalid = message ? 'border-red-300 bg-red-50' : ''
              return (
                <tr key={row.id} className="border-b border-ink-100 align-top last:border-0">
                  <td className="tnum px-3 py-3 text-ink-400">{index + 1}</td>
                  <td className="px-2 py-2">
                    <input
                      // La fila recién agregada recibe el foco en su correo.
                      ref={(element) => {
                        if (element && focusId.current === row.id) {
                          element.focus()
                          focusId.current = null
                        }
                      }}
                      type="email"
                      aria-label={`Correo del alumno ${index + 1}`}
                      value={row.email}
                      onChange={(event) => update(row.id, { email: event.target.value })}
                      onKeyDown={onKeyDown}
                      placeholder="alumno.ejemplo@udem.edu"
                      autoComplete="off"
                      className={`${FIELD_INPUT} w-full ${invalid}`}
                    />
                    {message && <p className="mt-1 text-xs text-red-700">{message}</p>}
                  </td>
                  <td className="px-2 py-2">
                    <input
                      aria-label={`Matrícula del alumno ${index + 1}`}
                      value={row.studentNumber}
                      onChange={(event) => update(row.id, { studentNumber: event.target.value })}
                      onKeyDown={onKeyDown}
                      autoComplete="off"
                      className={`${FIELD_INPUT} w-full ${invalid}`}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <select
                      aria-label={`Grupo del alumno ${index + 1}`}
                      value={row.groupId}
                      onChange={(event) => update(row.id, { groupId: event.target.value })}
                      onKeyDown={onKeyDown}
                      className={`${FIELD_INPUT} w-full ${invalid}`}
                    >
                      <option value="">Elige…</option>
                      {groupOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-2">
                    {rows.length > 1 && (
                      <button
                        type="button"
                        aria-label={`Quitar al alumno ${index + 1}`}
                        onClick={() => removeRow(row.id)}
                        className="rounded-md px-2 py-1.5 text-lg leading-none text-ink-400 hover:bg-ink-100 hover:text-ink-900"
                      >
                        ×
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <button type="button" onClick={addRow} className={`${SECONDARY_BUTTON} mt-3`}>
        + Agregar alumno
      </button>

      {groupOptions.length === 0 && (
        <p className="mt-3 text-xs text-red-700">
          Todavía no hay grupos. Créalo en Configuración → Administrar grupos.
        </p>
      )}

      <p className="mt-4 text-xs text-ink-500">
        Enter en la última fila agrega otra. Las filas vacías no se toman en cuenta. El usuario de
        cada alumno será su correo y su contraseña inicial la matrícula; queda inscrito en el grupo
        de su fila.
      </p>

      {error && (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}
    </Modal>
  )
}

/** «Importar Excel»: plantilla, archivo, vista previa y registro de las filas válidas. */
function ImportModal({
  teacherOptions,
  onClose,
  onDone,
}: {
  teacherOptions: FilterOption[]
  onClose: () => void
  onDone: (results: RegistrationResult[]) => void
}) {
  const [preview, setPreview] = useState<ParsedRegistrationRow[] | null>(null)
  const [teacherId, setTeacherId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const validRows = preview?.filter((row) => !row.error) ?? []

  async function handleFile(file: File | undefined) {
    setError(null)
    setPreview(null)
    if (!file) return
    try {
      setPreview(await parseRegistrationFile(file))
    } catch {
      setError('No se pudo leer el archivo. Usa un .xlsx con el orden de la plantilla.')
    }
  }

  async function handleImport() {
    if (validRows.length === 0) return
    setSaving(true)
    setError(null)
    try {
      onDone(await repository.registerStudents(
          validRows.map((row) => (teacherId ? { ...row.input, teacherId } : row.input)),
        ))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo registrar a los alumnos.')
      setSaving(false)
    }
  }

  return (
    <Modal
      title="Importar alumnos desde Excel"
      onClose={onClose}
      width="max-w-3xl"
      footer={
        <>
          <button type="button" onClick={onClose} className={SECONDARY_BUTTON}>
            Cancelar
          </button>
          <button
            type="button"
            disabled={validRows.length === 0 || saving}
            onClick={() => void handleImport()}
            className={PRIMARY_BUTTON}
          >
            {saving
              ? 'Registrando…'
              : validRows.length
                ? `Registrar ${validRows.length} ${validRows.length === 1 ? 'alumno' : 'alumnos'}`
                : 'Registrar'}
          </button>
        </>
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-600">
          Columnas, en este orden: Correo UDEM, Matrícula, Periodo, Frecuencia e Idioma.
        </p>
        <button
          type="button"
          onClick={() => void downloadRegistrationTemplate()}
          className={SECONDARY_BUTTON}
        >
          Descargar plantilla
        </button>
      </div>

      {teacherOptions.length > 1 && (
        <div className="mt-4 max-w-sm">
          <FieldSelect
            label="Maestro de todos los alumnos (opcional)"
            value={teacherId}
            options={teacherOptions}
            onChange={setTeacherId}
          />
        </div>
      )}

      <input
        ref={fileInput}
        type="file"
        accept=".xlsx"
        aria-label="Archivo de Excel"
        onChange={(event) => void handleFile(event.target.files?.[0])}
        className="mt-4 block text-sm text-ink-600 file:mr-3 file:rounded-lg file:border file:border-ink-200 file:bg-white file:px-3 file:py-2 file:text-sm file:font-medium file:text-ink-700 hover:file:bg-ink-50"
      />

      {preview && (
        <div className="mt-5">
          {preview.length === 0 ? (
            <p className="text-sm text-ink-500">El archivo no tiene filas con datos.</p>
          ) : (
            <>
              <p className="mb-2 text-sm text-ink-700">
                {validRows.length} de {preview.length} filas listas
                {validRows.length < preview.length && ' · las filas con error no se registrarán'}
              </p>
              <PreviewTable rows={preview} />
            </>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}
    </Modal>
  )
}

function PreviewTable({ rows }: { rows: ParsedRegistrationRow[] }) {
  return (
    <div className="max-h-72 overflow-auto rounded-lg border border-ink-200">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-ink-200 bg-ink-50 text-left text-[11px] font-semibold tracking-wider text-ink-500 uppercase">
            <th className="px-3 py-2">Fila</th>
            <th className="px-3 py-2">Correo</th>
            <th className="px-3 py-2">Periodo</th>
            <th className="px-3 py-2">Frecuencia</th>
            <th className="px-3 py-2">Idioma</th>
            <th className="px-3 py-2">Estado</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.sheetRow} className="border-b border-ink-100 last:border-0">
              <td className="px-3 py-2 text-ink-500">{row.sheetRow}</td>
              <td className="px-3 py-2">{row.input.email}</td>
              <td className="px-3 py-2">{row.input.periodCode}</td>
              <td className="px-3 py-2">{row.input.sessionDay}</td>
              <td className="px-3 py-2">{row.input.language}</td>
              <td className="px-3 py-2">
                {row.error ? <Badge tone="red">{row.error}</Badge> : <Badge tone="green">Lista</Badge>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ResultsSection({
  results,
  onDismiss,
}: {
  results: RegistrationResult[]
  onDismiss: () => void
}) {
  const failed = results.filter((result) => result.outcome.startsWith('error')).length
  return (
    <section className="mb-6 rounded-xl border border-ink-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-4 border-b border-ink-200 px-5 py-3">
        <h2 className="text-sm font-semibold text-ink-900">Resultado</h2>
        <div className="flex items-center gap-3">
          <p className="text-xs text-ink-500">
            {results.length - failed} registrados · {failed} con error
          </p>
          <button
            type="button"
            onClick={onDismiss}
            className="text-xs font-medium text-ink-500 hover:text-ink-900"
          >
            Cerrar
          </button>
        </div>
      </div>
      <table className="w-full border-collapse text-sm">
        <tbody>
          {results.map((result) => (
            <tr key={result.row} className="border-b border-ink-100 last:border-0">
              <td className="px-4 py-2 text-ink-500">{result.row}</td>
              <td className="px-4 py-2">{result.email}</td>
              <td className="px-4 py-2">
                <Badge tone={result.outcome.startsWith('error') ? 'red' : 'green'}>
                  {result.outcome}
                </Badge>
              </td>
              <td className="px-4 py-2 text-ink-500">{result.account ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
