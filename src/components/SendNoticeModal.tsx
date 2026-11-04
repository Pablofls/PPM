import { useState } from 'react'

import { repository } from '../data/repository'
import type { Group } from '../data/types'
import { formatGroupLabel } from '../lib/format'
import { Modal } from './Modal'

const SUBJECT_MAX = 150
const BODY_MAX = 5000

const inputClass =
  'w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm text-ink-900 shadow-sm focus:border-ink-400 focus:ring-2 focus:ring-ink-900/5 focus:outline-none'
const labelClass = 'text-[11px] font-semibold tracking-wider text-ink-500 uppercase'

/** A quién va el aviso: un alumno (desde su ADN) o un grupo completo (Avisos). */
export type NoticeTarget =
  | { kind: 'alumno'; studentId: string; name: string }
  | { kind: 'grupo'; groups: Group[]; groupId: string }

/**
 * Escribir y mandar un aviso (`send_notice`, `0050`). Le llega al alumno —o a
 * todos los del grupo— en la campanita de su portal.
 */
export function SendNoticeModal({
  target,
  onClose,
  onSent,
}: {
  target: NoticeTarget
  onClose: () => void
  onSent: (message: string) => void
}) {
  const [groupId, setGroupId] = useState(target.kind === 'grupo' ? target.groupId : '')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const group = target.kind === 'grupo' ? target.groups.find((item) => item.id === groupId) : undefined

  async function send() {
    if (!subject.trim() || !body.trim()) {
      setError('Escribe el asunto y el mensaje.')
      return
    }
    if (target.kind === 'grupo' && !groupId) {
      setError('Elige el grupo.')
      return
    }
    setSending(true)
    setError(null)
    try {
      await repository.sendNotice({
        subject: subject.trim(),
        body: body.trim(),
        studentIds: target.kind === 'alumno' ? [target.studentId] : undefined,
        groupIds: target.kind === 'grupo' ? [groupId] : undefined,
      })
      onSent(
        target.kind === 'alumno'
          ? `Aviso enviado a ${target.name}.`
          : `Aviso enviado al grupo ${group ? formatGroupLabel(group) : ''}.`,
      )
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo enviar el aviso.')
      setSending(false)
    }
  }

  return (
    <Modal
      title={target.kind === 'alumno' ? 'Enviar aviso al alumno' : 'Enviar aviso al grupo'}
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-ink-200 bg-white px-4 py-2 text-sm font-medium text-ink-700 shadow-sm hover:bg-ink-100"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={sending}
            onClick={() => void send()}
            className="rounded-lg bg-ink-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-ink-800 disabled:cursor-not-allowed disabled:bg-ink-200 disabled:text-ink-400"
          >
            {sending ? 'Enviando…' : 'Enviar aviso'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <p className={labelClass}>Para</p>
          {target.kind === 'alumno' ? (
            <p className="mt-1.5 text-sm font-medium text-ink-900">{target.name}</p>
          ) : (
            <select
              value={groupId}
              onChange={(event) => setGroupId(event.target.value)}
              className={`${inputClass} mt-1.5`}
            >
              <option value="">Elige un grupo…</option>
              {target.groups.map((item) => (
                <option key={item.id} value={item.id}>
                  {formatGroupLabel(item)} — {item.studentCount} alumno{item.studentCount === 1 ? '' : 's'}
                </option>
              ))}
            </select>
          )}
          {target.kind === 'grupo' && (
            <p className="mt-1.5 text-xs text-ink-500">
              Les llega a todos los alumnos inscritos hoy en el grupo.
            </p>
          )}
        </div>

        <div>
          <label htmlFor="notice-subject" className={labelClass}>
            Asunto
          </label>
          <input
            id="notice-subject"
            value={subject}
            maxLength={SUBJECT_MAX}
            onChange={(event) => setSubject(event.target.value)}
            className={`${inputClass} mt-1.5`}
          />
        </div>

        <div>
          <label htmlFor="notice-body" className={labelClass}>
            Mensaje
          </label>
          <textarea
            id="notice-body"
            rows={7}
            value={body}
            maxLength={BODY_MAX}
            onChange={(event) => setBody(event.target.value)}
            className={`${inputClass} mt-1.5 resize-y`}
          />
          <p className="tnum mt-1 text-right text-xs text-ink-400">
            {body.length} / {BODY_MAX}
          </p>
        </div>

        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
      </div>
    </Modal>
  )
}
