import { useState } from 'react'

import { useSyncStatus } from '../data/hooks'
import { repository } from '../data/repository'
import type { FormSummary, SyncRunResult, SyncStatus } from '../data/types'
import { formatDateTime, formatRelativeTime } from '../lib/format'
import { Toast } from './Toast'

interface PageHeaderProps {
  label: string
  title: string
  subtitle: string
  summary: FormSummary | null
  isConnected: boolean
  /** Los apéndices solo tienen "Exportar datos". */
  hideProcessAction?: boolean
}

/**
 * Encabezado de las pantallas de formulario: título, contadores y las acciones
 * "Procesar datos" y "Exportar datos".
 *
 * "Exportar datos" existe en la plataforma actual en Apps Script; se conserva
 * deshabilitada para no dar a entender que se eliminó. "Procesar datos" sí
 * funciona: llama a `admin_run_sheet_sync()` (`0022`), que reprocesa lo que ya
 * esté en el staging del Sheets y da de alta las cuentas de alumno que falten
 * (`0021`), sin esperar el disparador horario del Apps Script.
 *
 * Junto a ellas va el estado de la sincronización con el Sheets: es lo que le
 * dice al profesor qué tan frescos son los datos que está viendo, y se
 * refresca solo al terminar una corrida manual.
 */
export function PageHeader({
  label,
  title,
  subtitle,
  summary,
  isConnected,
  hideProcessAction = false,
}: PageHeaderProps) {
  const { data: sync, loading: syncLoading, isConnected: syncConnected, error: syncError, refetch } =
    useSyncStatus()
  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'error' } | null>(null)

  return (
    <header className="mb-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <h1 className="flex items-baseline gap-2.5 text-2xl font-semibold tracking-tight text-ink-950">
            <span className="tnum text-ink-300">{label}</span>
            {title}
          </h1>
          <p className="mt-1.5 text-sm text-ink-500">{subtitle}</p>
        </div>

        <div className="flex items-center gap-4">
          {syncConnected && !syncLoading && (
            <SyncIndicator sync={sync} error={syncError} />
          )}
          <div className="flex gap-2">
            {!hideProcessAction && (
              <ProcessDataButton
                disabled={!isConnected}
                onDone={(result) => {
                  refetch()
                  setToast({ message: describeSyncRun(result), tone: 'success' })
                }}
                onFailed={(message) => setToast({ message, tone: 'error' })}
              />
            )}
            <ActionButton>Exportar datos</ActionButton>
          </div>
        </div>
      </div>

      <dl className="mt-5 grid gap-3 sm:grid-cols-3 lg:max-w-2xl">
        <Stat label="Respuestas" value={summary?.responses} isConnected={isConnected} />
        <Stat label="Sin responder" value={summary?.pending} isConnected={isConnected} />
        {/* Es el único contador que pide algo del profesor: lleva el acento. */}
        <Stat
          label="Entregas tarde"
          value={summary?.late}
          isConnected={isConnected}
          highlight
        />
      </dl>

      {toast && (
        <Toast message={toast.message} tone={toast.tone} onDismiss={() => setToast(null)} />
      )}
    </header>
  )
}

function Stat({
  label,
  value,
  isConnected,
  highlight = false,
}: {
  label: string
  value: number | null | undefined
  isConnected: boolean
  /** Marca el contador cuando hay algo que atender. */
  highlight?: boolean
}) {
  const hasValue = isConnected && value != null
  const marked = highlight && hasValue && value > 0

  return (
    <div
      className={`rounded-xl border bg-white px-4 py-3 shadow-sm ${
        marked ? 'border-accent-400' : 'border-ink-200'
      }`}
    >
      <dt className="flex items-center gap-1.5 text-xs font-medium text-ink-500">
        {marked && <span className="size-1.5 rounded-full bg-accent-500" />}
        {label}
      </dt>
      <dd className="tnum mt-1 text-2xl font-semibold tracking-tight text-ink-950">
        {hasValue ? value : <span className="text-ink-300">—</span>}
      </dd>
    </div>
  )
}

/**
 * A partir de cuántos minutos la sincronización se considera atrasada.
 *
 * El disparador corre cada hora, pero Apps Script lo dispara en un minuto al
 * azar dentro de la hora, así que dos corridas seguidas pueden separarse casi
 * dos horas sin que nada esté mal. 150 minutos deja margen para eso y marca de
 * verdad cuando el disparador murió.
 */
const STALE_AFTER_MINUTES = 150

/** Cuánto puede tardar una corrida antes de darla por caída. */
const RUN_TIMEOUT_MINUTES = 10

/**
 * Estado de la última sincronización con el Sheets.
 *
 * Recibe el dato ya cargado — `PageHeader` es quien tiene el hook, porque
 * también lo necesita `ProcessDataButton` para refrescarlo al terminar una
 * corrida manual.
 */
function SyncIndicator({
  sync,
  error,
}: {
  sync: SyncStatus | null
  error: string | null
}) {
  const { text, stale, detail } = describeSync(sync, error)

  return (
    <span
      title={detail}
      className={`flex items-center gap-1.5 text-xs ${
        stale ? 'font-medium text-accent-700' : 'text-ink-500'
      }`}
    >
      <span
        className={`size-1.5 shrink-0 rounded-full ${
          stale ? 'bg-accent-500' : 'bg-ink-300'
        }`}
      />
      {text}
    </span>
  )
}

function describeSync(
  sync: SyncStatus | null,
  error: string | null,
): { text: string; stale: boolean; detail: string } {
  if (error) {
    return {
      text: 'Sincronización desconocida',
      stale: true,
      detail: `No se pudo leer el estado: ${error}`,
    }
  }

  if (!sync) {
    return {
      text: 'Sin sincronizar',
      stale: true,
      detail: 'El Apps Script del Sheets todavía no ha mandado nada.',
    }
  }

  const minutesSinceStart = Math.round(
    (Date.now() - new Date(sync.startedAt).getTime()) / 60_000,
  )

  // Sin `finished_at` la corrida sigue abierta: o va corriendo, o se cayó a la
  // mitad y su transacción se revirtió.
  if (!sync.finishedAt) {
    return minutesSinceStart <= RUN_TIMEOUT_MINUTES
      ? {
          text: 'Sincronizando…',
          stale: false,
          detail: `Empezó ${formatRelativeTime(sync.startedAt)}.`,
        }
      : {
          text: 'La última sincronización no terminó',
          stale: true,
          detail: `Empezó el ${formatDateTime(sync.startedAt)} y nunca cerró.`,
        }
  }

  const minutesSinceEnd = Math.round(
    (Date.now() - new Date(sync.finishedAt).getTime()) / 60_000,
  )

  return {
    text: `Sincronizado ${formatRelativeTime(sync.finishedAt)}`,
    stale: minutesSinceEnd > STALE_AFTER_MINUTES,
    detail:
      `Última sincronización con el Sheets: ${formatDateTime(sync.finishedAt)}.` +
      (minutesSinceEnd > STALE_AFTER_MINUTES
        ? ' Corre cada hora, así que este retraso no es normal.'
        : ''),
  }
}

function ActionButton({ children }: { children: string }) {
  return (
    <button
      type="button"
      disabled
      title="Disponible cuando se conecte la base de datos"
      className="cursor-not-allowed rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm font-medium text-ink-400 shadow-sm"
    >
      {children}
    </button>
  )
}

/**
 * "Procesar datos": dispara `admin_run_sheet_sync()` a mano. Deshabilitado
 * mientras corre, para que no se pueda mandar una segunda corrida encima.
 */
function ProcessDataButton({
  disabled,
  onDone,
  onFailed,
}: {
  disabled: boolean
  onDone: (result: SyncRunResult) => void
  onFailed: (message: string) => void
}) {
  const [running, setRunning] = useState(false)

  async function handleClick() {
    setRunning(true)
    try {
      const result = await repository.runSheetSync()
      onDone(result)
    } catch (cause) {
      onFailed(cause instanceof Error ? cause.message : 'No se pudo procesar los datos.')
    } finally {
      setRunning(false)
    }
  }

  return (
    <button
      type="button"
      disabled={disabled || running}
      onClick={handleClick}
      title={
        disabled
          ? 'Disponible cuando se conecte la base de datos'
          : 'Reprocesa lo que ya llegó del Sheets y da de alta las cuentas que falten'
      }
      className="rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm font-medium text-ink-700 shadow-sm transition-colors hover:bg-ink-50 disabled:cursor-not-allowed disabled:text-ink-400 disabled:hover:bg-white"
    >
      {running ? 'Procesando…' : 'Procesar datos'}
    </button>
  )
}

/** El mensaje del aviso al terminar una corrida manual de `ProcessDataButton`. */
function describeSyncRun(result: SyncRunResult): string {
  const partes: string[] = []
  if (result.recordsSynced > 0) {
    partes.push(
      result.recordsSynced === 1 ? '1 entrega nueva' : `${result.recordsSynced} entregas nuevas`,
    )
  }
  if (result.accountsCreated > 0) {
    partes.push(
      result.accountsCreated === 1
        ? '1 cuenta de alumno nueva'
        : `${result.accountsCreated} cuentas de alumno nuevas`,
    )
  }

  if (partes.length === 0) return 'Ya estás al día: no había nada nuevo que procesar.'
  return `Se procesaron ${partes.join(' y ')}.`
}
