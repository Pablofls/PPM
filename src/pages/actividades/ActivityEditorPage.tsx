import { useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'

import { usePermissions } from '../../auth/PermissionsProvider'
import { Badge } from '../../components/Badge'
import { useRepositoryQuery } from '../../data/hooks'
import { repository } from '../../data/repository'
import type { Activity } from '../../data/types'
import { useGroups } from '../../layouts/GroupProvider'
import { activityOrDefault, toMonterreyInput } from '../../lib/activities'
import { activityByCode, isPanelActivity, isWeeklyActivity } from '../../lib/catalog'
import { formatGroupLabel } from '../../lib/format'
import {
  ActivityStateBadge,
  ChooseGroup,
  FIELD_INPUT,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
} from './shared'

interface Draft {
  instructions: string
  isPublished: boolean
  /** `YYYY-MM-DDTHH:mm` en hora de Monterrey; vacío = sin fecha. */
  availableFrom: string
  dueAt: string
  availableUntil: string
}

function toDraft(activity: Activity): Draft {
  return {
    instructions: activity.instructions ?? '',
    isPublished: activity.isPublished,
    availableFrom: toMonterreyInput(activity.availableFrom),
    dueAt: toMonterreyInput(activity.dueAt),
    availableUntil: toMonterreyInput(activity.availableUntil),
  }
}

/**
 * Editar una actividad, como *Edit Assignment* de Canvas: instrucciones,
 * publicar y el bloque «Asignar» con las tres fechas. Las fechas se escriben
 * en hora de Monterrey; la base las convierte (`save_activity`, 0051).
 *
 * - Las bitácoras no tienen fecha de entrega: vencen semana por semana.
 * - Las de Google Forms solo llevan fecha de entrega (para Estado de
 *   Entregas); el alumno no las ve en su portal.
 */
export function ActivityEditorPage() {
  const { formCode = '' } = useParams()
  const meta = activityByCode(formCode)
  const navigate = useNavigate()
  const group = useGroups()?.selectedGroup ?? null
  const canEdit = usePermissions().can('actividades', 'edicion')

  const {
    data: activities,
    loading,
    error,
    isConnected,
  } = useRepositoryQuery(
    () => (group ? repository.getActivities(group.id) : Promise.resolve([] as Activity[])),
    [] as Activity[],
    [group?.id],
  )
  // Cada grupo tiene sus quince actividades (0051): una lista vacía es que
  // todavía no llega, no que no haya.
  const loaded = !loading && (activities.length > 0 || !isConnected)

  const activity = meta && group ? activityOrDefault(activities, meta.code, group.id) : null
  // Lo que el profesor ya cambió, por grupo y actividad; sin cambios, lo de la base.
  const draftKey = `${group?.id}:${formCode}`
  const [edits, setEdits] = useState<{ key: string; draft: Draft } | null>(null)
  const draft =
    edits?.key === draftKey ? edits.draft : activity && loaded ? toDraft(activity) : null
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  if (!meta) return <Navigate to="/actividades" replace />

  const inPanel = isPanelActivity(meta.code)
  const weekly = isWeeklyActivity(meta.code)
  const back = `/actividades/${meta.code}`

  function update(patch: Partial<Draft>) {
    if (draft) setEdits({ key: draftKey, draft: { ...draft, ...patch } })
  }

  async function save() {
    if (!group || !draft || !meta) return
    setSaving(true)
    setMessage(null)
    try {
      await repository.saveActivity({
        groupId: group.id,
        formCode: meta.code,
        instructions: inPanel ? draft.instructions : null,
        // Las de Google Forms no se publican al portal; quedan «publicadas»
        // para que su fecha cuente en Estado de Entregas.
        isPublished: inPanel ? draft.isPublished : true,
        availableFrom: inPanel ? draft.availableFrom || null : null,
        dueAt: weekly ? null : draft.dueAt || null,
        availableUntil: inPanel ? draft.availableUntil || null : null,
      })
      navigate('/actividades')
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'No se pudo guardar la actividad.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <nav className="mb-3 text-sm">
        <Link to="/actividades" className="font-medium text-ink-500 hover:text-ink-900">
          ← Actividades
        </Link>
      </nav>

      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink-950">
            {meta.label && <span className="tnum mr-2 text-ink-400">{meta.label}</span>}
            {meta.name}
          </h1>
          <p className="mt-1.5 text-sm text-ink-500">{meta.subtitle}</p>
        </div>
        {activity &&
          (inPanel ? <ActivityStateBadge activity={activity} /> : <Badge>Google Forms</Badge>)}
      </header>

      {!group && <ChooseGroup back={back} what="esta actividad" />}
      {group && error && <p className="text-sm text-red-700">{error}</p>}
      {group && !error && !draft && <p className="text-sm text-ink-500">Cargando…</p>}

      {group && draft && (
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void save()
          }}
          className="max-w-3xl space-y-6"
        >
          {inPanel ? (
            <section className="rounded-xl border border-ink-200 bg-white p-5 shadow-sm">
              <label htmlFor="instrucciones" className="text-sm font-semibold text-ink-900">
                Instrucciones
              </label>
              <p className="mt-1 text-xs text-ink-500">
                Lo que el alumno lee antes de contestar. Vacío, ve las instrucciones de siempre.
              </p>
              <textarea
                id="instrucciones"
                rows={6}
                maxLength={5000}
                value={draft.instructions}
                disabled={!canEdit}
                placeholder={meta.defaultInstructions.join('\n')}
                onChange={(event) => update({ instructions: event.target.value })}
                className={`${FIELD_INPUT} mt-3 block w-full`}
              />

              <label className="mt-5 flex items-center gap-3 text-sm text-ink-800">
                <input
                  type="checkbox"
                  checked={draft.isPublished}
                  disabled={!canEdit}
                  onChange={(event) => update({ isPublished: event.target.checked })}
                  className="h-4 w-4 rounded border-ink-300"
                />
                <span>
                  <span className="font-medium">Publicada</span>
                  <span className="ml-2 text-ink-500">
                    Sin publicar, el alumno no la ve aunque estén las fechas.
                  </span>
                </span>
              </label>
            </section>
          ) : (
            <section className="rounded-xl border border-ink-200 bg-ink-50 p-5 text-sm text-ink-600">
              Esta actividad se contesta en Google Forms. Aquí solo se fija su fecha de entrega, que
              usa Estado de Entregas; el alumno no la ve en su portal.
            </section>
          )}

          <section className="rounded-xl border border-ink-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-ink-900">Asignar</h2>

            <div className="mt-4 grid gap-5 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <p className="mb-1 text-xs font-medium text-ink-500">Para</p>
                <p className="text-sm font-medium text-ink-900">{formatGroupLabel(group)}</p>
              </div>

              {weekly ? (
                <div className="rounded-lg border border-ink-200 bg-ink-50 px-3 py-2.5 text-xs text-ink-600 sm:col-span-2">
                  Cada semana vence el domingo a las 23:59; lo que llegue después es entrega tardía.
                  Las semanas se configuran en{' '}
                  <Link
                    to="/actividades/semanas"
                    className="font-medium text-accent-700 hover:underline"
                  >
                    Semanas del semestre
                  </Link>
                  .
                </div>
              ) : (
                <DateTimeField
                  id="fecha-entrega"
                  label="Fecha de entrega"
                  hint="Lo que llegue después es entrega tardía."
                  value={draft.dueAt}
                  defaultTime="23:59"
                  disabled={!canEdit}
                  onChange={(dueAt) => update({ dueAt })}
                />
              )}

              {inPanel && (
                <>
                  <DateTimeField
                    id="disponible-desde"
                    label="Disponible desde"
                    hint="Antes de esta hora el alumno no la ve. Vacío: desde que se publica."
                    value={draft.availableFrom}
                    defaultTime="00:00"
                    disabled={!canEdit}
                    onChange={(availableFrom) => update({ availableFrom })}
                  />
                  <DateTimeField
                    id="disponible-hasta"
                    label="Disponible hasta"
                    hint="Después ya no puede entregar; la ve cerrada. Vacío: nunca cierra."
                    value={draft.availableUntil}
                    defaultTime="23:59"
                    disabled={!canEdit}
                    onChange={(availableUntil) => update({ availableUntil })}
                  />
                </>
              )}
            </div>
          </section>

          {message && <p className="text-sm text-red-700">{message}</p>}

          {canEdit ? (
            <div className="flex gap-3">
              <button type="submit" disabled={saving} className={PRIMARY_BUTTON}>
                {saving ? 'Guardando…' : 'Guardar'}
              </button>
              <Link to="/actividades" className={SECONDARY_BUTTON}>
                Cancelar
              </Link>
            </div>
          ) : (
            <p className="text-sm text-ink-500">Solo lectura.</p>
          )}
        </form>
      )}
    </>
  )
}

/**
 * Fecha y hora por separado, como en Canvas: el profesor piensa en «el
 * viernes» y la hora casi siempre es la misma (23:59 para entregar).
 */
function DateTimeField({
  id,
  label,
  hint,
  value,
  defaultTime,
  disabled,
  onChange,
}: {
  id: string
  label: string
  hint: string
  value: string
  defaultTime: string
  disabled: boolean
  onChange: (value: string) => void
}) {
  const [date, time] = value ? value.split('T') : ['', '']

  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-ink-500">
        {label}
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <input
          id={id}
          type="date"
          value={date}
          disabled={disabled}
          onChange={(event) =>
            onChange(event.target.value ? `${event.target.value}T${time || defaultTime}` : '')
          }
          className={FIELD_INPUT}
        />
        <input
          type="time"
          aria-label={`${label}: hora`}
          value={time}
          disabled={disabled || !date}
          onChange={(event) => onChange(`${date}T${event.target.value || defaultTime}`)}
          className={`${FIELD_INPUT} tnum w-28`}
        />
        {value && !disabled && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="rounded-lg px-2 py-1 text-xs text-ink-400 hover:bg-ink-100 hover:text-ink-700"
          >
            Quitar
          </button>
        )}
      </div>
      <p className="mt-1 text-xs text-ink-400">{hint}</p>
    </div>
  )
}
