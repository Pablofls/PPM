import type { FormSummary } from '../data/types'

interface PageHeaderProps {
  label: string
  title: string
  subtitle: string
  summary: FormSummary | null
  isConnected: boolean
}

/**
 * Encabezado común de las pantallas de formulario: título, contadores y las
 * acciones "Procesar datos" y "Exportar datos".
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
        <div>
          <h1 className="text-xl font-semibold text-slate-900">
            <span className="text-slate-400">{label}</span> {title}
          </h1>
          <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
        </div>

        <div className="flex gap-2">
          <ActionButton>Procesar datos</ActionButton>
          <ActionButton>Exportar datos</ActionButton>
        </div>
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:max-w-2xl">
        <Stat label="Respuestas" value={summary?.responses} isConnected={isConnected} />
        <Stat label="Sin responder" value={summary?.pending} isConnected={isConnected} />
        <Stat label="Entregas tarde" value={summary?.late} isConnected={isConnected} />
      </dl>
    </header>
  )
}

function Stat({
  label,
  value,
  isConnected,
}: {
  label: string
  value: number | null | undefined
  isConnected: boolean
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
      <dt className="text-xs font-medium tracking-wide text-slate-500 uppercase">
        {label}
      </dt>
      <dd className="mt-1 text-2xl font-semibold text-slate-900 tabular-nums">
        {isConnected && value != null ? value : <span className="text-slate-300">—</span>}
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
      className="cursor-not-allowed rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-400"
    >
      {children}
    </button>
  )
}
