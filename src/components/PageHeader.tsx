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
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {/* Franja amarilla: identifica la tarjeta del formulario sin teñir el fondo. */}
        <div className="h-1.5 bg-accent-400" />

        <div className="flex flex-wrap items-start justify-between gap-4 px-6 py-5">
          <div className="flex items-start gap-4">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-brand-800 text-sm font-bold text-white tabular-nums">
              {label}
            </span>
            <div>
              <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
              <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
            </div>
          </div>

          <div className="flex gap-2">
            <ActionButton>Procesar datos</ActionButton>
            <ActionButton>Exportar datos</ActionButton>
          </div>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:max-w-3xl">
        <Stat
          label="Respuestas"
          value={summary?.responses}
          tone="brand"
          isConnected={isConnected}
        />
        <Stat
          label="Sin responder"
          value={summary?.pending}
          tone="slate"
          isConnected={isConnected}
        />
        <Stat
          label="Entregas tarde"
          value={summary?.late}
          tone="accent"
          isConnected={isConnected}
        />
      </dl>
    </header>
  )
}

/** Un color por contador: el profesor los distingue de reojo, sin leerlos. */
const STAT_TONES = {
  brand: { bar: 'bg-brand-600', value: 'text-brand-800' },
  slate: { bar: 'bg-slate-300', value: 'text-slate-700' },
  accent: { bar: 'bg-accent-400', value: 'text-accent-800' },
} as const

function Stat({
  label,
  value,
  tone,
  isConnected,
}: {
  label: string
  value: number | null | undefined
  tone: keyof typeof STAT_TONES
  isConnected: boolean
}) {
  const styles = STAT_TONES[tone]
  return (
    <div className="flex overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <span className={`w-1.5 shrink-0 ${styles.bar}`} />
      <div className="px-4 py-3">
        <dt className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
          {label}
        </dt>
        <dd className={`mt-1 text-2xl font-semibold tabular-nums ${styles.value}`}>
          {isConnected && value != null ? value : <span className="text-slate-300">—</span>}
        </dd>
      </div>
    </div>
  )
}

function ActionButton({ children }: { children: string }) {
  return (
    <button
      type="button"
      disabled
      title="Disponible cuando se conecte la base de datos"
      className="cursor-not-allowed rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-400"
    >
      {children}
    </button>
  )
}
