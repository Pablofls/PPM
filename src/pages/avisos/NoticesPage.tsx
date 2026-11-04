import { useState } from 'react'

import { usePermissions } from '../../auth/PermissionsProvider'
import { Badge } from '../../components/Badge'
import { SendNoticeModal } from '../../components/SendNoticeModal'
import { Toast } from '../../components/Toast'
import { useRepositoryQuery } from '../../data/hooks'
import { repository } from '../../data/repository'
import type { SentNotice } from '../../data/types'
import { formatDateTime, formatGroupLabel } from '../../lib/format'
import { useGroups } from '../../layouts/GroupProvider'

/**
 * Avisos — como los Anuncios de un curso en Canvas.
 *
 * Los avisos que se han mandado a los alumnos del grupo elegido (a todo el
 * grupo o a alguien en particular desde su ADN), con cuántos ya lo leyeron, y
 * el botón para mandar uno nuevo a todo el grupo. Le llega a cada alumno en la
 * campanita de su portal (`0050`).
 */
export function NoticesPage() {
  const groupContext = useGroups()
  const canSend = usePermissions().can('avisos', 'edicion')
  const [composing, setComposing] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [open, setOpen] = useState<string | null>(null)

  const { data: notices, loading, error } = useRepositoryQuery(
    () => repository.getSentNotices(),
    [] as SentNotice[],
    [],
  )

  const groups = groupContext?.groups ?? []
  const selectedId = groupContext?.selectedGroupId ?? ''
  const visible = selectedId
    ? notices.filter(
        (notice) =>
          notice.targetGroupIds.includes(selectedId) || notice.recipientGroupIds.includes(selectedId),
      )
    : notices
  const groupName = (id: string) => {
    const group = groups.find((item) => item.id === id)
    return group ? formatGroupLabel(group) : 'otro grupo'
  }

  return (
    <>
      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}

      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink-950">Avisos</h1>
          <p className="mt-1.5 text-sm text-ink-500">
            Mensajes a tus alumnos. Les llegan a la campanita de su portal. Para avisarle a un
            alumno en particular, abre su ADN Profesional.
          </p>
        </div>
        {canSend && (
          <button
            type="button"
            onClick={() => setComposing(true)}
            disabled={groups.length === 0}
            className="rounded-lg bg-ink-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-ink-800 disabled:cursor-not-allowed disabled:bg-ink-200 disabled:text-ink-400"
          >
            Nuevo aviso al grupo
          </button>
        )}
      </header>

      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-ink-200 bg-white px-4 py-16 text-center text-sm text-ink-500 shadow-sm">
          {loading ? 'Cargando…' : 'Todavía no se ha mandado ningún aviso a este grupo.'}
        </div>
      ) : (
        <ul className="divide-y divide-ink-100 overflow-hidden rounded-xl border border-ink-200 bg-white shadow-sm">
          {visible.map((notice) => {
            const expanded = open === notice.noticeId
            const allRead = notice.readCount === notice.recipientCount
            return (
              <li key={notice.noticeId}>
                <button
                  type="button"
                  onClick={() => setOpen(expanded ? null : notice.noticeId)}
                  aria-expanded={expanded}
                  className="flex w-full flex-wrap items-start justify-between gap-x-6 gap-y-2 px-5 py-4 text-left hover:bg-ink-50/60"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-ink-900">{notice.subject}</span>
                    <span className={`mt-1 block text-sm text-ink-600 ${expanded ? 'whitespace-pre-line' : 'line-clamp-1'}`}>
                      {notice.body}
                    </span>
                    <span className="mt-1.5 block text-xs text-ink-500">
                      {notice.targetGroupIds.length > 0
                        ? `Para el grupo ${notice.targetGroupIds.map(groupName).join(', ')}`
                        : `Para ${notice.recipientCount} alumno${notice.recipientCount === 1 ? '' : 's'} en particular`}
                      {notice.senderName && <> · {notice.senderName}</>} · {formatDateTime(notice.sentAt)}
                    </span>
                  </span>
                  <Badge tone={allRead ? 'green' : 'neutral'}>
                    <span className="tnum">
                      Leído por {notice.readCount} de {notice.recipientCount}
                    </span>
                  </Badge>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {composing && (
        <SendNoticeModal
          target={{ kind: 'grupo', groups, groupId: selectedId }}
          onClose={() => setComposing(false)}
          onSent={(message) => {
            setComposing(false)
            setToast(message)
          }}
        />
      )}
    </>
  )
}
