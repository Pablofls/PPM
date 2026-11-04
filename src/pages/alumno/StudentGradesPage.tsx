import { Fragment, useEffect, useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'

import { useAuth } from '../../auth/AuthProvider'
import { usePermissions } from '../../auth/PermissionsProvider'
import { Badge, Dash } from '../../components/Badge'
import { useRepositoryQuery } from '../../data/hooks'
import { repository } from '../../data/repository'
import type { GradeEntry } from '../../data/types'
import { weeklyFormByCode } from '../../lib/catalog'
import { formatDate, formatDateTime } from '../../lib/format'
import { computeTotal, formatPoints } from '../../lib/grades'

const WEEK_PARAM = 'semana'

/**
 * Calificaciones del alumno, como la página «Calificaciones» de Canvas: una
 * fila por actividad (Reporte semana N) con su fecha, cómo la entregó, la
 * puntuación y el comentario del profesor; el total a la derecha.
 *
 * `?semana=N` abre y resalta esa fila: es a donde lleva la notificación de una
 * calificación.
 */
export function StudentGradesPage() {
  const { portalStudentId: studentId } = useAuth()
  const { can, loading: loadingPermissions } = usePermissions()
  const [searchParams] = useSearchParams()
  const focusWeek = Number(searchParams.get(WEEK_PARAM)) || null

  const { data: grades, loading, error } = useRepositoryQuery(
    () => (studentId ? repository.getStudentGrades(studentId) : Promise.resolve([])),
    [] as GradeEntry[],
    [studentId],
  )
  const [showAll, setShowAll] = useState(false)
  const [open, setOpen] = useState<Set<number>>(() => new Set(focusWeek ? [focusWeek] : []))

  // Llegar desde una notificación con la página ya abierta también abre la fila.
  useEffect(() => {
    if (!focusWeek) return
    setOpen((current) => new Set(current).add(focusWeek))
    document.getElementById(`semana-${focusWeek}`)?.scrollIntoView({ block: 'center' })
  }, [focusWeek, grades.length])

  if (!loadingPermissions && !can('alumno_calificaciones')) return <Navigate to="/alumno" replace />

  const total = computeTotal(grades)
  const today = localToday()
  const toggle = (week: number) =>
    setOpen((current) => {
      const next = new Set(current)
      if (next.has(week)) next.delete(week)
      else next.add(week)
      return next
    })

  return (
    <>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-ink-950">Calificaciones</h1>
        <p className="mt-1.5 text-sm text-ink-500">
          Tus reportes semanales, lo que obtuviste en cada uno y los comentarios de tu profesor.
        </p>
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_16rem]">
        <div className="overflow-x-auto rounded-xl border border-ink-200 bg-white shadow-sm">
          {error ? (
            <p className="px-6 py-12 text-center text-sm text-red-800">{error}</p>
          ) : !studentId ? (
            <p className="px-6 py-12 text-center text-sm text-ink-500">Elige un alumno para ver sus calificaciones.</p>
          ) : grades.length === 0 ? (
            <p className="px-6 py-12 text-center text-sm text-ink-500">
              {loading ? 'Cargando tus calificaciones…' : 'Todavía no hay actividades en tu grupo.'}
            </p>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-ink-200 bg-ink-50 text-left text-[11px] font-semibold tracking-wider text-ink-500 uppercase">
                  <th className="px-4 py-2.5">Nombre</th>
                  <th className="px-4 py-2.5">Vence</th>
                  <th className="px-4 py-2.5">Estado</th>
                  <th className="px-4 py-2.5 text-right">Puntuación</th>
                  <th className="w-12 px-2 py-2.5">
                    <span className="sr-only">Comentarios</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {grades.map((grade) => {
                  const expanded = Boolean(grade.comment) && (showAll || open.has(grade.weekNumber))
                  const form = grade.formCode ? weeklyFormByCode(grade.formCode) : null
                  const missing = !grade.submissionId && grade.score === null && grade.weekEnd < today
                  const focused = grade.weekNumber === focusWeek
                  return (
                    <Fragment key={grade.weekNumber}>
                      <tr
                        id={`semana-${grade.weekNumber}`}
                        className={`align-top ${expanded ? '' : 'border-b border-ink-100'} ${
                          focused ? 'bg-sky-50/70' : ''
                        }`}
                      >
                        <td className="px-4 py-3">
                          {form ? (
                            <Link to={form.path} className="font-medium text-accent-700 hover:underline">
                              Reporte semana {grade.weekNumber}
                            </Link>
                          ) : (
                            <span className="font-medium text-ink-900">Reporte semana {grade.weekNumber}</span>
                          )}
                          <p className="mt-0.5 text-xs text-ink-500">
                            {form ? form.name : 'Reporte semanal'}
                            {grade.submittedAt && <> · Entregado el {formatDateTime(grade.submittedAt)}</>}
                          </p>
                        </td>
                        <td className="tnum px-4 py-3 whitespace-nowrap text-ink-600">{formatDate(grade.weekEnd)}</td>
                        <td className="px-4 py-3">
                          {grade.isLate ? (
                            <Badge tone="red">Tardía</Badge>
                          ) : missing ? (
                            <Badge tone="red">Faltante</Badge>
                          ) : grade.submissionId && grade.score === null ? (
                            <Badge tone="blue">Entregado</Badge>
                          ) : null}
                        </td>
                        <td className="tnum px-4 py-3 text-right whitespace-nowrap">
                          {grade.score !== null ? (
                            <span className="font-semibold text-ink-950">{formatPoints(grade.score)}</span>
                          ) : (
                            <span className="text-ink-400">–</span>
                          )}
                          <span className="text-ink-500"> / {formatPoints(grade.pointsPossible)}</span>
                        </td>
                        <td className="px-2 py-2.5 text-center">
                          {grade.comment && (
                            <button
                              type="button"
                              onClick={() => toggle(grade.weekNumber)}
                              aria-expanded={expanded}
                              title={expanded ? 'Ocultar el comentario' : 'Ver el comentario del profesor'}
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
                                Comentario del profesor
                                {grade.gradedAt && (
                                  <span className="font-normal tracking-normal normal-case">
                                    {' '}
                                    · {formatDateTime(grade.gradedAt)}
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
                  {formatPoints(Math.round(total.percentage * 100) / 100)} %
                </p>
                <p className="tnum mt-1 text-sm text-ink-500">
                  {formatPoints(total.earned)} / {formatPoints(total.possible)} puntos
                </p>
              </>
            ) : (
              <p className="mt-1 text-sm text-ink-500">
                <Dash /> Aún no tienes actividades calificadas.
              </p>
            )}
            <p className="mt-3 text-xs leading-relaxed text-ink-500">
              Solo cuentan las actividades ya calificadas.
            </p>
          </div>

          {grades.some((grade) => grade.comment) && (
            <label className="flex items-center gap-2 px-1 text-sm text-ink-600">
              <input type="checkbox" checked={showAll} onChange={(event) => setShowAll(event.target.checked)} />
              Mostrar todos los comentarios
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
