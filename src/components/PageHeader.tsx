import type { FormSummary } from '../data/types'

interface PageHeaderProps {
  label: string
  title: string
  subtitle: string
  summary: FormSummary | null
  isConnected: boolean
}

/**
 * Encabezado de las pantallas de formulario: título, contadores y las acciones
 * "Procesar datos" y "Exportar datos".
 *
 * Las acciones existen en la plataforma actual en Apps Script; se conservan
 * deshabilitadas para no dar a entender que se eliminaron.
 */
export function PageHeader({
  label,
  title,
  subtitle,
  summary,
  isConnected,
}: PageHeaderProps) {
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

        <div className="flex gap-2">
          <ActionButton>Procesar datos</ActionButton>
          <ActionButton>Exportar datos</ActionButton>
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
