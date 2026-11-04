import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { useAuth } from '../auth/AuthProvider'
import { useRepositoryQuery } from '../data/hooks'
import { repository } from '../data/repository'
import type { AppNotification } from '../data/types'
import { formatRelativeTime } from '../lib/format'
import { formatPoints } from '../lib/grades'

/** Cada cuánto se buscan notificaciones nuevas mientras el portal está abierto. */
const REFRESH_MS = 60_000
/** Cuántas caben en el desplegable; las demás, en «Ver todas». */
const BELL_LIMIT = 8

/**
 * Las notificaciones del alumno del portal (`v_my_notifications`, `0050`):
 * avisos del profesor y calificaciones. La campanita y la página las comparten
 * por el caché de consultas.
 *
 * En «Ver como Alumno» el admin las ve pero no las marca: no son suyas.
 */
export function useNotifications() {
  const { portalStudentId: studentId, portalReadOnly } = useAuth()
  const { data, loading, error, mutate, refetch } = useRepositoryQuery(
    () => (studentId ? repository.getNotifications(studentId) : Promise.resolve([])),
    [] as AppNotification[],
    [studentId],
  )
  const canMark = !portalReadOnly

  const markRead = useCallback(
    async (item: AppNotification) => {
      if (!canMark || item.readAt) return
      const now = new Date().toISOString()
      mutate((current) =>
        current.map((other) => (other.key === item.key ? { ...other, readAt: now } : other)),
      )
      try {
        if (item.kind === 'aviso' && item.noticeId) await repository.markNoticeRead(item.noticeId)
        if (item.kind === 'calificacion' && item.groupId && item.weekNumber !== null) {
          await repository.markGradeRead(item.groupId, item.weekNumber)
        }
      } catch {
        refetch()
      }
    },
    [canMark, mutate, refetch],
  )

  const markAll = useCallback(async () => {
    if (!canMark) return
    const now = new Date().toISOString()
    mutate((current) => current.map((item) => (item.readAt ? item : { ...item, readAt: now })))
    try {
      await repository.markAllNotificationsRead()
    } catch {
      refetch()
    }
  }, [canMark, mutate, refetch])

  return {
    items: data,
    unread: data.filter((item) => !item.readAt).length,
    loading,
    error,
    canMark,
    markRead,
    markAll,
    refetch,
  }
}

/** A dónde lleva una notificación al abrirla. */
export function notificationPath(item: AppNotification): string {
  return item.kind === 'calificacion'
    ? `/alumno/calificaciones?semana=${item.weekNumber}`
    : `/alumno/notificaciones?aviso=${item.noticeId}`
}

/**
 * La campanita de arriba a la derecha, como en Canvas o cualquier plataforma:
 * el número de no leídas y, al abrirla, las más recientes.
 */
export function NotificationBell() {
  const { items, unread, error, canMark, markRead, markAll, refetch } = useNotifications()
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const box = useRef<HTMLDivElement>(null)

  // Notificaciones nuevas sin recargar: cada minuto y al volver a la pestaña.
  useEffect(() => {
    const timer = window.setInterval(refetch, REFRESH_MS)
    window.addEventListener('focus', refetch)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', refetch)
    }
  }, [refetch])

  // Se cierra con Escape o con un clic afuera.
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    const onClick = (event: MouseEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onClick)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onClick)
    }
  }, [open])

  function openItem(item: AppNotification) {
    void markRead(item)
    setOpen(false)
    navigate(notificationPath(item))
  }

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label={unread > 0 ? `Notificaciones, ${unread} sin leer` : 'Notificaciones'}
        className="relative rounded-lg p-2 text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900"
      >
        <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unread > 0 && (
          <span className="tnum absolute -top-0.5 -right-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-2 w-[22rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-ink-200 bg-white shadow-xl">
          <div className="flex items-center justify-between gap-3 border-b border-ink-100 px-4 py-3">
            <p className="text-sm font-semibold text-ink-950">Notificaciones</p>
            {canMark && unread > 0 && (
              <button
                type="button"
                onClick={() => void markAll()}
                className="text-xs font-medium text-accent-700 hover:underline"
              >
                Marcar todo como leído
              </button>
            )}
          </div>

          <ul className="max-h-[60vh] divide-y divide-ink-100 overflow-y-auto">
            {error ? (
              <li className="px-4 py-6 text-center text-sm text-red-800">{error}</li>
            ) : items.length === 0 ? (
              <li className="px-4 py-10 text-center text-sm text-ink-500">No tienes notificaciones.</li>
            ) : (
              items.slice(0, BELL_LIMIT).map((item) => (
                <li key={item.key}>
                  <button
                    type="button"
                    onClick={() => openItem(item)}
                    className={`flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-ink-50 ${
                      item.readAt ? '' : 'bg-sky-50/60'
                    }`}
                  >
                    <NotificationSummary item={item} compact />
                  </button>
                </li>
              ))
            )}
          </ul>

          <Link
            to="/alumno/notificaciones"
            onClick={() => setOpen(false)}
            className="block border-t border-ink-100 bg-ink-50 px-4 py-2.5 text-center text-sm font-medium text-ink-700 hover:bg-ink-100"
          >
            Ver todas
          </Link>
        </div>
      )}
    </div>
  )
}

/**
 * Una notificación: de qué es, el puntaje si es una calificación, el texto y
 * quién y cuándo. `compact` recorta el texto a dos líneas (la campanita).
 */
export function NotificationSummary({ item, compact = false }: { item: AppNotification; compact?: boolean }) {
  const isGrade = item.kind === 'calificacion'
  return (
    <>
      <span
        aria-hidden
        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${item.readAt ? 'bg-transparent' : 'bg-sky-600'}`}
      />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span
            className={`text-[10px] font-semibold tracking-wider uppercase ${
              isGrade ? 'text-emerald-700' : 'text-violet-700'
            }`}
          >
            {isGrade ? 'Calificación' : item.toGroup ? 'Aviso al grupo' : 'Aviso'}
          </span>
          {!item.readAt && <span className="sr-only">Sin leer</span>}
        </span>
        <span className="mt-0.5 block text-sm font-semibold text-ink-900">{item.title}</span>
        {isGrade && item.score !== null && (
          <span className="tnum mt-0.5 block text-sm text-ink-700">
            Obtuviste <span className="font-semibold text-ink-950">{formatPoints(item.score)}</span> /{' '}
            {formatPoints(item.pointsPossible)}
          </span>
        )}
        {item.body && (
          <span
            className={`mt-1 block text-sm text-ink-600 ${compact ? 'line-clamp-2' : 'whitespace-pre-line'}`}
          >
            {isGrade && <span className="font-medium text-ink-700">Comentario: </span>}
            {item.body}
          </span>
        )}
        <span className="mt-1 block text-xs text-ink-400">
          {[item.senderName, formatRelativeTime(item.createdAt)].filter(Boolean).join(' · ')}
        </span>
      </span>
    </>
  )
}
