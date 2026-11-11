import { Link } from 'react-router-dom'

import { useAuth } from '../../auth/AuthProvider'
import { usePermissions } from '../../auth/PermissionsProvider'
import { Badge } from '../../components/Badge'
import { useRepositoryQuery, useWeeklyLogRows } from '../../data/hooks'
import { repository } from '../../data/repository'
import type { Activity, DemographicsEntry } from '../../data/types'
import { activityState, isLateSubmission } from '../../lib/activities'
import {
  DEMOGRAPHICS_FORM,
  localizeWeeklyForm,
  WEEKLY_FORMS,
  type WeeklyFormMeta,
} from '../../lib/catalog'
import { useLang, useT } from '../../lib/i18n'
import { formatDateTime, formatRelativeTime, formatWeekRange } from '../../lib/format'
import { useMyActivities } from './useMyActivities'

/**
 * Actividades del alumno: la lista de tareas de un curso, como en Canvas.
 *
 * Hoy son el 1.0 Datos Demográficos (`0052`) y las dos bitácoras semanales,
 * los únicos formularios que el alumno contesta aquí; los otros doce se siguen
 * contestando en Google Forms.
 * Solo aparecen las que el profesor publicó y ya están disponibles (`0051`);
 * una que ya pasó «Disponible hasta» se ve Cerrada.
 * Cada tarjeta lleva a su reporte, que vive debajo de esta ruta para que el
 * rail siga marcando «Actividades» mientras el alumno está dentro.
 */
export function StudentActivitiesPage() {
  // Lo que el rol alumno puede ver (0038): cada bitácora es una pantalla con permiso.
  const { can, loading: loadingPermissions } = usePermissions()
  const { byCode, loading: loadingActivities } = useMyActivities()
  const loading = loadingPermissions || loadingActivities
  const t = useT()
  const lang = useLang()
  const assignments = WEEKLY_FORMS.flatMap((form) => {
    const activity = byCode(form.code)
    return can(form.code) && activity ? [{ form: localizeWeeklyForm(form, lang), activity }] : []
  })
  const demographics = can('form1_0') ? byCode('form1_0') : undefined

  return (
    <>
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-ink-950">
          {t('Actividades', 'Assignments')}
        </h1>
        <p className="mt-1 text-sm text-ink-600">
          {t(
            'Tus tareas del curso: entra a cada una para entregarla y ver lo que ya entregaste.',
            'Your course assignments: open each one to submit it and see what you have already submitted.',
          )}
        </p>
      </header>

      {assignments.length > 0 || demographics ? (
        <ul className="mt-6 grid gap-3 sm:grid-cols-2">
          {demographics && (
            <li>
              <DemographicsCard activity={demographics} />
            </li>
          )}
          {assignments.map(({ form, activity }) => (
            <li key={form.code}>
              <AssignmentCard form={form} activity={activity} />
            </li>
          ))}
        </ul>
      ) : (
        !loading && (
          <p className="mt-6 rounded-xl border border-dashed border-ink-200 bg-white px-5 py-8 text-center text-sm text-ink-500">
            {t('Todavía no tienes actividades asignadas.', 'You have no assignments yet.')}
          </p>
        )
      )}
    </>
  )
}

/** La tarjeta del 1.0: vence, si ya se entregó y si fue tardía. */
function DemographicsCard({ activity }: { activity: Activity }) {
  const { portalStudentId: studentId } = useAuth()
  const t = useT()
  const lang = useLang()
  const closed = activityState(activity) === 'cerrada'
  const { data: entries, loading } = useRepositoryQuery(
    () =>
      studentId
        ? repository.getMyDemographicsEntries(studentId)
        : Promise.resolve([] as DemographicsEntry[]),
    [] as DemographicsEntry[],
    [studentId],
  )
  const last = entries[0]
  const late = last ? isLateSubmission(activity.dueAt, last.submittedAt) : false

  return (
    <Link
      to={DEMOGRAPHICS_FORM.path}
      className="block rounded-xl border border-ink-200 bg-white px-5 py-4 shadow-sm transition-colors hover:border-ink-300 hover:bg-ink-50/50"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink-900">
            {t(DEMOGRAPHICS_FORM.name, DEMOGRAPHICS_FORM.en.name)}
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-ink-500">
            {t(DEMOGRAPHICS_FORM.subtitle, DEMOGRAPHICS_FORM.en.subtitle)}
          </p>
        </div>
        {closed ? (
          <Badge tone="red">{t('Cerrada', 'Closed')}</Badge>
        ) : (
          <Badge tone="violet">1.0</Badge>
        )}
      </div>

      {(activity.dueAt || activity.availableUntil) && (
        <p className="mt-2 text-xs text-ink-500">
          {activity.dueAt
            ? t(
                `Vence el ${formatDateTime(activity.dueAt, lang)}`,
                `Due ${formatDateTime(activity.dueAt, lang)}`,
              )
            : closed
              ? t(
                  `Cerró el ${formatDateTime(activity.availableUntil, lang)}`,
                  `Closed on ${formatDateTime(activity.availableUntil, lang)}`,
                )
              : t(
                  `Disponible hasta el ${formatDateTime(activity.availableUntil, lang)}`,
                  `Available until ${formatDateTime(activity.availableUntil, lang)}`,
                )}
        </p>
      )}

      <p className="mt-3 flex items-center gap-2 border-t border-ink-100 pt-3 text-xs text-ink-500">
        {loading
          ? t('Cargando tu entrega…', 'Loading your submission…')
          : last
            ? t(
                `Entregado ${formatRelativeTime(last.submittedAt, lang)}`,
                `Submitted ${formatRelativeTime(last.submittedAt, lang)}`,
              )
            : t('Sin entregar', 'Not submitted')}
        {late && <Badge tone="amber">{t('Tardía', 'Late')}</Badge>}
      </p>
    </Link>
  )
}

/**
 * La tarjeta de una actividad, con su última entrega.
 *
 * El resumen es lo que convierte la lista en algo útil: sin él, el alumno tiene
 * que entrar a cada actividad para saber si ya entregó la semana.
 */
function AssignmentCard({ form, activity }: { form: WeeklyFormMeta; activity: Activity }) {
  const { entregas, ultima, loading } = useLastEntry(form)
  const t = useT()
  const lang = useLang()
  const closed = activityState(activity) === 'cerrada'
  const lastWeek =
    formatWeekRange(ultima?.weekStart ?? null, ultima?.weekEnd ?? null, lang) ||
    t('semana sin fecha', 'undated week')
  const lastWhen = ultima?.submittedAt ? ` (${formatRelativeTime(ultima.submittedAt, lang)})` : ''

  return (
    <Link
      to={form.path}
      className="block rounded-xl border border-ink-200 bg-white px-5 py-4 shadow-sm transition-colors hover:border-ink-300 hover:bg-ink-50/50"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink-900">{form.name}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-ink-500">{form.subtitle}</p>
        </div>
        {closed ? (
          <Badge tone="red">{t('Cerrada', 'Closed')}</Badge>
        ) : (
          <Badge tone="violet">{t('Semanal', 'Weekly')}</Badge>
        )}
      </div>

      {activity.availableUntil && (
        <p className="mt-2 text-xs text-ink-500">
          {closed
            ? t(
                `Cerró el ${formatDateTime(activity.availableUntil, lang)}`,
                `Closed on ${formatDateTime(activity.availableUntil, lang)}`,
              )
            : t(
                `Disponible hasta el ${formatDateTime(activity.availableUntil, lang)}`,
                `Available until ${formatDateTime(activity.availableUntil, lang)}`,
              )}
        </p>
      )}

      <p className="mt-3 border-t border-ink-100 pt-3 text-xs text-ink-500">
        {loading
          ? t('Cargando tus entregas…', 'Loading your submissions…')
          : entregas === 0
            ? t('Sin entregas todavía', 'No submissions yet')
            : t(
                `${entregas} ${entregas === 1 ? 'entrega' : 'entregas'} · última: ${lastWeek}${lastWhen}`,
                `${entregas} ${entregas === 1 ? 'submission' : 'submissions'} · latest: ${lastWeek}${lastWhen}`,
              )}
      </p>
    </Link>
  )
}

interface LastEntry {
  weekStart: string | null
  weekEnd: string | null
  submittedAt: string | null
}

/**
 * Cuántas entregas lleva el alumno en una bitácora y cuál fue la última.
 *
 * Trae la bitácora completa y se queda con la primera fila: son como mucho diez
 * entregas por alumno, y el repositorio ya las devuelve ordenadas de la más
 * reciente a la más antigua.
 */
function useLastEntry(form: WeeklyFormMeta) {
  const { portalStudentId: studentId } = useAuth()
  // Un error aquí deja la tarjeta sin resumen, no sin actividad: el alumno
  // todavía puede entrar y entregar, que es lo que vino a hacer.
  const { data: rows, loading } = useWeeklyLogRows(form.code, studentId)

  return { entregas: rows.length, ultima: (rows[0] ?? null) as LastEntry | null, loading }
}
