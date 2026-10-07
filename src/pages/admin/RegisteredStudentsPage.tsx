import { useRef, useState } from 'react'

import { Badge, Dash, LanguageBadge } from '../../components/Badge'
import { DataTable, type Column } from '../../components/DataTable'
import { Select } from '../../components/FilterBar'
import { useRepositoryQuery } from '../../data/hooks'
import { repository } from '../../data/repository'
import type {
  RegisteredStudent,
  RegistrationResult,
  StudentRegistrationInput,
} from '../../data/types'
import { LANGUAGE_OPTIONS, PERIOD_OPTIONS, SESSION_DAY_OPTIONS } from '../../lib/catalog'
import { formatGroupLabel, formatSessionDay } from '../../lib/format'
import { useGroups } from '../../layouts/GroupProvider'
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

/**
 * Alumnos Registrados: el profesor da de alta alumnos sin que contesten el 1.0,
 * uno por uno o con un Excel. Cada alta crea también la cuenta de acceso
 * (usuario = correo, contraseña inicial = matrícula). Ver `0031`.
 */
export function RegisteredStudentsPage() {
  const [form, setForm] = useState<StudentRegistrationInput>(EMPTY_FORM)
  const [preview, setPreview] = useState<ParsedRegistrationRow[] | null>(null)
  const [results, setResults] = useState<RegistrationResult[] | null>(null)
  const [sending, setSending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const fileInput = useRef<HTMLInputElement>(null)

  const groupContext = useGroups()
  const groups = groupContext?.groups

  const {
    data: students,
    loading,
    isConnected,
    error,
  } = useRepositoryQuery(() => repository.getRegisteredStudents(), [] as RegisteredStudent[], [
    refreshKey,
  ])

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

  function setField(key: keyof StudentRegistrationInput, value: string) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  const formError = validateRegistration(form)
  const validRows = preview?.filter((row) => !row.error) ?? []

  async function submit(rows: StudentRegistrationInput[]) {
    setSending(true)
    setMessage(null)
    try {
      setResults(await repository.registerStudents(rows))
      setRefreshKey((key) => key + 1)
      // Los conteos de alumnos por grupo cambiaron.
      groupContext?.refetch()
      return true
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'No se pudo registrar a los alumnos.')
      return false
    } finally {
      setSending(false)
    }
  }

  async function handleSingle() {
    if (formError) return
    if (await submit([form])) setForm(EMPTY_FORM)
  }

  async function handleFile(file: File | undefined) {
    setMessage(null)
    setResults(null)
    setPreview(null)
    if (!file) return
    try {
      setPreview(await parseRegistrationFile(file))
    } catch {
      setMessage('No se pudo leer el archivo. Usa un .xlsx con el orden de la plantilla.')
    }
  }

  async function handleImport() {
    if (validRows.length === 0) return
    if (await submit(validRows.map((row) => row.input))) {
      setPreview(null)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  return (
    <>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-ink-950">Alumnos Registrados</h1>
        <p className="mt-1.5 text-sm text-ink-500">
          Da de alta alumnos para que tengan cuenta sin contestar los Datos Demográficos. Su
          usuario es el correo y su contraseña inicial es la matrícula. Periodo, frecuencia e
          idioma deben corresponder a un grupo que ya exista (ver Administrar grupos).
        </p>
      </header>

      {message && <p className="mb-4 text-sm text-red-700">{message}</p>}

      <section className="mb-6 rounded-xl border border-ink-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-ink-900">Registrar un alumno</h2>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <input
            aria-label="Correo UDEM"
            type="email"
            placeholder="Correo UDEM"
            value={form.email}
            onChange={(event) => setField('email', event.target.value)}
            className={`${FIELD_INPUT} w-72`}
          />
          <input
            aria-label="Matrícula"
            placeholder="Matrícula"
            value={form.studentNumber}
            onChange={(event) => setField('studentNumber', event.target.value)}
            className={`${FIELD_INPUT} w-36`}
          />
          <Select
            label="Periodo"
            value={form.periodCode}
            options={PERIOD_OPTIONS}
            onChange={(value) => setField('periodCode', value)}
          />
          <Select
            label="Frecuencia"
            value={form.sessionDay}
            options={SESSION_DAY_OPTIONS}
            onChange={(value) => setField('sessionDay', value)}
          />
          <Select
            label="Idioma"
            value={form.language}
            options={LANGUAGE_OPTIONS}
            onChange={(value) => setField('language', value)}
          />
          <button type="button" disabled={!!formError || sending} onClick={handleSingle} className={PRIMARY_BUTTON}>
            {sending ? 'Registrando…' : 'Registrar'}
          </button>
        </div>
        {form.email && formError && <p className="mt-3 text-sm text-ink-500">{formError}</p>}
      </section>

      <section className="mb-6 rounded-xl border border-ink-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-ink-900">Importar desde Excel</h2>
          <button
            type="button"
            onClick={() => void downloadRegistrationTemplate()}
            className="text-sm font-medium text-ink-600 hover:text-ink-900"
          >
            Descargar plantilla
          </button>
        </div>
        <p className="mt-1 text-sm text-ink-500">
          Columnas, en este orden: Correo UDEM, Matrícula, Periodo, Frecuencia e Idioma.
        </p>

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
                <button
                  type="button"
                  disabled={validRows.length === 0 || sending}
                  onClick={handleImport}
                  className={`${PRIMARY_BUTTON} mt-4`}
                >
                  {sending ? 'Registrando…' : `Registrar ${validRows.length} alumnos`}
                </button>
              </>
            )}
          </div>
        )}
      </section>

      {results && <ResultsSection results={results} />}

      <p className="mb-2 text-xs text-ink-500">
        Las filas en rojo son alumnos que todavía no contestan los Datos Demográficos.
      </p>
      <DataTable
        columns={columns}
        rows={students}
        rowKey={(row) => row.studentId}
        // El nombre solo llega con el formulario 1.0: sin él, el alumno no lo ha contestado.
        rowAlert={(row) => row.fullName === null}
        loading={loading}
        isConnected={isConnected}
        error={error}
      />
    </>
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

function ResultsSection({ results }: { results: RegistrationResult[] }) {
  const failed = results.filter((result) => result.outcome.startsWith('error')).length
  return (
    <section className="mb-6 rounded-xl border border-ink-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-ink-200 px-5 py-3">
        <h2 className="text-sm font-semibold text-ink-900">Resultado</h2>
        <p className="text-xs text-ink-500">
          {results.length - failed} registrados · {failed} con error
        </p>
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
