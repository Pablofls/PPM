import { useState } from 'react'

import { usePermissions } from '../../auth/PermissionsProvider'
import { Badge } from '../../components/Badge'
import { useRepositoryQuery } from '../../data/hooks'
import { repository } from '../../data/repository'
import type { SemesterWeek } from '../../data/types'
import { useGroups } from '../../layouts/GroupProvider'
import { formatDate, formatGroupLabel } from '../../lib/format'
import { todayMonterrey } from '../../lib/weeks'
import { ChooseGroup, FIELD_INPUT, PRIMARY_BUTTON } from './shared'

/**
 * Semanas del semestre de un grupo (`group_weeks`, 0046). Cada semana es un
 * «Reporte semana N» de las bitácoras y una columna del Centro de
 * calificaciones. El profesor da el lunes de la semana 1 y cuántas hay; la
 * base suma 7 días (`create_group_weeks`). Antes vivía en «Fechas de entrega».
 */
export function SemesterWeeksPage() {
  const group = useGroups()?.selectedGroup ?? null
  // Las semanas son parte de Actividades (0051): mismo permiso.
  const canEdit = usePermissions().can('actividades', 'edicion')

  return (
    <>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-ink-950">Semanas del semestre</h1>
        <p className="mt-1.5 text-sm text-ink-500">
          {group ? (
            <>
              Semanas de <strong className="text-ink-700">{formatGroupLabel(group)}</strong>
              {canEdit ? '' : ' · solo lectura'}
            </>
          ) : (
            'Cada grupo tiene su propio calendario'
          )}
        </p>
      </header>

      {group ? (
        <SemesterWeeks key={group.id} groupId={group.id} canEdit={canEdit} />
      ) : (
        <ChooseGroup back="/actividades/semanas" what="sus semanas" />
      )}
    </>
  )
}

function SemesterWeeks({ groupId, canEdit }: { groupId: string; canEdit: boolean }) {
  const [firstWeekStart, setFirstWeekStart] = useState('')
  const [weekCount, setWeekCount] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const {
    data: weeks,
    loading,
    error,
  } = useRepositoryQuery(() => repository.getSemesterWeeks(groupId), [] as SemesterWeek[], [
    groupId,
    refreshKey,
  ])

  const parsedCount = Number(weekCount)
  const isMonday = firstWeekStart !== '' && new Date(`${firstWeekStart}T00:00:00`).getDay() === 1
  const canGenerate =
    !saving && isMonday && Number.isInteger(parsedCount) && parsedCount >= 1 && parsedCount <= 53
  const today = todayMonterrey()

  async function handleGenerate() {
    if (!canGenerate) return
    setSaving(true)
    setMessage(null)
    try {
      await repository.createSemesterWeeks(groupId, firstWeekStart, parsedCount)
      setFirstWeekStart('')
      setWeekCount('')
      setRefreshKey((key) => key + 1)
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'No se pudieron generar las semanas.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (
      !window.confirm(
        '¿Borrar todas las semanas de este grupo? Después se pueden generar de nuevo.',
      )
    ) {
      return
    }
    try {
      await repository.deleteSemesterWeeks(groupId)
      setRefreshKey((key) => key + 1)
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'No se pudieron borrar las semanas.')
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      {canEdit && weeks.length === 0 && !loading && (
        <section className="rounded-xl border border-ink-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-ink-900">Generar semanas</h2>
          <p className="mt-1 text-xs text-ink-500">
            La semana 1 empieza en lunes; las siguientes salen solas, sumando 7 días. Cada semana
            vence el domingo a las 23:59.
          </p>

          <div className="mt-4 flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="semana-1" className="mb-1 block text-xs font-medium text-ink-500">
                Semana 1 empieza (lunes)
              </label>
              <input
                id="semana-1"
                type="date"
                value={firstWeekStart}
                onChange={(event) => setFirstWeekStart(event.target.value)}
                className={FIELD_INPUT}
              />
            </div>
            <div>
              <label htmlFor="num-semanas" className="mb-1 block text-xs font-medium text-ink-500">
                Número de semanas
              </label>
              <input
                id="num-semanas"
                type="number"
                min={1}
                max={53}
                value={weekCount}
                onChange={(event) => setWeekCount(event.target.value)}
                className={`${FIELD_INPUT} tnum w-24`}
              />
            </div>
            <button
              type="button"
              disabled={!canGenerate}
              onClick={handleGenerate}
              className={PRIMARY_BUTTON}
            >
              {saving ? 'Generando…' : 'Generar semanas'}
            </button>
          </div>

          {firstWeekStart !== '' && !isMonday && (
            <p className="mt-2 text-xs text-red-700">La semana 1 tiene que empezar en lunes.</p>
          )}
        </section>
      )}

      {message && <p className="text-sm text-red-700">{message}</p>}

      <section className="overflow-hidden rounded-xl border border-ink-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-ink-200 bg-ink-50 px-5 py-3">
          <h2 className="text-sm font-semibold text-ink-900">
            {weeks.length > 0 ? `${weeks.length} semanas` : 'Semanas'}
          </h2>
          {canEdit && weeks.length > 0 && (
            <button
              type="button"
              onClick={handleDelete}
              className="rounded-lg px-2 py-1 text-xs font-medium text-ink-500 hover:bg-red-50 hover:text-red-700"
            >
              Borrar todas
            </button>
          )}
        </div>

        {loading && <p className="px-5 py-6 text-sm text-ink-500">Cargando…</p>}
        {error && <p className="px-5 py-6 text-sm text-red-700">{error}</p>}
        {!loading && !error && weeks.length === 0 && (
          <p className="px-5 py-6 text-sm text-ink-500">
            Este grupo todavía no tiene semanas configuradas.
          </p>
        )}

        {weeks.length > 0 && (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-ink-200 text-left text-[11px] font-semibold tracking-wider text-ink-500 uppercase">
                <th className="px-5 py-2.5">Semana</th>
                <th className="px-5 py-2.5">Lunes</th>
                <th className="px-5 py-2.5">Domingo (vence)</th>
                <th className="px-5 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {weeks.map((week) => {
                const current = week.weekStart <= today && today <= week.weekEnd
                return (
                  <tr
                    key={week.weekNumber}
                    className={`border-b border-ink-100 last:border-0 ${current ? 'bg-accent-100/60' : ''}`}
                  >
                    <td className="tnum px-5 py-2.5 font-medium text-ink-900">
                      Semana {week.weekNumber}
                    </td>
                    <td className="tnum px-5 py-2.5 text-ink-700">{formatDate(week.weekStart)}</td>
                    <td className="tnum px-5 py-2.5 text-ink-700">{formatDate(week.weekEnd)}</td>
                    <td className="px-5 py-2.5 text-right">
                      {current && <Badge tone="amber">En curso</Badge>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}
