import { useMemo, useRef, useState, type FormEvent } from 'react'

import { Badge, Dash, LanguageBadge } from '../../components/Badge'
import { DataTable, type Column } from '../../components/DataTable'
import { Modal } from '../../components/Modal'
import { useRepositoryQuery } from '../../data/hooks'
import { repository } from '../../data/repository'
import type {
  RegisteredStudent,
  RegistrationResult,
  StudentRegistrationInput,
} from '../../data/types'
import {
  LANGUAGE_OPTIONS,
  PERIOD_OPTIONS,
  SESSION_DAY_OPTIONS,
  type FilterOption,
} from '../../lib/catalog'
import { formatGroupLabel, formatSessionDay } from '../../lib/format'
import { useGroups } from '../../layouts/GroupProvider'
import { usePermissions } from '../../auth/PermissionsProvider'
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

const EMPTY_FORM: StudentRegistrationInput = {
  email: '',
  studentNumber: '',
  periodCode: '',
  sessionDay: '',
  language: '',
}

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
 * uno por uno o con un Excel. Cada alta crea también la cuenta de acceso
 * (usuario = correo, contraseña inicial = matrícula). Ver `0031`.
 *
 * La pantalla es la lista: registrar uno («+ Registrar alumno») e importar el
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

  const {
    data: students,
    loading,
    isConnected,
    error,
  } = useRepositoryQuery(() => repository.getRegisteredStudents(), [] as RegisteredStudent[], [
    refreshKey,
  ])

  // Los periodos que de verdad tienen grupo; sin grupos, los del catálogo.
  const periodOptions = useMemo<FilterOption[]>(() => {
    const codes = [...new Set((groups ?? []).map((group) => group.periodCode))]
    return codes.length ? codes.map((code) => ({ value: code, label: code })) : PERIOD_OPTIONS
  }, [groups])

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase()
    if (!needle) return students
    return students.filter((student) =>
      [student.email, student.fullName ?? '', student.studentNumber ?? ''].some((text) =>
        text.toLowerCase().includes(needle),
      ),
    )
  }, [students, search])

  const withoutDemographics = students.filter((student) => student.fullName === null).length
  const withoutGroup = students.filter((student) => !student.groupId).length

  // Es una pantalla de Configuración, fuera de un grupo: lista a todos los
  // alumnos, con la columna Grupo para ubicar a cada uno.
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
  ]

  /** Lo que comparten las dos ventanas al terminar: refrescar y mostrar el resultado. */
  function afterRegister(rows: RegistrationResult[]) {
    setRefreshKey((key) => key + 1)
    // Los conteos de alumnos por grupo cambiaron.
    groupContext?.refetch()
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
              + Registrar alumno
            </button>
          </div>
        )}
      </header>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat value={students.length} label="Alumnos" tone="text-ink-950" />
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
        <p className="text-xs text-ink-500">
          En rojo, los alumnos que todavía no contestan los Datos Demográficos.
        </p>
      </div>
      <DataTable
        columns={columns}
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
          periodOptions={periodOptions}
          onClose={() => setDialog(null)}
          onDone={afterRegister}
        />
      )}
      {dialog === 'import' && <ImportModal onClose={() => setDialog(null)} onDone={afterRegister} />}
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

/** «+ Registrar alumno»: un alumno a la vez. */
function RegisterModal({
  periodOptions,
  onClose,
  onDone,
}: {
  periodOptions: FilterOption[]
  onClose: () => void
  onDone: (results: RegistrationResult[]) => void
}) {
  const [form, setForm] = useState<StudentRegistrationInput>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [touched, setTouched] = useState(false)
  const formError = validateRegistration(form)

  function setField(key: keyof StudentRegistrationInput, value: string) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  async function handleSubmit(event?: FormEvent) {
    event?.preventDefault()
    setTouched(true)
    if (formError) return
    setSaving(true)
    setError(null)
    try {
      const results = await repository.registerStudents([form])
      // Un error de la base (sin grupo, matrícula repetida) deja la ventana
      // abierta con el motivo, para corregir sin volver a capturar todo.
      const failed = results.find((result) => result.outcome.startsWith('error'))
      if (failed) {
        setError(failed.outcome.replace(/^error:\s*/, ''))
        setSaving(false)
        return
      }
      onDone(results)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo registrar al alumno.')
      setSaving(false)
    }
  }

  return (
    <Modal
      title="Registrar alumno"
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
            {saving ? 'Registrando…' : 'Registrar'}
          </button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
          <label className="block">
            <span className={LABEL}>Correo UDEM</span>
            <input
              type="email"
              value={form.email}
              onChange={(event) => setField('email', event.target.value)}
              placeholder="alumno.ejemplo@udem.edu"
              autoComplete="off"
              className={`${FIELD_INPUT} mt-1.5 w-full`}
            />
          </label>
          <label className="block">
            <span className={LABEL}>Matrícula</span>
            <input
              value={form.studentNumber}
              onChange={(event) => setField('studentNumber', event.target.value)}
              autoComplete="off"
              className={`${FIELD_INPUT} mt-1.5 w-full`}
            />
          </label>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <FieldSelect
            label="Periodo"
            value={form.periodCode}
            options={periodOptions}
            onChange={(value) => setField('periodCode', value)}
          />
          <FieldSelect
            label="Frecuencia"
            value={form.sessionDay}
            options={SESSION_DAY_OPTIONS}
            onChange={(value) => setField('sessionDay', value)}
          />
          <FieldSelect
            label="Idioma"
            value={form.language}
            options={LANGUAGE_OPTIONS}
            onChange={(value) => setField('language', value)}
          />
        </div>

        <p className="text-xs text-ink-500">
          Su usuario será el correo y su contraseña inicial la matrícula. Periodo, frecuencia e
          idioma lo inscriben en el grupo que coincide.
        </p>

        {(error || (touched && formError)) && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
            {error ?? formError}
          </p>
        )}

        {/* Enter en cualquier campo registra. */}
        <button type="submit" hidden />
      </form>
    </Modal>
  )
}

/** «Importar Excel»: plantilla, archivo, vista previa y registro de las filas válidas. */
function ImportModal({
  onClose,
  onDone,
}: {
  onClose: () => void
  onDone: (results: RegistrationResult[]) => void
}) {
  const [preview, setPreview] = useState<ParsedRegistrationRow[] | null>(null)
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
      onDone(await repository.registerStudents(validRows.map((row) => row.input)))
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
