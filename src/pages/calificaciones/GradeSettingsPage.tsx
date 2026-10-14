import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { usePermissions } from '../../auth/PermissionsProvider'
import { Toast } from '../../components/Toast'
import { useRepositoryQuery } from '../../data/hooks'
import { repository } from '../../data/repository'
import { DEFAULT_POINTS_POSSIBLE } from '../../data/types'
import { useGroups } from '../../layouts/GroupProvider'
import { formatGroupLabel } from '../../lib/format'
import { formatPoints, parseScore } from './gradeUtils'

const primaryButton =
  'rounded-lg bg-ink-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-ink-800 disabled:cursor-not-allowed disabled:bg-ink-200 disabled:text-ink-400'

/**
 * Configurar actividades: lo que vale el reporte, por grupo.
 *
 * El reporte de Búsqueda y el de Prácticas son una sola actividad que vale lo
 * mismo y se repite cada semana, así que es una sola cifra. Sin configurar
 * vale 100. Cada grupo tiene la suya (cada maestro pone la de sus grupos), por
 * eso primero hay que elegir uno.
 */
export function GradeSettingsPage() {
  const group = useGroups()?.selectedGroup ?? null
  const canEdit = usePermissions().can('calificaciones', 'edicion')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [savedNotice, setSavedNotice] = useState(false)

  const { data: configured, loading, error } = useRepositoryQuery(
    () => (group ? repository.getGradeActivityPoints(group.id) : Promise.resolve(null)),
    null as number | null,
    [group?.id],
  )

  // Lo guardado en esta sesión; `undefined` = lo que dice la base.
  const [saved, setSaved] = useState<{ value: number | null } | undefined>(undefined)
  const current = saved ? saved.value : configured

  const [text, setText] = useState('')
  useEffect(() => {
    setSaved(undefined)
  }, [group?.id])
  useEffect(() => {
    setText(formatPoints(current))
  }, [current])

  async function save() {
    if (!group) return
    const parsed = parseScore(text)
    if (Number.isNaN(parsed) || parsed === 0) {
      setSaveError('Escribe un número mayor que cero, por ejemplo 5.')
      return
    }
    try {
      await repository.setGradeActivityPoints(group.id, parsed)
      setSaved({ value: parsed })
      setSavedNotice(true)
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : 'No se pudieron guardar los puntos.')
    }
  }

  const unchanged = parseScore(text) === current

  return (
    <>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-ink-950">Configurar actividades</h1>
        <p className="mt-1.5 text-sm text-ink-500">
          {group ? (
            <>
              Actividades de <strong className="text-ink-700">{formatGroupLabel(group)}</strong>.
            </>
          ) : (
            'Los puntos se configuran por grupo.'
          )}
        </p>
      </header>

      {group ? (
        <section className="max-w-2xl rounded-xl border border-ink-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-ink-950">Reporte de búsqueda / prácticas</h2>
          <p className="mt-1.5 text-sm text-ink-500">
            Es una sola actividad que se repite cada semana: el alumno entrega el de Búsqueda o el de
            Prácticas, y los dos valen lo mismo. Sin configurar vale {DEFAULT_POINTS_POSSIBLE}.
          </p>

          {error ? (
            <p className="mt-4 text-sm text-red-700">{error}</p>
          ) : (
            <form
              onSubmit={(event) => {
                event.preventDefault()
                void save()
              }}
              className="mt-5 flex flex-wrap items-end gap-3"
            >
              <div>
                <label
                  htmlFor="points"
                  className="text-[11px] font-semibold tracking-wider text-ink-500 uppercase"
                >
                  Puntos posibles por reporte
                </label>
                <input
                  id="points"
                  type="text"
                  inputMode="decimal"
                  value={text}
                  disabled={!canEdit || loading}
                  placeholder={String(DEFAULT_POINTS_POSSIBLE)}
                  onChange={(event) => setText(event.target.value)}
                  className="tnum mt-1.5 block w-32 rounded-lg border border-ink-200 bg-white px-3 py-2 text-right text-lg font-semibold text-ink-900 shadow-sm placeholder:font-normal placeholder:text-ink-300 focus:border-ink-400 focus:ring-2 focus:ring-ink-900/5 focus:outline-none disabled:bg-ink-50"
                />
              </div>
              {canEdit && (
                <button type="submit" disabled={loading || unchanged} className={primaryButton}>
                  Guardar
                </button>
              )}
            </form>
          )}

          {current === null && !loading && !error && (
            <p className="mt-3 text-xs text-ink-500">Hoy vale {DEFAULT_POINTS_POSSIBLE} (el valor predeterminado).</p>
          )}
        </section>
      ) : (
        <div className="rounded-xl border border-ink-200 bg-white px-6 py-16 text-center shadow-sm">
          <p className="text-sm text-ink-600">Elige un grupo para configurar sus actividades.</p>
          <Link
            to="/mis-grupos?volver=%2Fcalificaciones%2Factividades"
            className="mt-3 inline-block text-sm font-medium text-accent-700 hover:underline"
          >
            Ir a Mis grupos
          </Link>
        </div>
      )}

      {saveError && <Toast message={saveError} tone="error" onDismiss={() => setSaveError(null)} />}
      {savedNotice && (
        <Toast message="Puntos guardados." onDismiss={() => setSavedNotice(false)} duration={2500} />
      )}
    </>
  )
}
