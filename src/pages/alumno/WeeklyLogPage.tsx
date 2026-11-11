import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'

import { useAuth } from '../../auth/AuthProvider'
import { useRepositoryQuery, useWeeklyLogRows } from '../../data/hooks'
import { repository } from '../../data/repository'
import type {
  InternshipLogRow,
  JobSearchLogRow,
  SemesterWeek,
  StudentDossier,
  WeeklyLogStatusCell,
} from '../../data/types'
import {
  localizeWeeklyForm,
  type WeeklyField,
  type WeeklyFormCode,
  type WeeklyFormMeta,
} from '../../lib/catalog'
import { translateServerText, useLang, useT } from '../../lib/i18n'
import { downloadWeeklyLogPdf } from '../../lib/weeklyLogPdf'
import { formatDate, formatDateTime, formatWeekRange } from '../../lib/format'
import { celebrationKind, type CelebrationKind } from '../../lib/celebration'
import { targetWeek } from '../../lib/weeks'
import { Badge } from '../../components/Badge'
import { Field, INPUT } from '../../components/ActivityField'
import { SubmissionCelebration } from '../../components/SubmissionCelebration'
import { Toast } from '../../components/Toast'
import { useStudentDossier } from '../../components/StudentDossier'
import { useWeeklyLogStatus } from '../../components/SubmissionStatusGrid'
import { usePermissions } from '../../auth/PermissionsProvider'
import { activityState } from '../../lib/activities'
import { useMyActivities } from './useMyActivities'

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
export function WeeklyLogPage({ form: baseForm }: { form: WeeklyFormMeta }) {
  const t = useT()
  const lang = useLang()
  const form = useMemo(() => localizeWeeklyForm(baseForm, lang), [baseForm, lang])
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
  // También da nombre, matrícula, empresa y puesto al PDF descargable.
  const { dossier } = useStudentDossier(studentId)

  const { rows, entries, loading, error } = useMyLogs(form.code, studentId, refreshKey)
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
      if (updated) {
        setToast(
          t(
            `Actualizaste tu ${form.name}. Tu profesor ya puede verlo.`,
            `You updated your ${form.name}. Your professor can see it now.`,
          ),
        )
      }
      // Corregir la semana en curso también se celebra (nunca es tardía).
      setCelebration(celebrationKind(late))
    },
    [form.name, t],
  )
  const endCelebration = useCallback(() => {
    setCelebration(null)
    setRefreshKey((key) => key + 1)
  }, [])

  // La actividad (0051): sin publicar o programada, el alumno no la ve; si ya
  // pasó «Disponible hasta», la ve Cerrada, con sus entregas, sin formulario.
  const { byCode, loading: loadingActivities } = useMyActivities()
  const activity = byCode(form.code)
  const closed = activity !== undefined && activityState(activity) === 'cerrada'
  const instructions = activity?.instructions
    ? activity.instructions.split('\n').filter((line) => line.trim() !== '')
    : form.instructions

  // Sin acceso a esta bitácora, o sin publicar, de vuelta a Actividades.
  if (!loadingPermissions && !can(form.code)) return <Navigate to="/alumno/actividades" replace />
  if (!loadingActivities && !activity) return <Navigate to="/alumno/actividades" replace />

  return (
    <>
      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
      {celebration && (
        <SubmissionCelebration kind={celebration} onDone={endCelebration} />
      )}

      <Link
        to="/alumno/actividades"
        className="text-sm font-medium text-ink-500 transition-colors hover:text-ink-900"
      >
        ← {t('Actividades', 'Assignments')}
      </Link>

      <header className="mt-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-ink-950">
            {form.name}
          </h1>
          <Badge tone="violet">{t('Semanal', 'Weekly')}</Badge>
        </div>
        <p className="mt-1 text-sm text-ink-600">{form.subtitle}</p>
      </header>

      <section className="mt-6 rounded-xl border border-ink-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-ink-900">{t('Instrucciones', 'Instructions')}</h2>
        <ul className="mt-3 space-y-2">
          {instructions.map((linea) => (
            <li key={linea} className="flex gap-2 text-sm leading-relaxed text-ink-600">
              <span aria-hidden="true" className="text-ink-300">
                •
              </span>
              {linea}
            </li>
          ))}
        </ul>
      </section>

      {closed && activity?.availableUntil ? (
        <div className="mt-6 rounded-xl border border-red-200 bg-red-50/60 p-6 text-sm text-red-900">
          <p className="font-semibold">{t('Actividad cerrada', 'Assignment closed')}</p>
          <p className="mt-1 text-red-800">
            {t(
              `Cerró el ${formatDateTime(activity.availableUntil, lang)}. Ya no se puede entregar; abajo están tus entregas.`,
              `It closed on ${formatDateTime(activity.availableUntil, lang)}. You can no longer submit; your submissions are below.`,
            )}
          </p>
        </div>
      ) : (
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
      )}

      <div className="mt-8 flex justify-end">
        <DownloadPdfButton
          form={form}
          rows={rows}
          dossier={dossier}
          disabled={loading || rows.length === 0}
          onError={setToast}
        />
      </div>

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
  const t = useT()
  const lang = useLang()

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
          ? translateServerText(cause.message, lang)
          : existingEntry
            ? t('No se pudo guardar tu corrección.', 'Your changes could not be saved.')
            : t('No se pudo guardar tu entrega.', 'Your submission could not be saved.'),
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
          {t(
            'Tu profesor todavía no configuró las semanas de este periodo. Vuelve más tarde para entregar tu bitácora.',
            'Your professor has not set up the weeks for this term yet. Come back later to submit your log.',
          )}
        </div>
      )
    }
    if (!currentWeek) {
      return (
        <div className="mt-6 rounded-xl border border-dashed border-ink-200 bg-ink-50/50 p-6 text-sm text-ink-600">
          {t(
            'Hoy no cae dentro de ninguna semana configurada de tu periodo. Contacta a tu profesor.',
            'Today does not fall within any week set up for your term. Contact your professor.',
          )}
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
          ? t('Tu entrega de esta semana', 'Your submission for this week')
          : isLate && currentWeek
            ? t(
                `Entrega tardía · semana ${currentWeek.weekNumber}`,
                `Late submission · week ${currentWeek.weekNumber}`,
              )
            : t('Nueva entrega', 'New submission')}
      </h2>

      {isLate && currentWeek && target && (
        <p
          role="status"
          className="mt-3 rounded-lg border border-accent-300 bg-accent-100 px-3 py-2 text-sm text-ink-900"
        >
          {lang === 'en' ? (
            <>
              <strong>Late submission.</strong> Week {currentWeek.weekNumber} closed on{' '}
              {formatDate(currentWeek.weekEnd, lang)} and you did not submit it on time. You have
              to submit it before you can fill in the following ones
              {target.pendingAfter > 0
                ? ` (you have ${target.pendingAfter} more to submit after this one).`
                : ' up to the current week.'}{' '}
              Your professor will see that it was late.
            </>
          ) : (
            <>
              <strong>Entrega tardía.</strong> La semana {currentWeek.weekNumber} cerró el{' '}
              {formatDate(currentWeek.weekEnd)} y no la entregaste a tiempo. Tienes que
              entregarla para poder llenar las que siguen
              {target.pendingAfter > 0
                ? ` (te quedan ${target.pendingAfter} más por entregar después de esta).`
                : ' hasta llegar a la semana actual.'}{' '}
              Tu profesor verá que fue fuera de tiempo.
            </>
          )}
        </p>
      )}

      <fieldset
        className="mt-5"
        disabled={readOnly || saving || weeksLoading || entriesLoading}
      >
        <legend className="sr-only">{t('Semana que reportas', 'Week you are reporting')}</legend>
        <div className="sm:max-w-xs">
          <Field label={t('Semana que reportas', 'Week you are reporting')}>
            {weeksError ? (
              <p className="text-sm text-red-700">{translateServerText(weeksError, lang)}</p>
            ) : currentWeek ? (
              <p className="text-sm font-medium text-ink-900">
                {t('Semana', 'Week')} {currentWeek.weekNumber} ·{' '}
                {formatWeekRange(currentWeek.weekStart, currentWeek.weekEnd, lang)}
              </p>
            ) : (
              <p className="text-sm text-ink-500">{t('Cargando…', 'Loading…')}</p>
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
              ? t('Actualizando…', 'Updating…')
              : t('Actualizar', 'Update')
            : saving
              ? t('Entregando…', 'Submitting…')
              : t('Entregar', 'Submit')}
        </button>
        <p className="text-xs text-ink-500">
          {readOnly
            ? t('Vista de solo lectura: aquí no se puede entregar.', 'Read-only view: you cannot submit here.')
            : existingEntry
              ? t(
                  'Puedes seguir corrigiéndola mientras siga siendo esta semana.',
                  'You can keep editing it while it is still this week.',
                )
              : isLate
                ? t('Una entrega tardía ya no se puede corregir.', 'A late submission cannot be edited afterwards.')
                : t(
                    'Podrás corregirla mientras siga siendo esta semana.',
                    'You will be able to edit it while it is still this week.',
                  )}
        </p>
      </div>
    </form>
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
  const t = useT()
  const lang = useLang()
  return (
    <section className="mt-3">
      <h2 className="px-1 text-[11px] font-semibold tracking-widest text-ink-500 uppercase">
        {t('Tus entregas', 'Your submissions')} {entries.length > 0 && `· ${entries.length}`}
      </h2>

      {error ? (
        <p className="mt-2 rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-800">
          {translateServerText(error, lang)}
        </p>
      ) : loading ? (
        <p className="mt-2 px-1 text-sm text-ink-500">{t('Cargando…', 'Loading…')}</p>
      ) : entries.length === 0 ? (
        <p className="mt-2 rounded-xl border border-dashed border-ink-200 bg-ink-50/50 px-5 py-6 text-sm text-ink-500">
          {t('Todavía no has entregado ninguna semana.', 'You have not submitted any week yet.')}
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
                  {formatWeekRange(entry.weekStart, entry.weekEnd, lang) || t('Semana sin fecha', 'Undated week')}
                </p>
                <p className="text-xs text-ink-500">
                  {t('Entregada el', 'Submitted on')} {formatDateTime(entry.submittedAt, lang)}
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

/**
 * Descarga la bitácora completa en PDF, con la forma del documento que los
 * alumnos llenaban antes (ver `src/lib/weeklyLogPdf.ts`). No escribe nada, así
 * que también funciona en «Ver como Alumno».
 */
function DownloadPdfButton({
  form,
  rows,
  dossier,
  disabled,
  onError,
}: {
  form: WeeklyFormMeta
  rows: (JobSearchLogRow | InternshipLogRow)[]
  dossier: StudentDossier | null
  disabled: boolean
  onError: (message: string) => void
}) {
  const [generating, setGenerating] = useState(false)
  const lang = useLang()
  const t = useT()

  async function download() {
    setGenerating(true)
    try {
      await downloadWeeklyLogPdf({
        form,
        rows,
        lang,
        student: {
          fullName: dossier?.fullName ?? null,
          studentNumber: dossier?.studentNumber ?? null,
          companyName: dossier?.companyName ?? null,
          department: dossier?.department ?? null,
        },
      })
    } catch {
      onError(t('No se pudo generar el PDF. Intenta de nuevo.', 'The PDF could not be created. Try again.'))
    } finally {
      setGenerating(false)
    }
  }

  return (
    <button
      type="button"
      onClick={download}
      disabled={disabled || generating}
      className="rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-sm font-medium text-ink-700 shadow-sm hover:bg-ink-100 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {generating ? t('Generando…', 'Generating…') : t('Descargar PDF', 'Download PDF')}
    </button>
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

  return { rows: data, entries, loading, error }
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
