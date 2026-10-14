import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { usePermissions } from '../../auth/PermissionsProvider'
import { Badge, Dash } from '../../components/Badge'
import { DataTable, type Column } from '../../components/DataTable'
import { FilterBar, useFilters } from '../../components/FilterBar'
import { DossierNavButton } from '../../components/StudentDossier'
import { useRepositoryQuery } from '../../data/hooks'
import { repository } from '../../data/repository'
import type { GradeEntry, WeeklyReport } from '../../data/types'
import { weeklyFormByCode } from '../../lib/catalog'
import { formatDate, formatDateTime, formatSemester, formatWeekRange } from '../../lib/format'
import { formatPoints, parseScore, studentLabel } from './gradeUtils'
import { useGradeEntries } from './useGradeEntries'

const WEEK_PARAM = 'semana'
const STUDENT_PARAM = 'alumno'
const PENDING_PARAM = 'pendientes'
const MISSING_PARAM = 'sin-entrega'

const inputClass =
  'rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm text-ink-900 shadow-sm focus:border-ink-400 focus:ring-2 focus:ring-ink-900/5 focus:outline-none disabled:bg-ink-50'
const primaryButton =
  'rounded-lg bg-ink-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-ink-800 disabled:cursor-not-allowed disabled:bg-ink-200 disabled:text-ink-400'
const secondaryButton =
  'rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm font-medium text-ink-700 shadow-sm hover:bg-ink-100 disabled:cursor-not-allowed disabled:text-ink-300'

/**
 * Calificar — como «Needs Grading» de Blackboard.
 *
 * Primero se elige la actividad (Reporte semana N); luego se recorre alumno
 * por alumno viendo lo que contestó y poniendo la calificación a la derecha.
 * La semana y el alumno viven en la URL, igual que el expediente: recargar o
 * compartir el enlace deja en el mismo lugar.
 */
export function GradeActivitiesPage() {
  const [filters, setFilter, clearFilters] = useFilters()
  const [searchParams] = useSearchParams()
  const { entries, loading, error, isConnected, save } = useGradeEntries(filters)
  const canEdit = usePermissions().can('calificaciones', 'edicion')

  const week = Number(searchParams.get(WEEK_PARAM))
  if (week > 0) {
    return (
      <GradingView
        week={week}
        entries={entries}
        loading={loading}
        error={error}
        canEdit={canEdit}
        save={save}
      />
    )
  }

  return (
    <>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-ink-950">Calificar</h1>
        <p className="mt-1.5 text-sm text-ink-500">
          Elige una actividad para revisar los reportes entregados y calificarlos uno por uno.
        </p>
      </header>

      <FilterBar filters={filters} onChange={setFilter} onClear={clearFilters} />

      <ActivityList entries={entries} loading={loading} error={error} isConnected={isConnected} />
    </>
  )
}

// ---------------------------------------------------------------------------
// Lista de actividades
// ---------------------------------------------------------------------------

interface ActivitySummary {
  weekNumber: number
  weekStart: string
  weekEnd: string
  /** `null` si los grupos a la vista le dan puntos distintos a la semana. */
  points: number | null
  students: number
  submitted: number
  graded: number
  pending: number
  late: number
}

function summarize(entries: GradeEntry[]): ActivitySummary[] {
  const byWeek = new Map<number, ActivitySummary>()
  for (const entry of entries) {
    let summary = byWeek.get(entry.weekNumber)
    if (!summary) {
      summary = {
        weekNumber: entry.weekNumber,
        weekStart: entry.weekStart,
        weekEnd: entry.weekEnd,
        points: entry.pointsPossible,
        students: 0,
        submitted: 0,
        graded: 0,
        pending: 0,
        late: 0,
      }
      byWeek.set(entry.weekNumber, summary)
    }
    if (summary.points !== entry.pointsPossible) summary.points = null
    summary.students += 1
    if (entry.submissionId) summary.submitted += 1
    if (entry.state === 'calificado') summary.graded += 1
    if (entry.state === 'por_calificar') summary.pending += 1
    if (entry.isLate) summary.late += 1
  }
  return [...byWeek.values()].sort((a, b) => a.weekNumber - b.weekNumber)
}

function ActivityList({
  entries,
  loading,
  error,
  isConnected,
}: {
  entries: GradeEntry[]
  loading: boolean
  error: string | null
  isConnected: boolean
}) {
  const [, setSearchParams] = useSearchParams()
  const rows = useMemo(() => summarize(entries), [entries])

  const columns: Column<ActivitySummary>[] = [
    {
      key: 'activity',
      header: 'Actividad',
      width: 'min-w-52',
      sticky: true,
      render: (row) => (
        <span className="font-medium text-ink-900">Reporte semana {row.weekNumber}</span>
      ),
    },
    {
      key: 'week',
      header: 'Semana del',
      render: (row) => (
        <span className="tnum text-xs text-ink-500">{formatWeekRange(row.weekStart, row.weekEnd)}</span>
      ),
    },
    {
      key: 'points',
      header: 'Puntos',
      render: (row) =>
        row.points === null ? <span className="text-ink-500">Varía</span> : formatPoints(row.points),
    },
    {
      key: 'submitted',
      header: 'Entregados',
      render: (row) => (
        <span className="tnum">
          {row.submitted} <span className="text-ink-400">de {row.students}</span>
          {row.late > 0 && (
            <>
              {' '}
              <Badge tone="red">{row.late} tardía{row.late === 1 ? '' : 's'}</Badge>
            </>
          )}
        </span>
      ),
    },
    {
      key: 'graded',
      header: 'Calificados',
      render: (row) => <span className="tnum">{row.graded}</span>,
    },
    {
      key: 'pending',
      header: 'Por calificar',
      render: (row) =>
        row.pending > 0 ? <Badge tone="amber">{row.pending} por calificar</Badge> : <Dash />,
    },
  ]

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(row) => String(row.weekNumber)}
      loading={loading}
      isConnected={isConnected}
      error={error}
      pageSize={0}
      onRowClick={(row) =>
        setSearchParams(
          (current) => {
            const next = new URLSearchParams(current)
            next.set(WEEK_PARAM, String(row.weekNumber))
            return next
          },
          { replace: false },
        )
      }
    />
  )
}

// ---------------------------------------------------------------------------
// Vista de calificación (pantalla completa)
// ---------------------------------------------------------------------------

function GradingView({
  week,
  entries,
  loading,
  error,
  canEdit,
  save,
}: {
  week: number
  entries: GradeEntry[]
  loading: boolean
  error: string | null
  canEdit: boolean
  save: (entry: GradeEntry, score: number | null, comment: string | null) => Promise<void>
}) {
  const [searchParams, setSearchParams] = useSearchParams()
  const studentParam = searchParams.get(STUDENT_PARAM)
  const onlyPending = searchParams.get(PENDING_PARAM) === '1'
  const includeMissing = searchParams.get(MISSING_PARAM) === '1'

  const weekEntries = useMemo(
    () => entries.filter((entry) => entry.weekNumber === week),
    [entries, week],
  )

  // A quién se puede navegar. El alumno que se está calificando se queda en la
  // lista aunque deje de cumplir el filtro (ya lo calificó): si no, al guardar
  // se perdería el lugar.
  const list = useMemo(
    () =>
      weekEntries.filter((entry) => {
        if (entry.studentId === studentParam) return true
        if (entry.state === 'sin_entrega') return includeMissing && !onlyPending
        return !onlyPending || entry.state === 'por_calificar'
      }),
    [weekEntries, studentParam, onlyPending, includeMissing],
  )

  const foundIndex = list.findIndex((entry) => entry.studentId === studentParam)
  const index = foundIndex >= 0 ? foundIndex : 0
  const current = list[index] ?? null
  const missingCount = weekEntries.filter((entry) => entry.state === 'sin_entrega').length

  function update(change: (params: URLSearchParams) => void, replace = true) {
    setSearchParams(
      (currentParams) => {
        const next = new URLSearchParams(currentParams)
        change(next)
        return next
      },
      { replace },
    )
  }

  const goTo = (entry: GradeEntry) => update((params) => params.set(STUDENT_PARAM, entry.studentId))
  const onPrev = index > 0 ? () => goTo(list[index - 1]) : undefined
  const onNext = index < list.length - 1 ? () => goTo(list[index + 1]) : undefined
  const onClose = () =>
    update((params) => {
      params.delete(WEEK_PARAM)
      params.delete(STUDENT_PARAM)
    }, false)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.closest('input, textarea, select, [contenteditable]')) return
      if (event.key === 'Escape') onClose()
      else if (event.key === 'ArrowLeft') onPrev?.()
      else if (event.key === 'ArrowRight') onNext?.()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  const submittedIds = useMemo(
    () => weekEntries.filter((entry) => entry.submissionId).map((entry) => entry.studentId),
    [weekEntries],
  )
  const { data: reports, loading: loadingReports } = useRepositoryQuery(
    () => repository.getWeeklyReports(week, submittedIds),
    [] as WeeklyReport[],
    [week, submittedIds.join(',')],
  )
  const report = current ? reports.find((item) => item.studentId === current.studentId) : undefined

  // Al pasar a otro alumno se empieza desde arriba.
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [current?.studentId])

  return (
    <div>
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Ruta" className="flex min-w-0 items-center gap-1.5 text-sm text-ink-500">
          <button type="button" onClick={onClose} className="hover:text-ink-900 hover:underline">
            Calificar
          </button>
          <span aria-hidden="true">›</span>
          <button
            type="button"
            onClick={onClose}
            className="font-medium text-accent-700 hover:underline"
          >
            Reporte semana {week}
          </button>
          {current && (
            <>
              <span aria-hidden="true">›</span>
              <span className="truncate text-ink-900" aria-current="page">
                {studentLabel(current)}
              </span>
            </>
          )}
        </nav>

        {list.length > 0 && (
          <div className="flex items-center gap-1.5">
            <DossierNavButton onClick={onPrev} label="Alumno anterior">
              ‹
            </DossierNavButton>
            <span className="tnum px-1 text-sm text-ink-600">
              {index + 1} / {list.length}
            </span>
            <DossierNavButton onClick={onNext} label="Alumno siguiente">
              ›
            </DossierNavButton>
          </div>
        )}
      </header>

      <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-ink-600">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={onlyPending}
            onChange={(event) =>
              update((params) => {
                if (event.target.checked) params.set(PENDING_PARAM, '1')
                else params.delete(PENDING_PARAM)
              })
            }
          />
          Solo por calificar
        </label>
        {missingCount > 0 && (
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={includeMissing}
              disabled={onlyPending}
              onChange={(event) =>
                update((params) => {
                  if (event.target.checked) params.set(MISSING_PARAM, '1')
                  else params.delete(MISSING_PARAM)
                })
              }
            />
            Incluir a quienes no entregaron ({missingCount})
          </label>
        )}
      </div>

      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      ) : !current ? (
        <div className="rounded-xl border border-ink-200 bg-white px-4 py-20 text-center text-sm text-ink-500 shadow-sm">
          {loading
            ? 'Cargando…'
            : onlyPending
              ? 'No hay reportes por calificar en esta actividad.'
              : 'Nadie ha entregado el reporte de esta semana.'}
        </div>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_21rem]">
          <ReportCard entry={current} report={report} loading={loadingReports} />
          <GradePanel
            key={`${current.studentId}|${current.weekNumber}`}
            entry={current}
            canEdit={canEdit}
            onSave={async (score, comment, advance) => {
              await save(current, score, comment)
              if (advance && onNext) onNext()
            }}
            hasNext={Boolean(onNext)}
          />
        </div>
      )}
    </div>
  )
}

/** Lo que el alumno contestó, con las etiquetas del formulario. */
function ReportCard({
  entry,
  report,
  loading,
}: {
  entry: GradeEntry
  report: WeeklyReport | undefined
  loading: boolean
}) {
  const form = report ? weeklyFormByCode(report.formCode) : null

  return (
    <article className="rounded-xl border border-ink-200 bg-white shadow-sm">
      <div className="border-b border-ink-100 px-6 py-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold tracking-tight text-ink-950">
            {studentLabel(entry)}
          </h2>
          {form && <Badge tone="blue">{form.name}</Badge>}
        </div>
        <p className="mt-1 text-sm text-ink-500">
          {[entry.fullName ? entry.institutionalEmail : null, entry.degreeCode, formatSemester(entry.semester)]
            .filter(Boolean)
            .join(' · ')}
        </p>
        <p className="tnum mt-1 text-xs text-ink-500">
          Semana del {formatWeekRange(entry.weekStart, entry.weekEnd)}
          {entry.submittedAt && <> · Entregado el {formatDateTime(entry.submittedAt)}</>}
        </p>
        {entry.isLate && (
          <p
            role="alert"
            className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800"
          >
            Entrega tardía: este reporte se entregó fuera de su semana (cerró el{' '}
            {formatDate(entry.weekEnd)}).
          </p>
        )}
      </div>

      {!entry.submissionId ? (
        <p className="px-6 py-12 text-center text-sm text-ink-500">
          Este alumno no entregó el reporte de esta semana.
        </p>
      ) : !report || !form ? (
        <p className="px-6 py-12 text-center text-sm text-ink-500">
          {loading ? 'Cargando el reporte…' : 'No se pudo cargar el reporte.'}
        </p>
      ) : (
        <dl className="divide-y divide-ink-100">
          {form.fields.map((field) => {
            const value = report.answers[field.key]
            return (
              <div key={field.key} className="px-6 py-4">
                <dt className="text-[11px] font-semibold tracking-wider text-ink-500 uppercase">
                  {field.label}
                </dt>
                <dd className="mt-1.5 text-sm leading-relaxed whitespace-pre-line text-ink-800">
                  {value === null || value === '' ? (
                    <Dash />
                  ) : field.type === 'numero' ? (
                    `${formatPoints(Number(value))} h`
                  ) : (
                    value
                  )}
                </dd>
              </div>
            )
          })}
        </dl>
      )}
    </article>
  )
}

/** El panel de la derecha: puntaje, comentario y guardar. */
function GradePanel({
  entry,
  canEdit,
  hasNext,
  onSave,
}: {
  entry: GradeEntry
  canEdit: boolean
  hasNext: boolean
  onSave: (score: number | null, comment: string | null, advance: boolean) => Promise<void>
}) {
  const [scoreText, setScoreText] = useState(formatPoints(entry.score))
  const [comment, setComment] = useState(entry.comment ?? '')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)

  const parsed = parseScore(scoreText)
  const invalid = Number.isNaN(parsed)
  const isExtra = parsed !== null && !invalid && parsed > entry.pointsPossible

  async function commit(score: number | null, advance: boolean) {
    setSaving(true)
    setMessage(null)
    try {
      await onSave(score, comment, advance)
      if (score === null) {
        setScoreText('')
        setComment('')
      }
      setMessage({ tone: 'ok', text: score === null ? 'Calificación quitada.' : 'Calificación guardada.' })
    } catch (cause) {
      setMessage({
        tone: 'error',
        text: cause instanceof Error ? cause.message : 'No se pudo guardar la calificación.',
      })
    } finally {
      setSaving(false)
    }
  }

  function submit(advance: boolean) {
    if (invalid) {
      setMessage({ tone: 'error', text: 'Escribe un número, por ejemplo 4.5.' })
      return
    }
    if (parsed === null) {
      setMessage({ tone: 'error', text: 'Escribe la calificación, o usa «Quitar calificación».' })
      return
    }
    void commit(parsed, advance)
  }

  return (
    <aside className="rounded-xl border border-ink-200 bg-white p-5 shadow-sm lg:sticky lg:top-4">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink-950">Calificación</h2>
        {entry.state === 'calificado' ? (
          <Badge tone="green">Calificado</Badge>
        ) : entry.state === 'por_calificar' ? (
          <Badge tone="amber">Por calificar</Badge>
        ) : (
          <Badge>Sin entrega</Badge>
        )}
      </div>

      {canEdit ? (
        <form
          onSubmit={(event) => {
            event.preventDefault()
            submit(hasNext)
          }}
          className="space-y-4"
        >
          <div>
            <label
              htmlFor="score"
              className="text-[11px] font-semibold tracking-wider text-ink-500 uppercase"
            >
              Puntos
            </label>
            <div className="mt-1.5 flex items-center gap-2">
              <input
                id="score"
                type="text"
                inputMode="decimal"
                autoFocus
                value={scoreText}
                onChange={(event) => setScoreText(event.target.value)}
                aria-invalid={invalid}
                className={`${inputClass} tnum w-28 text-right text-lg font-semibold ${invalid ? 'border-red-400' : ''}`}
              />
              <span className="tnum text-sm text-ink-500">/ {formatPoints(entry.pointsPossible)}</span>
            </div>
            {isExtra && <p className="mt-1.5 text-xs text-ink-500">Es más que los puntos posibles (crédito extra).</p>}
          </div>

          <div>
            <label
              htmlFor="comment"
              className="text-[11px] font-semibold tracking-wider text-ink-500 uppercase"
            >
              Comentario
            </label>
            <textarea
              id="comment"
              rows={5}
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              className={`${inputClass} mt-1.5 w-full resize-y`}
            />
          </div>

          {message && (
            <p
              role="status"
              className={`text-sm ${message.tone === 'error' ? 'text-red-700' : 'text-emerald-700'}`}
            >
              {message.text}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={saving} className={primaryButton}>
              {hasNext ? 'Guardar y siguiente' : 'Guardar'}
            </button>
            {hasNext && (
              <button
                type="button"
                disabled={saving}
                onClick={() => submit(false)}
                className={secondaryButton}
              >
                Guardar
              </button>
            )}
          </div>

          {entry.state === 'calificado' && (
            <button
              type="button"
              disabled={saving}
              onClick={() => void commit(null, false)}
              className="text-sm text-ink-500 underline hover:text-red-700 disabled:text-ink-300"
            >
              Quitar calificación
            </button>
          )}
        </form>
      ) : entry.score !== null ? (
        <div className="space-y-3">
          <p className="tnum text-3xl font-semibold text-ink-950">
            {formatPoints(entry.score)}{' '}
            <span className="text-base font-normal text-ink-500">/ {formatPoints(entry.pointsPossible)}</span>
          </p>
          {entry.comment && <p className="text-sm whitespace-pre-line text-ink-700">{entry.comment}</p>}
        </div>
      ) : (
        <p className="text-sm text-ink-500">Todavía no tiene calificación.</p>
      )}
    </aside>
  )
}
