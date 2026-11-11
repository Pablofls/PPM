import { useState } from 'react'
import { Link } from 'react-router-dom'

import { usePermissions } from '../../auth/PermissionsProvider'
import { Badge } from '../../components/Badge'
import { Toast } from '../../components/Toast'
import { useRepositoryQuery } from '../../data/hooks'
import { repository } from '../../data/repository'
import type { Activity } from '../../data/types'
import { useGroups } from '../../layouts/GroupProvider'
import {
  ACTIVITIES,
  MODULE_TITLES,
  isPanelActivity,
  isWeeklyActivity,
  type ActivityMeta,
  type ModuleCode,
} from '../../lib/catalog'
import { activityOrDefault } from '../../lib/activities'
import { formatDateTime, formatGroupLabel } from '../../lib/format'
import { ActivityStateBadge, ChooseGroup } from './shared'

const SECTIONS: ModuleCode[] = ['1', '2', 'A', 'B', 'W']

/**
 * Actividades, al estilo de las *Assignments* de Canvas: los quince
 * formularios del grupo, agrupados como en el rail, con su estado, sus fechas
 * y el interruptor de publicar. La fila abre el editor (`ActivityEditorPage`).
 *
 * Solo las que se contestan en el panel (las bitácoras, y el 1.0 cuando se
 * abra) llegan al portal del alumno; las de Google Forms solo llevan fecha de
 * entrega, para Estado de Entregas.
 */
export function ActivitiesPage() {
  const group = useGroups()?.selectedGroup ?? null
  const canEdit = usePermissions().can('actividades', 'edicion')
  const [refreshKey, setRefreshKey] = useState(0)
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const {
    data: activities,
    loading,
    error,
  } = useRepositoryQuery(
    () => (group ? repository.getActivities(group.id) : Promise.resolve([] as Activity[])),
    [] as Activity[],
    [group?.id, refreshKey],
  )

  async function togglePublished(activity: Activity) {
    if (!group) return
    setBusy(activity.formCode)
    try {
      await repository.setActivityPublished(group.id, activity.formCode, !activity.isPublished)
      setRefreshKey((key) => key + 1)
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'No se pudo cambiar la publicación.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-ink-950">Actividades</h1>
        <p className="mt-1.5 text-sm text-ink-500">
          {group ? (
            <>
              Actividades de <strong className="text-ink-700">{formatGroupLabel(group)}</strong>
              {canEdit ? '' : ' · solo lectura'}
            </>
          ) : (
            'Cada grupo tiene sus propias actividades y fechas'
          )}
        </p>
      </header>

      {!group && <ChooseGroup back="/actividades" what="sus actividades" />}

      {group && error && <p className="text-sm text-red-700">{error}</p>}
      {group && loading && activities.length === 0 && (
        <p className="text-sm text-ink-500">Cargando…</p>
      )}

      {group && !error && (activities.length > 0 || !loading) && (
        <div className="space-y-6">
          {SECTIONS.map((moduleCode) => {
            const metas = ACTIVITIES.filter((meta) => meta.moduleCode === moduleCode)
            return (
              <section
                key={moduleCode}
                className="overflow-hidden rounded-xl border border-ink-200 bg-white shadow-sm"
              >
                <div className="flex items-center justify-between border-b border-ink-200 bg-ink-50 px-5 py-3">
                  <h2 className="text-sm font-semibold text-ink-900">
                    {MODULE_TITLES[moduleCode]}
                  </h2>
                  <p className="text-xs text-ink-500">
                    {metas.length} {metas.length === 1 ? 'actividad' : 'actividades'}
                  </p>
                </div>
                <ul className="divide-y divide-ink-100">
                  {metas.map((meta) => (
                    <ActivityRow
                      key={meta.code}
                      meta={meta}
                      activity={activityOrDefault(activities, meta.code, group.id)}
                      canEdit={canEdit}
                      busy={busy === meta.code}
                      onTogglePublished={togglePublished}
                    />
                  ))}
                </ul>
              </section>
            )
          })}
        </div>
      )}

      {message && <Toast message={message} tone="error" onDismiss={() => setMessage(null)} />}
    </>
  )
}

function ActivityRow({
  meta,
  activity,
  canEdit,
  busy,
  onTogglePublished,
}: {
  meta: ActivityMeta
  activity: Activity
  canEdit: boolean
  busy: boolean
  onTogglePublished: (activity: Activity) => void
}) {
  const inPanel = isPanelActivity(meta.code)

  return (
    <li className="flex items-center gap-4 px-5 py-3.5 hover:bg-ink-50/60">
      <span
        aria-hidden
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-semibold ${
          inPanel && activity.isPublished
            ? 'bg-emerald-50 text-emerald-700'
            : 'bg-ink-100 text-ink-500'
        }`}
      >
        {meta.label || 'S'}
      </span>

      <Link to={`/actividades/${meta.code}`} className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink-900 hover:underline">
          {meta.label && <span className="tnum mr-1.5 text-ink-500">{meta.label}</span>}
          {meta.name}
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-500">
          {inPanel ? <ActivityStateBadge activity={activity} /> : <Badge>Google Forms</Badge>}
          <ActivityDates activity={activity} inPanel={inPanel} />
        </p>
      </Link>

      {inPanel && (
        <PublishToggle
          published={activity.isPublished}
          disabled={!canEdit || busy}
          onClick={() => onTogglePublished(activity)}
        />
      )}
    </li>
  )
}

function ActivityDates({ activity, inPanel }: { activity: Activity; inPanel: boolean }) {
  const parts: string[] = []
  const now = new Date()

  if (inPanel && activity.availableFrom && new Date(activity.availableFrom) > now) {
    parts.push(`No disponible hasta ${formatDateTime(activity.availableFrom)}`)
  }
  if (inPanel && activity.availableUntil) {
    parts.push(
      `${new Date(activity.availableUntil) <= now ? 'Cerró' : 'Disponible hasta'} ${formatDateTime(activity.availableUntil)}`,
    )
  }
  if (isWeeklyActivity(activity.formCode)) {
    parts.push('Vence cada semana')
  } else if (activity.dueAt) {
    parts.push(`Fecha de entrega ${formatDateTime(activity.dueAt)}`)
  } else {
    parts.push('Sin fecha de entrega')
  }

  return (
    <>
      {parts.map((part, index) => (
        <span key={index}>
          {index > 0 && <span className="mr-3 text-ink-300">|</span>}
          {part}
        </span>
      ))}
    </>
  )
}

/** Como el ícono de publicar de Canvas: verde publicada, gris borrador. */
function PublishToggle({
  published,
  disabled,
  onClick,
}: {
  published: boolean
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={published}
      disabled={disabled}
      onClick={onClick}
      title={published ? 'Despublicar' : 'Publicar'}
      className={`flex shrink-0 items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
        published
          ? 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
          : 'border-ink-200 bg-white text-ink-500 hover:bg-ink-50'
      }`}
    >
      <span
        className={`h-2 w-2 rounded-full ${published ? 'bg-emerald-500' : 'bg-ink-300'}`}
        aria-hidden
      />
      {published ? 'Publicada' : 'Publicar'}
    </button>
  )
}
