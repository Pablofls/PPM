import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'

import { useAuth } from '../../auth/AuthProvider'
import { useRepositoryQuery, useWeeklyLogRows } from '../../data/hooks'
import { repository } from '../../data/repository'
import type {
  InternshipLogRow,
  JobSearchLogRow,
  SemesterWeek,
  WeeklyLogStatusCell,
} from '../../data/types'
import type { WeeklyField, WeeklyFormCode, WeeklyFormMeta } from '../../lib/catalog'
import { formatDate, formatDateTime, formatWeekRange } from '../../lib/format'
import { celebrationKind, type CelebrationKind } from '../../lib/celebration'
import { targetWeek } from '../../lib/weeks'
import { Badge } from '../../components/Badge'
import { SubmissionCelebration } from '../../components/SubmissionCelebration'
import { Toast } from '../../components/Toast'
import { useStudentDossier } from '../../components/StudentDossier'
import { useWeeklyLogStatus } from '../../components/SubmissionStatusGrid'
import { usePermissions } from '../../auth/PermissionsProvider'

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
 * Las semanas se entregan en orden (`0043_weekly_log_sequential.sql`): la única
 * que se puede llenar es la primera pendiente. Si ya cerró, es una entrega
 * tardía. Cuando no se debe ninguna, es la semana de hoy, y mientras siga
 * siendo la de hoy se puede corregir en vez de acumular una entrega más: es la
 * excepción acotada a «Historial completo» de CLAUDE.md que abre
 * `0020_weekly_log_current_week_only.sql`. En cuanto la semana termina, la
 * entrega vuelve a ser inmutable para siempre.
 */
export function WeeklyLogPage({ form }: { form: WeeklyFormMeta }) {
  const { portalStudentId: studentId, portalReadOnly } = useAuth()
  // Entregar exige «Puede editar» en esta bitácora (0038); con «Solo
  // lectura» se ven las entregas anteriores y el formulario deshabilitado.
  const { can, loading: loadingPermissions } = usePermissions()
  const [refreshKey, setRefreshKey] = useState(0)
  const [celebration, setCelebration] = useState<CelebrationKind | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  // El admin en «Ver como Alumno» recibe las semanas de TODOS los grupos
  // (RLS de admin); el alumno, solo las del suyo. Se acotan al grupo del
  // alumno que se está viendo para calcular la misma semana que él ve.
  const { dossier } = useStudentDossier(portalReadOnly ? studentId : null)

  const { entries, loading, error } = useMyLogs(form.code, studentId, refreshKey)
  // Qué semanas están entregadas (con cualquiera de las dos bitácoras): de ahí
  // sale la semana que toca. `entries` solo trae las de esta bitácora.
  const { weeks: statusCells, loaded: statusLoaded } = useWeeklyLogStatus(studentId, refreshKey)
  const {
    data: allWeeks,
    loading: weeksLoading,
    error: weeksError,
  } = useRepositoryQuery(() => repository.getSemesterWeeks(), [] as SemesterWeek[], [])
  const studentWeeks = portalReadOnly
    ? allWeeks.filter((week) => week.groupId === dossier?.groupId)
    : allWeeks

  // Al entregar o corregir la alumna se queda en la bitácora: se celebra ahí
  // mismo (sello o confeti) y ella decide cuándo salir. Las entregas y las
  // semanas se recargan al terminar la celebración (`endCelebration`): hacerlo
  // antes mete renders y red en medio de la animación y la traba.
  const onSubmitted = useCallback(
    (updated: boolean, late: boolean) => {
      if (updated) setToast(`Actualizaste tu ${form.name}. Tu profesor ya puede verlo.`)
      // Corregir la semana en curso también se celebra (nunca es tardía).
      setCelebration(celebrationKind(late))
    },
    [form.name],
  )
  const endCelebration = useCallback(() => {
    setCelebration(null)
    setRefreshKey((key) => key + 1)
  }, [])

  // Sin acceso a esta bitácora, de vuelta a la lista de tareas.
  if (!loadingPermissions && !can(form.code)) return <Navigate to="/alumno" replace />

  return (
    <>
      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
      {celebration && (
        <SubmissionCelebration kind={celebration} onDone={endCelebration} />
      )}

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

      <SubmissionForm
        form={form}
        onSubmitted={onSubmitted}
        celebrating={celebration !== null}
        readOnly={portalReadOnly || !can(form.code, 'edicion')}
        weeks={studentWeeks}
        weeksLoading={weeksLoading}
        weeksError={weeksError}
        entries={entries}
        entriesLoading={loading || !statusLoaded}
        statusCells={statusCells}
      />

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

/** Cuánto espera el alumno para volver a entregar o actualizar. */
const SUBMIT_COOLDOWN_MS = 10_000

function SubmissionForm({
  form,
  onSubmitted,
  celebrating,
  weeks,
  weeksLoading,
  weeksError,
  entries,
  entriesLoading,
  statusCells,
  readOnly,
}: {
  form: WeeklyFormMeta
  onSubmitted: (updated: boolean, late: boolean) => void
  /** Mientras dura el sello o el confeti no se puede volver a entregar. */
  celebrating: boolean
  /** «Ver como Alumno» del admin: se ve el formulario, pero no se entrega en su nombre. */
  readOnly: boolean
  weeks: SemesterWeek[]
  weeksLoading: boolean
  weeksError: string | null
  entries: Entry[]
  entriesLoading: boolean
  statusCells: WeeklyLogStatusCell[]
}) {
  // Se rearma al cambiar de tarea: los campos son otros y un valor a medio
  // escribir no debe cruzarse de una bitácora a la otra.
  const [values, setValues] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  // Enfriamiento tras entregar o actualizar: evita spamear el botón para
  // disparar confeti una y otra vez.
  const [cooling, setCooling] = useState(false)
  useEffect(() => {
    if (!cooling) return
    const timer = window.setTimeout(() => setCooling(false), SUBMIT_COOLDOWN_MS)
    return () => window.clearTimeout(timer)
  }, [cooling])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setValues({})
    setError(null)
  }, [form.code])

  // La única semana posible es la que toca (la primera pendiente, o la de hoy
  // si no se debe ninguna): no hay selector. Solo la semana en curso se
  // corrige; una atrasada se entrega por primera vez, como entrega tardía.
  const target = targetWeek(statusCells)
  const currentWeek = target
    ? weeks.find((week) => week.weekNumber === target.cell.weekNumber)
    : undefined
  const isLate = target?.late ?? false
  const existingEntry =
    currentWeek && !isLate
      ? entries.find((entry) => entry.weekStart === currentWeek.weekStart)
      : undefined

  // Al pasar a otra semana el formulario es nuevo. Va antes de la precarga:
  // si esa semana ya tiene entrega, la precarga gana.
  useEffect(() => {
    setValues({})
  }, [currentWeek?.weekNumber])

  // Precarga el formulario con lo ya entregado en cuanto se sabe cuál es esa
  // entrega -no antes, porque hasta que cargan `entries` no hay con qué-. Se
  // dispara por `submissionId` y no por el objeto para no rearmar los campos
  // en cada render mientras el alumno sigue escribiendo.
  useEffect(() => {
    if (!existingEntry) return
    setValues(
      Object.fromEntries(
        form.fields.map((field) => [field.key, valueToString(existingEntry.values[field.key])]),
      ),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingEntry?.submissionId])

  const faltantes = form.fields.filter(
    (field) => field.required && !values[field.key]?.trim(),
  )
  const puedeEnviar =
    !readOnly && !saving && !celebrating && !cooling && currentWeek !== undefined && !faltantes.length

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!puedeEnviar || !currentWeek) return

    setSaving(true)
    setError(null)

    try {
      if (existingEntry) {
        await update(form.code, existingEntry.submissionId, values)
      } else {
        await submit(form.code, currentWeek.weekNumber, values)
      }
      setCooling(true)
      onSubmitted(Boolean(existingEntry), isLate)
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : existingEntry
            ? 'No se pudo guardar tu corrección.'
            : 'No se pudo guardar tu entrega.',
      )
    } finally {
      setSaving(false)
    }
  }

  // Sin semanas configuradas, o con hoy fuera de todas las configuradas, no
  // hay qué formulario mostrar: una explicación directa dice más que un
  // formulario deshabilitado sin más contexto.
  if (!weeksLoading && !weeksError) {
    if (weeks.length === 0) {
      return (
        <div className="mt-6 rounded-xl border border-dashed border-ink-200 bg-ink-50/50 p-6 text-sm text-ink-600">
          Tu profesor todavía no configuró las semanas de este periodo. Vuelve
          más tarde para entregar tu bitácora.
        </div>
      )
    }
    if (!currentWeek) {
      return (
        <div className="mt-6 rounded-xl border border-dashed border-ink-200 bg-ink-50/50 p-6 text-sm text-ink-600">
          Hoy no cae dentro de ninguna semana configurada de tu periodo.
          Contacta a tu profesor.
        </div>
      )
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-6 rounded-xl border border-ink-200 bg-white p-6 shadow-sm"
    >
      <h2 className="text-sm font-semibold text-ink-900">
        {existingEntry
          ? 'Tu entrega de esta semana'
          : isLate && currentWeek
            ? `Entrega tardía · semana ${currentWeek.weekNumber}`
            : 'Nueva entrega'}
      </h2>

      {isLate && currentWeek && target && (
        <p
          role="status"
          className="mt-3 rounded-lg border border-accent-300 bg-accent-100 px-3 py-2 text-sm text-ink-900"
        >
          <strong>Entrega tardía.</strong> La semana {currentWeek.weekNumber} cerró el{' '}
          {formatDate(currentWeek.weekEnd)} y no la entregaste a tiempo. Tienes que
          entregarla para poder llenar las que siguen
          {target.pendingAfter > 0
            ? ` (te quedan ${target.pendingAfter} más por entregar después de esta).`
            : ' hasta llegar a la semana actual.'}{' '}
          Tu profesor verá que fue fuera de tiempo.
        </p>
      )}

      <fieldset
        className="mt-5"
        disabled={readOnly || saving || weeksLoading || entriesLoading}
      >
        <legend className="sr-only">Semana que reportas</legend>
        <div className="sm:max-w-xs">
          <Field label="Semana que reportas">
            {weeksError ? (
              <p className="text-sm text-red-700">{weeksError}</p>
            ) : currentWeek ? (
              <p className="text-sm font-medium text-ink-900">
                Semana {currentWeek.weekNumber} ·{' '}
                {formatWeekRange(currentWeek.weekStart, currentWeek.weekEnd)}
              </p>
            ) : (
              <p className="text-sm text-ink-500">Cargando…</p>
            )}
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
          {existingEntry
            ? saving
              ? 'Actualizando…'
              : 'Actualizar'
            : saving
              ? 'Entregando…'
              : 'Entregar'}
        </button>
        <p className="text-xs text-ink-500">
          {readOnly
            ? 'Vista de solo lectura: aquí no se puede entregar.'
            : existingEntry
              ? 'Puedes seguir corrigiéndola mientras siga siendo esta semana.'
              : isLate
                ? 'Una entrega tardía ya no se puede corregir.'
                : 'Podrás corregirla mientras siga siendo esta semana.'}
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

function useMyLogs(code: WeeklyFormCode, studentId: string | null, refreshKey: number) {
  const { data, loading, error, refetch } = useWeeklyLogRows(code, studentId)
  const entries = useMemo(() => data.map(toEntry), [data])

  // Una recarga tras entregar es silenciosa: mostrar «Cargando…» encogería
  // la página y movería el scroll de quien acaba de entregar. `refetch` deja
  // las entregas a la vista hasta que llegan las nuevas.
  const lastRefresh = useRef(refreshKey)
  useEffect(() => {
    if (lastRefresh.current === refreshKey) return
    lastRefresh.current = refreshKey
    refetch()
  }, [refreshKey, refetch])

  return { entries, loading, error }
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
  weekNumber: number,
  values: Record<string, string>,
): Promise<void> {
  const texto = (key: string) => values[key]?.trim() ?? ''

  if (code === 'form_busqueda') {
    return repository.submitJobSearchLog({
      weekNumber,
      activities: texto('activities'),
      applications: texto('applications'),
      interviews: texto('interviews'),
      learnings: texto('learnings'),
      nextSteps: texto('nextSteps'),
    })
  }

  const horas = texto('hoursWorked')
  return repository.submitInternshipLog({
    weekNumber,
    activities: texto('activities'),
    // Vacío es NULL y no 0: una semana sin horas capturadas no es una semana de
    // cero horas, y el acumulado del profesor las trata distinto.
    hoursWorked: horas === '' ? null : Number(horas),
    skillsPracticed: texto('skillsPracticed'),
    proposal: texto('proposal'),
  })
}

/** Corrige el contenido de una entrega que ya existe. Misma semana, otro contenido. */
function update(
  code: WeeklyFormCode,
  submissionId: string,
  values: Record<string, string>,
): Promise<void> {
  const texto = (key: string) => values[key]?.trim() ?? ''

  if (code === 'form_busqueda') {
    return repository.updateJobSearchLog({
      submissionId,
      activities: texto('activities'),
      applications: texto('applications'),
      interviews: texto('interviews'),
      learnings: texto('learnings'),
      nextSteps: texto('nextSteps'),
    })
  }

  const horas = texto('hoursWorked')
  return repository.updateInternshipLog({
    submissionId,
    activities: texto('activities'),
    hoursWorked: horas === '' ? null : Number(horas),
    skillsPracticed: texto('skillsPracticed'),
    proposal: texto('proposal'),
  })
}

/** El valor de una entrega ya hecha, como texto para precargar un campo del formulario. */
function valueToString(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value)
}
