import { useEffect, useState } from 'react'

import { repository } from '../data/repository'
import type { BaseRow, SubmissionHistoryEntry } from '../data/types'
import type { FormCode, FormMeta } from '../lib/catalog'
import { formatSemester, formatSessionDay } from '../lib/format'
import { Dash, LanguageBadge, SubmissionStateBadge } from './Badge'
import { SubmissionTimeline } from './SubmissionTimeline'

interface StudentPanelProps<T extends BaseRow> {
  row: T | null
  form: FormMeta
  onClose: () => void
  /** Detalle específico de la pantalla, debajo de los datos del alumno. */
  children?: (row: T) => React.ReactNode
}

/**
 * Panel lateral con el detalle de un alumno y su historial de respuestas al
 * formulario de la pantalla actual.
 */
export function StudentPanel<T extends BaseRow>({
  row,
  form,
  onClose,
  children,
}: StudentPanelProps<T>) {
  const { history, error: historyError } = useSubmissionHistory(
    row?.studentId ?? null,
    form.code,
  )

  useEffect(() => {
    if (!row) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [row, onClose])

  if (!row) return null

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div
        className="absolute inset-0 bg-ink-950/25"
        onClick={onClose}
        aria-hidden="true"
      />

      <aside
        role="dialog"
        aria-label="Detalle del alumno"
        className="relative flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-ink-200 bg-white shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-ink-200 px-6 py-5">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold tracking-tight text-ink-950">
              {row.fullName ?? row.institutionalEmail}
            </h2>
            <p className="mt-1 truncate text-sm text-ink-500">{row.institutionalEmail}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-100 hover:text-ink-900"
          >
            ✕
          </button>
        </div>

        <div className="border-b border-ink-200 px-6 py-5">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <Field label="Carrera" value={row.degreeCode} />
            <Field label="Semestre" value={formatSemester(row.semester)} />
            <Field label="Período" value={row.periodCode} />
            <Field label="Frecuencia" value={formatSessionDay(row.sessionDay)} />
            <div>
              <dt className="text-xs text-ink-400">Idioma</dt>
              <dd className="mt-0.5">
                <LanguageBadge value={row.language} />
              </dd>
            </div>
            <div>
              <dt className="text-xs text-ink-400">Entrega</dt>
              <dd className="mt-0.5">
                <SubmissionStateBadge value={row.submissionState} />
              </dd>
            </div>
          </dl>
        </div>

        {children && (
          <div className="border-b border-ink-200 px-6 py-5">
            <h3 className="mb-3 text-[11px] font-semibold tracking-wider text-ink-500 uppercase">
              {form.label} {form.name}
            </h3>
            {children(row)}
          </div>
        )}

        <div className="px-6 py-5">
          <h3 className="mb-3 text-[11px] font-semibold tracking-wider text-ink-500 uppercase">
            Historial de respuestas
          </h3>
          {historyError ? (
            <p className="text-sm text-red-800">{historyError}</p>
          ) : (
            <SubmissionTimeline entries={history} isConnected={repository.isConnected} />
          )}
        </div>
      </aside>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs text-ink-400">{label}</dt>
      <dd className="mt-0.5 text-ink-800">{value || <Dash />}</dd>
    </div>
  )
}

function useSubmissionHistory(studentId: string | null, formCode: FormCode) {
  const [history, setHistory] = useState<SubmissionHistoryEntry[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!studentId) {
      setHistory([])
      setError(null)
      return
    }

    let cancelled = false
    repository
      .getSubmissionHistory(studentId, formCode)
      .then((entries) => {
        if (!cancelled) {
          setHistory(entries)
          setError(null)
        }
      })
      .catch((cause: unknown) => {
        if (cancelled) return
        setHistory([])
        setError(cause instanceof Error ? cause.message : 'Error desconocido')
      })

    return () => {
      cancelled = true
    }
  }, [studentId, formCode])

  return { history, error }
}
