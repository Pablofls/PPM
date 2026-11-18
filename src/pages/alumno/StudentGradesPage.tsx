import { Fragment, useEffect, useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'

import { useAuth } from '../../auth/AuthProvider'
import { usePermissions } from '../../auth/PermissionsProvider'
import { Badge, Dash } from '../../components/Badge'
import { useRepositoryQuery } from '../../data/hooks'
import { repository } from '../../data/repository'
import type { ActivityGradeEntry, GradeEntry } from '../../data/types'
import {
  activityTitle,
  DEMOGRAPHICS_FORM,
  localizeWeeklyForm,
  weeklyFormByCode,
} from '../../lib/catalog'
import { translateServerText, useLang, useT, type Lang } from '../../lib/i18n'
import { PORTAL_FORMS, portalFormPath } from '../../lib/portalForms'
import { formatDate, formatDateTime } from '../../lib/format'
import { computeTotal, formatPoints } from '../../lib/grades'

const WEEK_PARAM = 'semana'
const ACTIVITY_PARAM = 'actividad'

/** Dónde contesta el alumno cada actividad que no es bitácora. */
const ACTIVITY_PATHS: Record<string, string> = {
  form1_0: DEMOGRAPHICS_FORM.path,
  ...Object.fromEntries(PORTAL_FORMS.map((form) => [form.code, portalFormPath(form)])),
}

/** Una fila de la tabla: un reporte semanal o una actividad (`0053`). */
interface GradeRow {
  /** `semana-3`, `actividad-form1_0`: id de la fila y de su estado abierto. */
  id: string
  title: string
  subtitle: string
  path: string | null
  /** Fecha de vencimiento (`date` o ISO). */
  due: string | null
  submissionId: string | null
  submittedAt: string | null
  isLate: boolean
  missing: boolean
  score: number | null
  pointsPossible: number
  comment: string | null
  gradedAt: string | null
}

function weeklyRow(grade: GradeEntry, lang: Lang, today: string): GradeRow {
  const t = (es: string, en: string) => (lang === 'en' ? en : es)
  const form = grade.formCode ? localizeWeeklyForm(weeklyFormByCode(grade.formCode), lang) : null
  return {
    id: `semana-${grade.weekNumber}`,
    title: t(`Reporte semana ${grade.weekNumber}`, `Weekly report ${grade.weekNumber}`),
    subtitle: form ? form.name : t('Reporte semanal', 'Weekly report'),
    path: form?.path ?? null,
    due: grade.weekEnd,
    submissionId: grade.submissionId,
    submittedAt: grade.submittedAt,
    isLate: grade.isLate,
    missing: !grade.submissionId && grade.score === null && grade.weekEnd < today,
    score: grade.score,
    pointsPossible: grade.pointsPossible,
    comment: grade.comment,
    gradedAt: grade.gradedAt,
  }
}

function activityRow(grade: ActivityGradeEntry, lang: Lang, now: Date): GradeRow {
  return {
    id: `actividad-${grade.formCode}`,
    title: activityTitle(grade.formCode, lang),
    subtitle: lang === 'en' ? 'Assignment' : 'Actividad',
    path: ACTIVITY_PATHS[grade.formCode] ?? null,
    due: grade.dueAt,
    submissionId: grade.submissionId,
    submittedAt: grade.submittedAt,
    isLate: grade.isLate,
    missing:
      !grade.submissionId && grade.score === null && grade.dueAt !== null && new Date(grade.dueAt) < now,
    score: grade.score,
    pointsPossible: grade.pointsPossible,
    comment: grade.comment,
    gradedAt: grade.gradedAt,
  }
}

/**
 * Calificaciones del alumno, como la página «Calificaciones» de Canvas: una
 * fila por actividad (las que se contestan en el portal, como el 1.0, y cada
 * Reporte semana N) con su fecha, cómo la entregó, la puntuación y el
 * comentario del profesor; el total a la derecha.
 *
 * `?semana=N` o `?actividad=form1_0` abre y resalta esa fila: es a donde lleva
 * la notificación de una calificación.
 */
export function StudentGradesPage() {
  const { portalStudentId: studentId } = useAuth()
  const t = useT()
  const lang = useLang()
  const { can, loading: loadingPermissions } = usePermissions()
  const [searchParams] = useSearchParams()
  const focusWeek = Number(searchParams.get(WEEK_PARAM)) || null
  const focusActivity = searchParams.get(ACTIVITY_PARAM)
  const focusId = focusWeek ? `semana-${focusWeek}` : focusActivity ? `actividad-${focusActivity}` : null

  const { data: grades, loading, error } = useRepositoryQuery(
    () => (studentId ? repository.getStudentGrades(studentId) : Promise.resolve([])),
    [] as GradeEntry[],
    [studentId],
  )
  const { data: activityGrades, loading: loadingActivities } = useRepositoryQuery(
    () => (studentId ? repository.getStudentActivityGrades(studentId) : Promise.resolve([])),
    [] as ActivityGradeEntry[],
    [studentId],
  )
  const [showAll, setShowAll] = useState(false)
  const [open, setOpen] = useState<Set<string>>(() => new Set(focusId ? [focusId] : []))

  // Llegar desde una notificación con la página ya abierta también abre la fila.
  useEffect(() => {
    if (!focusId) return
    setOpen((current) => new Set(current).add(focusId))
    document.getElementById(focusId)?.scrollIntoView({ block: 'center' })
  }, [focusId, grades.length, activityGrades.length])

  if (!loadingPermissions && !can('alumno_calificaciones')) return <Navigate to="/alumno" replace />

  const today = localToday()
  const now = new Date()
  const rows: GradeRow[] = [
    ...activityGrades.map((grade) => activityRow(grade, lang, now)),
    ...grades.map((grade) => weeklyRow(grade, lang, today)),
  ]
  const total = computeTotal(rows)
  const toggle = (id: string) =>
    setOpen((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-ink-950">
          {t('Calificaciones', 'Grades')}
        </h1>
        <p className="mt-1.5 text-sm text-ink-500">
          {t(
            'Tus actividades y reportes semanales, lo que obtuviste en cada uno y los comentarios de tu profesor.',
            'Your assignments and weekly reports, what you scored on each one and your professor’s comments.',
          )}
        </p>
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_16rem]">
        <div className="overflow-x-auto rounded-xl border border-ink-200 bg-white shadow-sm">
          {error ? (
            <p className="px-6 py-12 text-center text-sm text-red-800">
              {translateServerText(error, lang)}
            </p>
          ) : !studentId ? (
            <p className="px-6 py-12 text-center text-sm text-ink-500">
              {t('Elige un alumno para ver sus calificaciones.', 'Choose a student to see their grades.')}
            </p>
          ) : rows.length === 0 ? (
            <p className="px-6 py-12 text-center text-sm text-ink-500">
              {loading || loadingActivities
                ? t('Cargando tus calificaciones…', 'Loading your grades…')
                : t('Todavía no hay actividades en tu grupo.', 'There are no assignments in your group yet.')}
            </p>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-ink-200 bg-ink-50 text-left text-[11px] font-semibold tracking-wider text-ink-500 uppercase">
                  <th className="px-4 py-2.5">{t('Nombre', 'Name')}</th>
                  <th className="px-4 py-2.5">{t('Vence', 'Due')}</th>
                  <th className="px-4 py-2.5">{t('Estado', 'Status')}</th>
                  <th className="px-4 py-2.5 text-right">{t('Puntuación', 'Score')}</th>
                  <th className="w-12 px-2 py-2.5">
                    <span className="sr-only">{t('Comentarios', 'Comments')}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((grade) => {
                  const expanded = Boolean(grade.comment) && (showAll || open.has(grade.id))
                  const focused = grade.id === focusId
                  return (
                    <Fragment key={grade.id}>
                      <tr
                        id={grade.id}
                        className={`align-top ${expanded ? '' : 'border-b border-ink-100'} ${
                          focused ? 'bg-sky-50/70' : ''
                        }`}
                      >
                        <td className="px-4 py-3">
                          {grade.path ? (
                            <Link to={grade.path} className="font-medium text-accent-700 hover:underline">
                              {grade.title}
                            </Link>
                          ) : (
                            <span className="font-medium text-ink-900">{grade.title}</span>
                          )}
                          <p className="mt-0.5 text-xs text-ink-500">
                            {grade.subtitle}
                            {grade.submittedAt && (
                              <>
                                {' '}
                                · {t('Entregado el', 'Submitted on')} {formatDateTime(grade.submittedAt, lang)}
                              </>
                            )}
                          </p>
                        </td>
                        <td className="tnum px-4 py-3 whitespace-nowrap text-ink-600">{grade.due ? formatDate(grade.due, lang) : <Dash />}</td>
                        <td className="px-4 py-3">
                          {grade.isLate ? (
                            <Badge tone="red">{t('Tardía', 'Late')}</Badge>
                          ) : grade.missing ? (
                            <Badge tone="red">{t('Faltante', 'Missing')}</Badge>
                          ) : grade.submissionId && grade.score === null ? (
                            <Badge tone="blue">{t('Entregado', 'Submitted')}</Badge>
                          ) : null}
                        </td>
                        <td className="tnum px-4 py-3 text-right whitespace-nowrap">
                          {grade.score !== null ? (
                            <span className="font-semibold text-ink-950">{formatPoints(grade.score, lang)}</span>
                          ) : (
                            <span className="text-ink-400">–</span>
                          )}
                          <span className="text-ink-500"> / {formatPoints(grade.pointsPossible, lang)}</span>
                        </td>
                        <td className="px-2 py-2.5 text-center">
                          {grade.comment && (
                            <button
                              type="button"
                              onClick={() => toggle(grade.id)}
                              aria-expanded={expanded}
                              title={
                                expanded
                                  ? t('Ocultar el comentario', 'Hide comment')
                                  : t('Ver el comentario del profesor', 'View your professor’s comment')
                              }
                              className={`rounded-md px-1.5 py-1 text-base leading-none transition-colors hover:bg-ink-100 ${
                                expanded ? 'bg-ink-100' : ''
                              }`}
                            >
                              💬
                            </button>
                          )}
                        </td>
                      </tr>
                      {expanded && (
                        <tr className={`border-b border-ink-100 ${focused ? 'bg-sky-50/70' : ''}`}>
                          <td colSpan={5} className="px-4 pb-4">
                            <div className="rounded-lg border border-ink-200 bg-ink-50 px-4 py-3">
                              <p className="text-[11px] font-semibold tracking-wider text-ink-500 uppercase">
                                {t('Comentario del profesor', 'Professor’s comment')}
                                {grade.gradedAt && (
                                  <span className="font-normal tracking-normal normal-case">
                                    {' '}
                                    · {formatDateTime(grade.gradedAt, lang)}
                                  </span>
                                )}
                              </p>
                              <p className="mt-1.5 text-sm whitespace-pre-line text-ink-800">{grade.comment}</p>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-20">
          <div className="rounded-xl border border-ink-200 bg-white p-5 shadow-sm">
            <p className="text-[11px] font-semibold tracking-wider text-ink-500 uppercase">Total</p>
            {total ? (
              <>
                <p className="tnum mt-1 text-3xl font-semibold text-ink-950">
                  {formatPoints(Math.round(total.percentage * 100) / 100, lang)} %
                </p>
                <p className="tnum mt-1 text-sm text-ink-500">
                  {formatPoints(total.earned, lang)} / {formatPoints(total.possible, lang)}{' '}
                  {t('puntos', 'points')}
                </p>
              </>
            ) : (
              <p className="mt-1 text-sm text-ink-500">
                <Dash /> {t('Aún no tienes actividades calificadas.', 'You have no graded assignments yet.')}
              </p>
            )}
            <p className="mt-3 text-xs leading-relaxed text-ink-500">
              {t('Solo cuentan las actividades ya calificadas.', 'Only graded assignments count.')}
            </p>
          </div>

          {rows.some((grade) => grade.comment) && (
            <label className="flex items-center gap-2 px-1 text-sm text-ink-600">
              <input type="checkbox" checked={showAll} onChange={(event) => setShowAll(event.target.checked)} />
              {t('Mostrar todos los comentarios', 'Show all comments')}
            </label>
          )}
        </aside>
      </div>
    </>
  )
}

/** `2026-11-04` en la hora local: para comparar con las columnas `date`. */
function localToday(): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}
