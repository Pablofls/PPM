import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { useAuth } from '../../auth/AuthProvider'
import { repository } from '../../data/repository'
import type { InternshipLogRow, JobSearchLogRow } from '../../data/types'
import type { WeeklyField, WeeklyFormCode, WeeklyFormMeta } from '../../lib/catalog'
import { formatDateTime, formatWeekRange } from '../../lib/format'
import { Badge } from '../../components/Badge'

/**
 * Una bitácora semanal, como una tarea de Canvas: instrucciones arriba, el
 * formulario de entrega en medio y las entregas anteriores abajo.
 *
 * Sirve a las dos —Reporte de Búsqueda y Reporte de Prácticas— porque la única
 * diferencia entre ellas son sus campos, y esos viven en `WEEKLY_FORMS`
 * (`src/lib/catalog.ts`). Las claves de los campos son las mismas propiedades
 * de `JobSearchLogRow` e `InternshipLogRow`, así que el mismo catálogo dibuja
 * el formulario en blanco y las entregas ya hechas.
 *
 * Una entrega nueva nunca reemplaza a la anterior: se acumulan, y el profesor
 * las ve todas en el expediente (regla «Historial completo» de CLAUDE.md).
 */
export function WeeklyLogPage({ form }: { form: WeeklyFormMeta }) {
  const { profile } = useAuth()
  const studentId = profile?.student_id ?? null

  const { entries, loading, error, reload } = useMyLogs(form.code, studentId)
  const [sent, setSent] = useState(false)

  const onSubmitted = useCallback(() => {
    setSent(true)
    reload()
  }, [reload])

  return (
    <>
      <Link
        to="/alumno"
        className="text-sm font-medium text-ink-500 transition-colors hover:text-ink-900"
      >
        ← Mis tareas
      </Link>

      <header className="mt-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-ink-950">
            {form.name}
          </h1>
          <Badge tone="violet">Semanal</Badge>
        </div>
        <p className="mt-1 text-sm text-ink-600">{form.subtitle}</p>
      </header>

      <section className="mt-6 rounded-xl border border-ink-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-ink-900">Instrucciones</h2>
        <ul className="mt-3 space-y-2">
          {form.instructions.map((linea) => (
            <li key={linea} className="flex gap-2 text-sm leading-relaxed text-ink-600">
              <span aria-hidden="true" className="text-ink-300">
                •
              </span>
              {linea}
            </li>
          ))}
        </ul>
      </section>

      {sent && (
        <p
          role="status"
          className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-900"
        >
          Tu entrega quedó registrada. Tu profesor ya puede verla.
        </p>
      )}

      <SubmissionForm form={form} onSubmitted={onSubmitted} />

      <PreviousEntries
        fields={form.fields}
        entries={entries}
        loading={loading}
        error={error}
      />
    </>
  )
}

// ---------------------------------------------------------------------------
// El formulario de entrega
// ---------------------------------------------------------------------------

function SubmissionForm({
  form,
  onSubmitted,
}: {
  form: WeeklyFormMeta
  onSubmitted: () => void
}) {
  // Se rearma al cambiar de tarea: los campos son otros y un valor a medio
  // escribir no debe cruzarse de una bitácora a la otra.
  const [values, setValues] = useState<Record<string, string>>({})
  const [week, setWeek] = useState(currentWeek)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setValues({})
    setWeek(currentWeek())
    setError(null)
  }, [form.code])

  const faltantes = form.fields.filter(
    (field) => field.required && !values[field.key]?.trim(),
  )
  const puedeEnviar = !saving && week.start !== '' && week.end !== '' && !faltantes.length

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!puedeEnviar) return

    setSaving(true)
    setError(null)

    try {
      await submit(form.code, week, values)
      setValues({})
      setWeek(currentWeek())
      onSubmitted()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo guardar tu entrega.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-6 rounded-xl border border-ink-200 bg-white p-6 shadow-sm"
    >
      <h2 className="text-sm font-semibold text-ink-900">Nueva entrega</h2>

      <fieldset className="mt-5" disabled={saving}>
        <legend className="sr-only">Semana que reportas</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Inicio de la semana" required>
            <input
              type="date"
              required
              value={week.start}
              max={today()}
              onChange={(event) => setWeek({ ...week, start: event.target.value })}
              className={INPUT}
            />
          </Field>
          <Field label="Final de la semana" required>
            <input
              type="date"
              required
              value={week.end}
              min={week.start || undefined}
              onChange={(event) => setWeek({ ...week, end: event.target.value })}
              className={INPUT}
            />
          </Field>
        </div>

        <div className="mt-5 space-y-5">
          {form.fields.map((field) => (
            <Field key={field.key} label={field.label} help={field.help} required={field.required}>
              {field.type === 'numero' ? (
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.5"
                  min="0"
                  max="168"
                  required={field.required}
                  value={values[field.key] ?? ''}
                  onChange={(event) =>
                    setValues({ ...values, [field.key]: event.target.value })
                  }
                  className={`${INPUT} tnum sm:max-w-40`}
                />
              ) : (
                <textarea
                  rows={3}
                  required={field.required}
                  value={values[field.key] ?? ''}
                  onChange={(event) =>
                    setValues({ ...values, [field.key]: event.target.value })
                  }
                  className={`${INPUT} resize-y`}
                />
              )}
            </Field>
          ))}
        </div>
      </fieldset>

      {error && (
        <p role="alert" className="mt-5 text-sm text-red-800">
          {error}
        </p>
      )}

      <div className="mt-6 flex items-center gap-4 border-t border-ink-100 pt-5">
        <button
          type="submit"
          disabled={!puedeEnviar}
          className="rounded-lg bg-ink-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-ink-800 disabled:cursor-not-allowed disabled:bg-ink-300"
        >
          {saving ? 'Entregando…' : 'Entregar'}
        </button>
        <p className="text-xs text-ink-500">
          Una vez entregada no se puede editar. Si te equivocaste, vuelve a
          entregar la semana.
        </p>
      </div>
    </form>
  )
}

const INPUT =
  'w-full rounded-lg border border-ink-300 bg-white px-3 py-2 text-sm text-ink-900 shadow-sm outline-none transition-colors placeholder:text-ink-400 focus:border-ink-500 focus:ring-2 focus:ring-ink-200 disabled:bg-ink-50'

function Field({
  label,
  help,
  required,
  children,
}: {
  label: string
  help?: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-ink-800">
        {label}
        {required && (
          <span aria-hidden="true" className="ml-1 text-red-700">
            *
          </span>
        )}
      </span>
      {help && <span className="mt-0.5 block text-xs text-ink-500">{help}</span>}
      <div className="mt-2">{children}</div>
    </label>
  )
}

// ---------------------------------------------------------------------------
// Las entregas anteriores
// ---------------------------------------------------------------------------

/**
 * Lo que el alumno ya entregó, de la semana más reciente a la más antigua.
 *
 * Incluye lo que entregó por Google Forms antes de que existiera esta pantalla:
 * las dos vías escriben en la misma tabla y aquí no se distinguen, que es justo
 * lo que se quiere.
 */
function PreviousEntries({
  fields,
  entries,
  loading,
  error,
}: {
  fields: WeeklyField[]
  entries: Entry[]
  loading: boolean
  error: string | null
}) {
  return (
    <section className="mt-8">
      <h2 className="px-1 text-[11px] font-semibold tracking-widest text-ink-500 uppercase">
        Tus entregas {entries.length > 0 && `· ${entries.length}`}
      </h2>

      {error ? (
        <p className="mt-2 rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-800">
          {error}
        </p>
      ) : loading ? (
        <p className="mt-2 px-1 text-sm text-ink-500">Cargando…</p>
      ) : entries.length === 0 ? (
        <p className="mt-2 rounded-xl border border-dashed border-ink-200 bg-ink-50/50 px-5 py-6 text-sm text-ink-500">
          Todavía no has entregado ninguna semana.
        </p>
      ) : (
        <ol className="mt-2 space-y-3">
          {entries.map((entry) => (
            <li
              key={entry.submissionId}
              className="rounded-xl border border-ink-200 bg-white p-5 shadow-sm"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <p className="text-sm font-semibold text-ink-900">
                  {formatWeekRange(entry.weekStart, entry.weekEnd) || 'Semana sin fecha'}
                </p>
                <p className="text-xs text-ink-500">
                  Entregada el {formatDateTime(entry.submittedAt)}
                </p>
              </div>

              <dl className="mt-4 space-y-3">
                {fields.map((field) => (
                  <div key={field.key} className="sm:flex sm:gap-4">
                    <dt className="w-40 shrink-0 text-xs text-ink-500">{field.label}</dt>
                    <dd className="min-w-0 text-sm whitespace-pre-line text-ink-800">
                      {formatValue(entry.values[field.key])}
                    </dd>
                  </div>
                ))}
              </dl>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  return String(value)
}

// ---------------------------------------------------------------------------
// Datos
// ---------------------------------------------------------------------------

/**
 * Una entrega ya hecha, con sus respuestas indexadas por la clave del campo.
 *
 * Se aplana así porque las claves de `WeeklyField` son las propiedades de
 * `JobSearchLogRow` e `InternshipLogRow`: con eso, el mismo catálogo que dibuja
 * el formulario dibuja también el historial, sin una segunda lista de columnas
 * que mantener en sincronía.
 */
interface Entry {
  submissionId: string
  submittedAt: string | null
  weekStart: string | null
  weekEnd: string | null
  values: Record<string, unknown>
}

function useMyLogs(code: WeeklyFormCode, studentId: string | null) {
  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)

  const reload = useCallback(() => setNonce((value) => value + 1), [])

  useEffect(() => {
    if (!studentId) {
      setEntries([])
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    const query =
      code === 'form_busqueda'
        ? repository.getJobSearchLogs(studentId)
        : repository.getInternshipLogs(studentId)

    query
      .then((rows: (JobSearchLogRow | InternshipLogRow)[]) => {
        if (cancelled) return
        setEntries(rows.map(toEntry))
        setLoading(false)
      })
      .catch((cause: unknown) => {
        if (cancelled) return
        setEntries([])
        setError(
          cause instanceof Error
            ? cause.message
            : 'No se pudieron cargar tus entregas.',
        )
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [code, studentId, nonce])

  return { entries, loading, error, reload }
}

function toEntry(row: JobSearchLogRow | InternshipLogRow): Entry {
  return {
    submissionId: row.submissionId,
    submittedAt: row.submittedAt,
    weekStart: row.weekStart,
    weekEnd: row.weekEnd,
    values: row as unknown as Record<string, unknown>,
  }
}

function submit(
  code: WeeklyFormCode,
  week: { start: string; end: string },
  values: Record<string, string>,
): Promise<void> {
  const texto = (key: string) => values[key]?.trim() ?? ''

  if (code === 'form_busqueda') {
    return repository.submitJobSearchLog({
      weekStart: week.start,
      weekEnd: week.end,
      activities: texto('activities'),
      applications: texto('applications'),
      interviews: texto('interviews'),
      learnings: texto('learnings'),
      nextSteps: texto('nextSteps'),
    })
  }

  const horas = texto('hoursWorked')
  return repository.submitInternshipLog({
    weekStart: week.start,
    weekEnd: week.end,
    activities: texto('activities'),
    // Vacío es NULL y no 0: una semana sin horas capturadas no es una semana de
    // cero horas, y el acumulado del profesor las trata distinto.
    hoursWorked: horas === '' ? null : Number(horas),
    skillsPracticed: texto('skillsPracticed'),
    proposal: texto('proposal'),
  })
}

// ---------------------------------------------------------------------------
// La semana que se propone por omisión
// ---------------------------------------------------------------------------

function today(): string {
  return isoDate(new Date())
}

/**
 * Lunes a domingo de la semana en curso.
 *
 * Se propone en vez de dejar los campos vacíos porque es la respuesta correcta
 * casi siempre, y porque las fechas mal capturadas fueron el error más común de
 * la bitácora en el Sheets (ver docs/DATA_MAPPING.md). El alumno la puede
 * cambiar: reportar una semana atrasada es legítimo.
 */
function currentWeek(): { start: string; end: string } {
  const hoy = new Date()
  const lunes = new Date(hoy)
  // getDay(): 0 es domingo. El domingo pertenece a la semana que termina.
  lunes.setDate(hoy.getDate() - ((hoy.getDay() + 6) % 7))

  const domingo = new Date(lunes)
  domingo.setDate(lunes.getDate() + 6)

  return { start: isoDate(lunes), end: isoDate(domingo) }
}

/** `YYYY-MM-DD` en la zona local, que es lo que espera `<input type="date">`. */
function isoDate(value: Date): string {
  const mes = String(value.getMonth() + 1).padStart(2, '0')
  const dia = String(value.getDate()).padStart(2, '0')
  return `${value.getFullYear()}-${mes}-${dia}`
}
