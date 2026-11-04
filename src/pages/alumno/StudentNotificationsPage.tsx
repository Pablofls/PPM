import { useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { usePermissions } from '../../auth/PermissionsProvider'
import { NotificationSummary, useNotifications } from '../../components/NotificationBell'
import { formatDateTime } from '../../lib/format'

/**
 * Todas las notificaciones del alumno, completas: los avisos con su mensaje
 * entero y las calificaciones con su comentario. `?aviso=` resalta uno (lo
 * abre la campanita).
 */
export function StudentNotificationsPage() {
  const { items, unread, loading, error, canMark, markRead, markAll } = useNotifications()
  const { can } = usePermissions()
  const [searchParams] = useSearchParams()
  const focus = searchParams.get('aviso')

  useEffect(() => {
    if (focus) document.getElementById(`aviso-${focus}`)?.scrollIntoView({ block: 'center' })
  }, [focus, items.length])

  return (
    <>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink-950">Notificaciones</h1>
          <p className="mt-1.5 text-sm text-ink-500">
            Los avisos de tu profesor y tus calificaciones, de lo más reciente a lo más antiguo.
          </p>
        </div>
        {canMark && unread > 0 && (
          <button
            type="button"
            onClick={() => void markAll()}
            className="rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm font-medium text-ink-700 shadow-sm hover:bg-ink-100"
          >
            Marcar todo como leído ({unread})
          </button>
        )}
      </header>

      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-ink-200 bg-white px-4 py-16 text-center text-sm text-ink-500 shadow-sm">
          {loading ? 'Cargando…' : 'No tienes notificaciones.'}
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <li
              key={item.key}
              id={item.noticeId ? `aviso-${item.noticeId}` : undefined}
              className={`rounded-xl border bg-white shadow-sm ${
                item.noticeId && item.noticeId === focus ? 'border-sky-300 ring-2 ring-sky-100' : 'border-ink-200'
              }`}
            >
              <div
                className={`flex gap-3 px-5 py-4 ${item.readAt ? '' : 'bg-sky-50/50'}`}
                onClick={() => void markRead(item)}
              >
                <NotificationSummary item={item} />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-ink-100 px-5 py-2.5 text-xs text-ink-500">
                <span className="tnum">{formatDateTime(item.createdAt)}</span>
                <span className="flex items-center gap-3">
                  {item.kind === 'calificacion' && can('alumno_calificaciones') && (
                    <Link
                      to={`/alumno/calificaciones?semana=${item.weekNumber}`}
                      onClick={() => void markRead(item)}
                      className="font-medium text-accent-700 hover:underline"
                    >
                      Ver en Calificaciones
                    </Link>
                  )}
                  {canMark && !item.readAt && (
                    <button
                      type="button"
                      onClick={() => void markRead(item)}
                      className="font-medium text-ink-600 hover:text-ink-900 hover:underline"
                    >
                      Marcar como leído
                    </button>
                  )}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
