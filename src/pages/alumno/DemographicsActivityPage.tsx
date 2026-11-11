import { useCallback, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'

import { useAuth } from '../../auth/AuthProvider'
import { usePermissions } from '../../auth/PermissionsProvider'
import { Field, INPUT } from '../../components/ActivityField'
import { Badge } from '../../components/Badge'
import { SubmissionCelebration } from '../../components/SubmissionCelebration'
import { useStudentDossier } from '../../components/StudentDossier'
import { Toast } from '../../components/Toast'
import { useRepositoryQuery } from '../../data/hooks'
import { repository } from '../../data/repository'
import type { DemographicsEntry, DemographicsInput, Gender } from '../../data/types'
import { activityState, isLateSubmission } from '../../lib/activities'
import { celebrationKind, type CelebrationKind } from '../../lib/celebration'
import { DEGREE_OPTIONS, DEMOGRAPHICS_FORM, type DemographicsField } from '../../lib/catalog'
import {
  formatDate,
  formatDateTime,
  formatGender,
  formatLanguage,
  formatSemester,
  formatSessionDay,
} from '../../lib/format'
import { translateServerText, useLang, useT, type Lang } from '../../lib/i18n'
import { useMyActivities } from './useMyActivities'

type Values = Record<DemographicsField['key'], string>

const EMPTY: Values = {
  fullName: '',
  personalEmail: '',
  birthDate: '',
  birthCountry: '',
  gender: '',
  degreeCode: '',
  semester: '',
}

const GENDERS: Gender[] = ['femenino', 'masculino', 'otro', 'no_especificado']
const SEMESTERS = Array.from({ length: 12 }, (_, index) => index + 1)

function optionsFor(key: DemographicsField['key'], lang: Lang) {
  if (key === 'gender') {
    return GENDERS.map((value) => ({
      value,
      // «No especificado» es como lo lee el profesor; el alumno elige «Prefiero no decir».
      label:
        value === 'no_especificado'
          ? lang === 'en'
            ? 'Prefer not to say'
            : 'Prefiero no decir'
          : formatGender(value, lang),
    }))
  }
  if (key === 'degreeCode') return DEGREE_OPTIONS
  return SEMESTERS.map((value) => ({ value: String(value), label: formatSemester(value, lang) }))
}

function toValues(entry: DemographicsEntry): Values {
  return {
    fullName: entry.fullName ?? '',
    personalEmail: entry.personalEmail ?? '',
    birthDate: entry.birthDate ?? '',
    birthCountry: entry.birthCountry ?? '',
    gender: entry.gender ?? '',
    degreeCode: entry.degreeCode ?? '',
    semester: entry.semester != null ? String(entry.semester) : '',
  }
}

/**
 * El 1.0 Datos Demográficos como tarea del portal (`0052`), con el mismo
 * esqueleto que una bitácora: instrucciones, formulario y entregas anteriores.
 *
 * No pregunta periodo, frecuencia ni idioma (los da el grupo) ni matrícula y
 * correo institucional (los da el registro): se muestran en «Esto ya lo
 * tenemos». Corregirlo es volver a entregarlo; el profesor ve la más reciente.
 */
export function DemographicsActivityPage() {
  const t = useT()
  const lang = useLang()
  const { portalStudentId: studentId, portalReadOnly } = useAuth()
  const { can, loading: loadingPermissions } = usePermissions()
  const { dossier } = useStudentDossier(studentId)
  const { byCode, loading: loadingActivities } = useMyActivities()
  const activity = byCode('form1_0')

  const [refreshKey, setRefreshKey] = useState(0)
  const [celebration, setCelebration] = useState<CelebrationKind | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const {
    data: entries,
    loading,
    error,
  } = useRepositoryQuery(
    () =>
      studentId
        ? repository.getMyDemographicsEntries(studentId)
        : Promise.resolve([] as DemographicsEntry[]),
    [] as DemographicsEntry[],
    [studentId, refreshKey],
  )

  const endCelebration = useCallback(() => {
    setCelebration(null)
    setRefreshKey((key) => key + 1)
  }, [])

  if (!loadingPermissions && !can('form1_0')) return <Navigate to="/alumno/actividades" replace />
  if (!loadingActivities && !activity) return <Navigate to="/alumno/actividades" replace />

  const closed = activity !== undefined && activityState(activity) === 'cerrada'
  const lateNow = activity?.dueAt ? new Date(activity.dueAt) < new Date() : false
  const instructions = activity?.instructions
    ? activity.instructions.split('\n').filter((line) => line.trim() !== '')
    : lang === 'en'
      ? DEMOGRAPHICS_FORM.en.instructions
      : DEMOGRAPHICS_FORM.instructions
  const readOnly = portalReadOnly || !can('form1_0', 'edicion')

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
          <h1 className="text-2xl font-semibold tracking-tight text-ink-950">
            {t(DEMOGRAPHICS_FORM.name, DEMOGRAPHICS_FORM.en.name)}
          </h1>
          <Badge tone="violet">1.0</Badge>
          {closed && <Badge tone="red">{t('Cerrada', 'Closed')}</Badge>}
        </div>
        <p className="mt-1 text-sm text-ink-600">
          {t(DEMOGRAPHICS_FORM.subtitle, DEMOGRAPHICS_FORM.en.subtitle)}
        </p>
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

      <section className="mt-6 rounded-xl border border-ink-200 bg-ink-50/60 p-6">
        <h2 className="text-sm font-semibold text-ink-900">
          {t('Esto ya lo tenemos', 'We already have this')}
        </h2>
        <dl className="mt-3 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          <Known
            label={t('Correo institucional', 'University email')}
            value={dossier?.institutionalEmail}
          />
          <Known label={t('Matrícula', 'Student ID')} value={dossier?.studentNumber} />
          <Known label={t('Periodo', 'Term')} value={dossier?.periodCode} />
          <Known
            label={t('Frecuencia', 'Class day')}
            value={formatSessionDay(dossier?.sessionDay ?? null, lang)}
          />
          {/* El idioma del portal ES el del grupo (StudentLanguage). */}
          <Known label={t('Idioma', 'Language')} value={formatLanguage(lang, lang)} />
        </dl>
        <p className="mt-3 text-xs text-ink-500">
          {t(
            'Salen de tu grupo y tu registro. Si algo está mal, avísale a tu profesor.',
            'They come from your group and registration. If something is wrong, tell your professor.',
          )}
        </p>
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
        <DemographicsForm
          // Se rearma con la entrega más reciente: así nace prellenado.
          key={entries[0]?.submissionId ?? 'nuevo'}
          initial={entries[0] ? toValues(entries[0]) : EMPTY}
          hasEntry={entries.length > 0}
          late={lateNow}
          readOnly={readOnly}
          disabled={loading || celebration !== null}
          onSubmitted={() => setCelebration(celebrationKind(lateNow))}
          onError={(message) => setToast(translateServerText(message, lang))}
        />
      )}

      <PreviousEntries
        entries={entries}
        loading={loading}
        error={error}
        dueAt={activity?.dueAt ?? null}
      />
    </>
  )
}

function Known({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs font-medium text-ink-500">{label}</dt>
      <dd className="mt-0.5 font-medium text-ink-900">{value || '—'}</dd>
    </div>
  )
}

function DemographicsForm({
  initial,
  hasEntry,
  late,
  readOnly,
  disabled,
  onSubmitted,
  onError,
}: {
  initial: Values
  hasEntry: boolean
  late: boolean
  readOnly: boolean
  disabled: boolean
  onSubmitted: () => void
  onError: (message: string) => void
}) {
  const t = useT()
  const lang = useLang()
  const [values, setValues] = useState<Values>(initial)
  const [saving, setSaving] = useState(false)

  const complete = DEMOGRAPHICS_FORM.fields.every((field) => values[field.key].trim() !== '')
  const canSubmit = !readOnly && !disabled && !saving && complete

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!canSubmit) return
    setSaving(true)
    const input: DemographicsInput = {
      fullName: values.fullName.trim(),
      personalEmail: values.personalEmail.trim(),
      birthDate: values.birthDate,
      birthCountry: values.birthCountry.trim(),
      gender: values.gender as Gender,
      degreeCode: values.degreeCode,
      semester: Number(values.semester),
    }
    try {
      await repository.submitDemographics(input)
      onSubmitted()
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : 'No se pudo guardar tu entrega.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-6 rounded-xl border border-ink-200 bg-white p-6 shadow-sm"
    >
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

      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        {DEMOGRAPHICS_FORM.fields.map((field) => {
          const label = lang === 'en' ? field.en.label : field.label
          const help = lang === 'en' ? field.en.help : field.help
          const common = {
            id: `dem-${field.key}`,
            value: values[field.key],
            disabled: readOnly || saving,
            required: true,
            className: INPUT,
          }
          const set = (value: string) =>
            setValues((current) => ({ ...current, [field.key]: value }))

          return (
            <div key={field.key} className={field.key === 'fullName' ? 'sm:col-span-2' : ''}>
              <Field label={label} help={help || undefined} required>
                {field.type === 'opcion' ? (
                  <select {...common} onChange={(event) => set(event.target.value)}>
                    <option value="">{t('Elige una opción', 'Choose one')}</option>
                    {optionsFor(field.key, lang).map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    {...common}
                    type={
                      field.type === 'correo' ? 'email' : field.type === 'fecha' ? 'date' : 'text'
                    }
                    autoComplete={
                      field.key === 'fullName'
                        ? 'name'
                        : field.key === 'personalEmail'
                          ? 'email'
                          : field.key === 'birthDate'
                            ? 'bday'
                            : 'off'
                    }
                    placeholder={field.key === 'birthCountry' ? 'México' : undefined}
                    onChange={(event) => set(event.target.value)}
                  />
                )}
              </Field>
            </div>
          )
        })}
      </div>

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
            ? t(
                'Vista de solo lectura: aquí no se puede entregar.',
                'Read-only view: you cannot submit here.',
              )
            : t(
                'Si algo cambia, puedes volver a entregarlo.',
                'If something changes, you can submit it again.',
              )}
        </p>
      </div>
    </form>
  )
}

function PreviousEntries({
  entries,
  loading,
  error,
  dueAt,
}: {
  entries: DemographicsEntry[]
  loading: boolean
  error: string | null
  dueAt: string | null
}) {
  const t = useT()
  const lang = useLang()

  return (
    <section className="mt-8">
      <h2 className="text-sm font-semibold text-ink-900">
        {t('Tus entregas', 'Your submissions')}
      </h2>
      {loading && <p className="mt-3 text-sm text-ink-500">{t('Cargando…', 'Loading…')}</p>}
      {error && <p className="mt-3 text-sm text-red-700">{translateServerText(error, lang)}</p>}
      {!loading && !error && entries.length === 0 && (
        <p className="mt-3 text-sm text-ink-500">
          {t('Todavía no entregas.', 'No submissions yet.')}
        </p>
      )}

      <ul className="mt-3 space-y-3">
        {entries.map((entry, index) => {
          const late = isLateSubmission(dueAt, entry.submittedAt)
          return (
            <li
              key={entry.submissionId}
              className="rounded-xl border border-ink-200 bg-white p-5 shadow-sm"
            >
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold text-ink-900">
                  {formatDateTime(entry.submittedAt, lang)}
                </p>
                {index === 0 && <Badge tone="green">{t('Vigente', 'Current')}</Badge>}
                {late && <Badge tone="amber">{t('Tardía', 'Late')}</Badge>}
                {!entry.fromPortal && <Badge>Google Forms</Badge>}
              </div>
              <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                {DEMOGRAPHICS_FORM.fields.map((field) => (
                  <div key={field.key}>
                    <dt className="text-xs text-ink-500">
                      {lang === 'en' ? field.en.label : field.label}
                    </dt>
                    <dd className="text-ink-900">{displayValue(entry, field.key, lang) || '—'}</dd>
                  </div>
                ))}
              </dl>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function displayValue(entry: DemographicsEntry, key: DemographicsField['key'], lang: Lang): string {
  switch (key) {
    case 'birthDate':
      return formatDate(entry.birthDate ?? null, lang)
    case 'gender':
      return formatGender(entry.gender ?? null, lang)
    case 'semester':
      return formatSemester(entry.semester ?? null, lang)
    default:
      return entry[key] ?? ''
  }
}
