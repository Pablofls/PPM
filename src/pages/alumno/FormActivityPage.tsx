import { useCallback, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'

import { useAuth } from '../../auth/AuthProvider'
import { usePermissions } from '../../auth/PermissionsProvider'
import { Field, INPUT } from '../../components/ActivityField'
import { Badge } from '../../components/Badge'
import { DownloadPdfButton } from '../../components/DownloadPdfButton'
import { SubmissionCelebration } from '../../components/SubmissionCelebration'
import { useStudentDossier } from '../../components/StudentDossier'
import { Toast } from '../../components/Toast'
import { useRepositoryQuery } from '../../data/hooks'
import { repository } from '../../data/repository'
import type { PortalEntry } from '../../data/types'
import { activityState, isLateSubmission } from '../../lib/activities'
import { celebrationKind, type CelebrationKind } from '../../lib/celebration'
import { formatDateTime } from '../../lib/format'
import { downloadPortalFormPdf } from '../../lib/formPdf'
import { translateServerText, useLang, useT } from '../../lib/i18n'
import {
  allFields,
  displayAnswer,
  isMissing,
  isVisible,
  pick,
  portalFormBySlug,
  type PortalField,
  type PortalFormMeta,
  type PortalSection,
  type PortalValues,
} from '../../lib/portalForms'
import { useMyActivities } from './useMyActivities'

/**
 * Un formulario del Módulo 1 (1.1–1.5) como tarea del portal (`0054`), con el
 * mismo esqueleto que el 1.0: instrucciones, formulario y entregas anteriores.
 * Las preguntas salen de `src/lib/portalForms.ts`, en el idioma del grupo.
 *
 * Corregir es volver a entregar; el profesor ve la más reciente.
 */
export function FormActivityPage() {
  const { slug = '' } = useParams()
  const form = portalFormBySlug(slug)
  const t = useT()
  const lang = useLang()
  const { portalStudentId: studentId, portalReadOnly } = useAuth()
  const { can, loading: loadingPermissions } = usePermissions()
  const { dossier } = useStudentDossier(studentId)
  const { byCode, loading: loadingActivities } = useMyActivities()
  const activity = form ? byCode(form.code) : undefined

  const [refreshKey, setRefreshKey] = useState(0)
  const [celebration, setCelebration] = useState<CelebrationKind | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const { data: entries, loading, error } = useRepositoryQuery(
    () =>
      studentId && form
        ? repository.getMyFormEntries(studentId, form.code)
        : Promise.resolve([] as PortalEntry[]),
    [] as PortalEntry[],
    [studentId, form?.code, refreshKey],
  )

  const endCelebration = useCallback(() => {
    setCelebration(null)
    setRefreshKey((key) => key + 1)
  }, [])

  if (!form) return <Navigate to="/alumno/actividades" replace />
  if (!loadingPermissions && !can(form.code)) return <Navigate to="/alumno/actividades" replace />
  if (!loadingActivities && !activity) return <Navigate to="/alumno/actividades" replace />

  const closed = activity !== undefined && activityState(activity) === 'cerrada'
  const lateNow = activity?.dueAt ? new Date(activity.dueAt) < new Date() : false
  const instructions = activity?.instructions
    ? activity.instructions.split('\n').filter((line) => line.trim() !== '')
    : form.instructions[lang]
  const readOnly = portalReadOnly || !can(form.code, 'edicion')

  return (
    <>
      {toast && <Toast message={toast} tone="error" onDismiss={() => setToast(null)} />}
      {celebration && <SubmissionCelebration kind={celebration} onDone={endCelebration} />}

      <Link
        to="/alumno/actividades"
        className="text-sm font-medium text-ink-500 transition-colors hover:text-ink-900"
      >
        ← {t('Actividades', 'Assignments')}
      </Link>

      <header className="mt-4">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-ink-950">{pick(form.name, lang)}</h1>
          <Badge tone="violet">{form.label}</Badge>
          {closed && <Badge tone="red">{t('Cerrada', 'Closed')}</Badge>}
        </div>
        <p className="mt-1 text-sm text-ink-600">{pick(form.subtitle, lang)}</p>
        {activity && (activity.dueAt || activity.availableUntil) && (
          <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-500">
            {activity.dueAt && (
              <span>
                <strong className="font-semibold text-ink-700">{t('Vence', 'Due')}</strong>{' '}
                {formatDateTime(activity.dueAt, lang)}
              </span>
            )}
            {activity.availableUntil && (
              <span>
                <strong className="font-semibold text-ink-700">
                  {closed ? t('Cerró', 'Closed') : t('Disponible hasta', 'Available until')}
                </strong>{' '}
                {formatDateTime(activity.availableUntil, lang)}
              </span>
            )}
          </p>
        )}
      </header>

      <section className="mt-6 rounded-xl border border-ink-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-ink-900">{t('Instrucciones', 'Instructions')}</h2>
        <ul className="mt-3 space-y-2">
          {instructions.map((line) => (
            <li key={line} className="flex gap-2 text-sm leading-relaxed text-ink-600">
              <span aria-hidden="true" className="text-ink-300">
                •
              </span>
              {line}
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
        <PortalFormEditor
          // Se rearma con la entrega más reciente: así nace prellenado.
          key={entries[0]?.submissionId ?? 'nuevo'}
          form={form}
          initial={entries[0]?.values ?? {}}
          hasEntry={entries.length > 0}
          late={lateNow}
          readOnly={readOnly}
          disabled={loading || celebration !== null}
          onSubmitted={() => setCelebration(celebrationKind(lateNow))}
          onError={(message) => setToast(translateServerText(message, lang))}
        />
      )}

      {/* Su entrega más reciente, con nombre, matrícula y la hora de descarga. */}
      <div className="mt-8 flex justify-end">
        <DownloadPdfButton
          onDownload={() =>
            downloadPortalFormPdf({
              form,
              values: entries[0].values,
              student: {
                fullName: dossier?.fullName ?? null,
                studentNumber: dossier?.studentNumber ?? null,
              },
              lang,
            })
          }
          disabled={loading || entries.length === 0}
          onError={setToast}
        />
      </div>

      <PreviousEntries
        form={form}
        entries={entries}
        loading={loading}
        error={error}
        dueAt={activity?.dueAt ?? null}
      />
    </>
  )
}

function PortalFormEditor({
  form,
  initial,
  hasEntry,
  late,
  readOnly,
  disabled,
  onSubmitted,
  onError,
}: {
  form: PortalFormMeta
  initial: PortalValues
  hasEntry: boolean
  late: boolean
  readOnly: boolean
  disabled: boolean
  onSubmitted: () => void
  onError: (message: string) => void
}) {
  const t = useT()
  const [values, setValues] = useState<PortalValues>(initial)
  const [saving, setSaving] = useState(false)

  const fields = allFields(form)
  const missing = fields.filter((field) => isMissing(field, values)).length
  const canSubmit = !readOnly && !disabled && !saving && missing === 0
  const set = (key: string, value: string | string[]) =>
    setValues((current) => ({ ...current, [key]: value }))

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!canSubmit) return
    setSaving(true)
    try {
      await repository.submitForm(form.code, values)
      onSubmitted()
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : 'No se pudo guardar tu entrega.')
    } finally {
      setSaving(false)
    }
  }

  const locked = readOnly || saving

  return (
    <form onSubmit={handleSubmit} className="mt-6 rounded-xl border border-ink-200 bg-white p-6 shadow-sm">
      <h2 className="text-sm font-semibold text-ink-900">
        {late
          ? t('Entrega tardía', 'Late submission')
          : hasEntry
            ? t('Volver a entregar', 'Submit again')
            : t('Tu entrega', 'Your submission')}
      </h2>
      {late && (
        <p className="mt-2 rounded-lg border border-accent-300 bg-accent-100 px-3 py-2 text-xs text-ink-800">
          {t(
            'La fecha de entrega ya pasó: lo que entregues ahora cuenta como entrega tardía.',
            'The due date has passed: anything you submit now counts as late.',
          )}
        </p>
      )}

      {form.sections.map((section, index) => (
        <SectionBlock
          key={index}
          section={section}
          values={values}
          locked={locked}
          onChange={set}
        />
      ))}

      <div className="mt-6 flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={!canSubmit}
          className="rounded-lg bg-ink-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-ink-800 disabled:cursor-not-allowed disabled:bg-ink-300"
        >
          {saving ? t('Entregando…', 'Submitting…') : t('Entregar', 'Submit')}
        </button>
        <p className="text-xs text-ink-500">
          {readOnly
            ? t('Vista de solo lectura: aquí no se puede entregar.', 'Read-only view: you cannot submit here.')
            : missing > 0
              ? t(
                  `Faltan ${missing} ${missing === 1 ? 'respuesta' : 'respuestas'}: todas son obligatorias.`,
                  `${missing} ${missing === 1 ? 'answer is' : 'answers are'} missing: all are required.`,
                )
              : t('Si te equivocas, puedes volver a entregarlo.', 'If you make a mistake, you can submit it again.')}
        </p>
      </div>
    </form>
  )
}

/** Un bloque de preguntas. Si todas son de nivel (1.4), una cuadrícula como en Google Forms. */
function SectionBlock({
  section,
  values,
  locked,
  onChange,
}: {
  section: PortalSection
  values: PortalValues
  locked: boolean
  onChange: (key: string, value: string | string[]) => void
}) {
  const lang = useLang()
  const isGrid = section.fields.every((field) => field.type === 'nivel')

  return (
    <fieldset className="mt-6 border-t border-ink-100 pt-5 first-of-type:border-t-0 first-of-type:pt-0">
      {section.title && (
        <legend className="text-sm font-semibold text-ink-900">{pick(section.title, lang)}</legend>
      )}
      {section.description && (
        <p className="mt-1 text-xs text-ink-500">{pick(section.description, lang)}</p>
      )}
      {isGrid ? (
        <LevelGrid fields={section.fields} values={values} locked={locked} onChange={onChange} />
      ) : (
        <div className="mt-4 grid gap-5 sm:grid-cols-2">
          {section.fields.filter((field) => isVisible(field, values)).map((field) => (
            <div key={field.key} className={field.wide ? 'sm:col-span-2' : ''}>
              <FieldInput field={field} value={values[field.key]} locked={locked} onChange={onChange} />
            </div>
          ))}
        </div>
      )}
    </fieldset>
  )
}

function FieldInput({
  field,
  value,
  locked,
  onChange,
}: {
  field: PortalField
  value: string | string[] | undefined
  locked: boolean
  onChange: (key: string, value: string | string[]) => void
}) {
  const t = useT()
  const lang = useLang()
  const text = typeof value === 'string' ? value : ''
  const label = pick(field.label, lang)
  const help = field.help ? pick(field.help, lang) : undefined
  const id = `campo-${field.key}`

  if (field.type === 'varias' || field.type === 'escala' || field.type === 'sino') {
    // Grupos de casillas o botones: un <fieldset>, no un <label> que envuelve.
    const chosen = Array.isArray(value) ? value : []
    const options =
      field.type === 'escala'
        ? Array.from({ length: (field.max ?? 10) - (field.min ?? 1) + 1 }, (_, i) => String((field.min ?? 1) + i)).map(
            (n) => ({ value: n, label: { es: n, en: n } }),
          )
        : (field.options ?? [])
    return (
      <fieldset>
        <legend className="text-sm font-medium text-ink-800">
          {label}
          <span aria-hidden="true" className="ml-1 text-red-700">
            *
          </span>
        </legend>
        {help && <p className="mt-0.5 text-xs text-ink-500">{help}</p>}
        <div className={`mt-2 flex flex-wrap gap-2 ${field.type === 'varias' ? 'sm:grid sm:grid-cols-2' : ''}`}>
          {options.map((item) => {
            const selected = field.type === 'varias' ? chosen.includes(item.value) : text === item.value
            return (
              <label
                key={item.value}
                className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                  selected ? 'border-ink-900 bg-ink-900 text-white' : 'border-ink-200 bg-white text-ink-800 hover:bg-ink-50'
                } ${locked ? 'cursor-not-allowed opacity-60' : ''}`}
              >
                <input
                  type={field.type === 'varias' ? 'checkbox' : 'radio'}
                  name={id}
                  value={item.value}
                  checked={selected}
                  disabled={locked}
                  onChange={(event) => {
                    if (field.type !== 'varias') onChange(field.key, item.value)
                    else
                      onChange(
                        field.key,
                        event.target.checked
                          ? [...chosen, item.value]
                          : chosen.filter((code) => code !== item.value),
                      )
                  }}
                  className="sr-only"
                />
                {pick(item.label, lang)}
              </label>
            )
          })}
        </div>
      </fieldset>
    )
  }

  return (
    <Field label={label} help={help} required={!field.optional}>
      {field.type === 'opcion' ? (
        <select
          id={id}
          value={text}
          disabled={locked}
          required
          onChange={(event) => onChange(field.key, event.target.value)}
          className={INPUT}
        >
          <option value="">{t('Elige una opción', 'Choose one')}</option>
          {(field.options ?? []).map((item) => (
            <option key={item.value} value={item.value}>
              {pick(item.label, lang)}
            </option>
          ))}
        </select>
      ) : field.type === 'parrafo' ? (
        <textarea
          id={id}
          rows={5}
          value={text}
          disabled={locked}
          required
          maxLength={5000}
          onChange={(event) => onChange(field.key, event.target.value)}
          className={INPUT}
        />
      ) : (
        <input
          id={id}
          type={
            field.type === 'numero'
              ? 'number'
              : field.type === 'liga'
                ? 'url'
                : field.type === 'correo'
                  ? 'email'
                  : field.type === 'fecha'
                    ? 'date'
                    : field.type === 'telefono'
                      ? 'tel'
                      : 'text'
          }
          inputMode={field.type === 'numero' ? 'numeric' : undefined}
          min={field.min}
          max={field.max}
          step={field.type === 'numero' ? 1 : undefined}
          value={text}
          disabled={locked}
          required={!field.optional}
          placeholder={field.type === 'liga' ? 'https://' : undefined}
          onChange={(event) => onChange(field.key, event.target.value)}
          className={INPUT}
        />
      )}
    </Field>
  )
}

/** Habilidad × nivel, con un botón por nivel; en celular cada habilidad es un bloque. */
function LevelGrid({
  fields,
  values,
  locked,
  onChange,
}: {
  fields: PortalField[]
  values: PortalValues
  locked: boolean
  onChange: (key: string, value: string) => void
}) {
  const lang = useLang()
  const levels = fields[0]?.options ?? []

  return (
    <div className="mt-4 space-y-3">
      {fields.map((field) => {
        const current = typeof values[field.key] === 'string' ? (values[field.key] as string) : ''
        return (
          <fieldset
            key={field.key}
            className="grid gap-2 rounded-lg border border-ink-100 px-3 py-2.5 sm:grid-cols-[minmax(0,14rem)_1fr] sm:items-center"
          >
            <legend className="sr-only">{pick(field.label, lang)}</legend>
            <p className="text-sm font-medium text-ink-800" aria-hidden="true">
              {pick(field.label, lang)}
              <span className="ml-1 text-red-700">*</span>
            </p>
            <div className="flex flex-wrap gap-1.5">
              {levels.map((level) => {
                const selected = current === level.value
                return (
                  <label
                    key={level.value}
                    className={`cursor-pointer rounded-md border px-2.5 py-1 text-xs transition-colors ${
                      selected ? 'border-ink-900 bg-ink-900 text-white' : 'border-ink-200 bg-white text-ink-700 hover:bg-ink-50'
                    } ${locked ? 'cursor-not-allowed opacity-60' : ''}`}
                  >
                    <input
                      type="radio"
                      name={`nivel-${field.key}`}
                      value={level.value}
                      checked={selected}
                      disabled={locked}
                      onChange={() => onChange(field.key, level.value)}
                      className="sr-only"
                    />
                    {pick(level.label, lang)}
                  </label>
                )
              })}
            </div>
          </fieldset>
        )
      })}
    </div>
  )
}

function PreviousEntries({
  form,
  entries,
  loading,
  error,
  dueAt,
}: {
  form: PortalFormMeta
  entries: PortalEntry[]
  loading: boolean
  error: string | null
  dueAt: string | null
}) {
  const t = useT()
  const lang = useLang()
  const fields = allFields(form)

  return (
    <section className="mt-8">
      <h2 className="text-sm font-semibold text-ink-900">{t('Tus entregas', 'Your submissions')}</h2>
      {loading && <p className="mt-3 text-sm text-ink-500">{t('Cargando…', 'Loading…')}</p>}
      {error && <p className="mt-3 text-sm text-red-700">{translateServerText(error, lang)}</p>}
      {!loading && !error && entries.length === 0 && (
        <p className="mt-3 text-sm text-ink-500">{t('Todavía no entregas.', 'No submissions yet.')}</p>
      )}

      <ul className="mt-3 space-y-3">
        {entries.map((entry, index) => (
          <li key={entry.submissionId} className="rounded-xl border border-ink-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-ink-900">{formatDateTime(entry.submittedAt, lang)}</p>
              {index === 0 && <Badge tone="green">{t('Vigente', 'Current')}</Badge>}
              {isLateSubmission(dueAt, entry.submittedAt) && <Badge tone="amber">{t('Tardía', 'Late')}</Badge>}
              {!entry.fromPortal && <Badge>Google Forms</Badge>}
            </div>
            <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              {fields.filter((field) => isVisible(field, entry.values)).map((field) => (
                <div key={field.key} className={field.wide ? 'sm:col-span-2' : ''}>
                  <dt className="text-xs text-ink-500">{pick(field.label, lang)}</dt>
                  <dd className="break-words whitespace-pre-line text-ink-900">
                    {displayAnswer(field, entry.values[field.key], lang) || '—'}
                  </dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
    </section>
  )
}
