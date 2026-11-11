import { Link } from 'react-router-dom'

import type { Activity } from '../../data/types'
import { Badge } from '../../components/Badge'
import { activityState, type ActivityState } from '../../lib/activities'

export const FIELD_INPUT =
  'rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm text-ink-900 shadow-sm focus:border-ink-400 focus:ring-2 focus:ring-ink-900/5 focus:outline-none disabled:bg-ink-50 disabled:text-ink-500'

export const PRIMARY_BUTTON =
  'rounded-lg bg-ink-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-ink-800 disabled:cursor-not-allowed disabled:bg-ink-200 disabled:text-ink-400'

export const SECONDARY_BUTTON =
  'rounded-lg border border-ink-200 bg-white px-4 py-2 text-sm font-medium text-ink-700 shadow-sm transition-colors hover:bg-ink-50'

/** Las actividades y las semanas son de cada grupo: sin grupo elegido, primero Mis grupos. */
export function ChooseGroup({ back, what }: { back: string; what: string }) {
  return (
    <div className="rounded-xl border border-ink-200 bg-white px-6 py-16 text-center shadow-sm">
      <p className="text-sm text-ink-600">Elige un grupo para ver o configurar {what}.</p>
      <Link
        to={`/mis-grupos?volver=${encodeURIComponent(back)}`}
        className="mt-3 inline-block text-sm font-medium text-accent-700 hover:underline"
      >
        Ir a Mis grupos
      </Link>
    </div>
  )
}

const STATE_BADGE: Record<
  ActivityState,
  { tone: 'neutral' | 'blue' | 'green' | 'red'; label: string }
> = {
  borrador: { tone: 'neutral', label: 'Borrador' },
  programada: { tone: 'blue', label: 'Programada' },
  abierta: { tone: 'green', label: 'Abierta' },
  cerrada: { tone: 'red', label: 'Cerrada' },
}

export function ActivityStateBadge({ activity }: { activity: Activity }) {
  const { tone, label } = STATE_BADGE[activityState(activity)]
  return <Badge tone={tone}>{label}</Badge>
}
