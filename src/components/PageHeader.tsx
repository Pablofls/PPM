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
 * Los contadores van en una sola línea separados por filetes, no en tres
 * tarjetas: son tres números del mismo formulario y leerlos juntos es lo que
 * dice cómo va el grupo.
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
    <header className="mb-7 border-b border-ink-200 pb-6">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="max-w-2xl">
          <p className="tnum text-xs font-medium tracking-widest text-ink-400 uppercase">
            Formulario {label}
          </p>
          <h1 className="mt-2 font-serif text-3xl leading-tight text-ink-950">{title}</h1>
          <p className="mt-2 text-sm text-ink-500">{subtitle}</p>
        </div>

        <div className="flex gap-2">
          <ActionButton>Procesar datos</ActionButton>
          <ActionButton>Exportar datos</ActionButton>
        </div>
      </div>

      <dl className="mt-6 flex flex-wrap items-baseline gap-x-10 gap-y-3">
        <Stat label="Respuestas" value={summary?.responses} isConnected={isConnected} />
        <Stat label="Sin responder" value={summary?.pending} isConnected={isConnected} />
        {/* Es el único contador que pide algo del profesor: va subrayado. */}
        <Stat label="Entregas tarde" value={summary?.late} isConnected={isConnected} highlight />
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
  /** Marca el número en amarillo cuando hay algo que atender. */
  highlight?: boolean
}) {
  const hasValue = isConnected && value != null
  return (
    <div className="flex items-baseline gap-2.5 border-l border-ink-200 pl-4 first:border-l-0 first:pl-0">
      <dd
        className={`tnum font-serif text-2xl text-ink-900 ${
          highlight && hasValue && value > 0
            ? 'bg-accent-300 px-1.5 decoration-clone'
            : ''
        }`}
      >
        {hasValue ? value : <span className="text-ink-300">—</span>}
      </dd>
      <dt className="text-sm text-ink-500">{label}</dt>
    </div>
  )
}

function ActionButton({ children }: { children: string }) {
  return (
    <button
      type="button"
      disabled
      title="Disponible cuando se conecte la base de datos"
      className="cursor-not-allowed rounded border border-ink-200 px-3 py-1.5 text-sm text-ink-400"
    >
      {children}
    </button>
  )
}
