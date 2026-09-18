import type { ReactNode } from 'react'

type Tone = 'neutral' | 'blue' | 'green' | 'amber' | 'red' | 'violet'

const TONES: Record<Tone, string> = {
  neutral: 'bg-ink-100 text-ink-600',
  blue: 'bg-sky-50 text-sky-800',
  green: 'bg-emerald-50 text-emerald-800',
  amber: 'bg-accent-200 text-ink-800',
  red: 'bg-red-50 text-red-800',
  violet: 'bg-violet-50 text-violet-800',
}

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode
  tone?: Tone
}) {
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap ${TONES[tone]}`}
    >
      {children}
    </span>
  )
}

/** Badge del idioma en que el alumno respondió el formulario. */
export function LanguageBadge({ value }: { value: string | null }) {
  if (!value) return <Dash />
  return (
    <Badge tone={value === 'en' ? 'blue' : 'green'}>
      {value === 'en' ? 'Inglés' : 'Español'}
    </Badge>
  )
}

/**
 * Estado de entrega, calculado en la vista `v_submission_status`.
 * `sin_fecha` significa que al formulario todavía no se le configuró una fecha
 * límite, no que el alumno no haya entregado.
 */
export function SubmissionStateBadge({ value }: { value: string }) {
  const map: Record<string, { tone: Tone; label: string }> = {
    a_tiempo: { tone: 'green', label: 'A tiempo' },
    tarde: { tone: 'amber', label: 'Tarde' },
    pendiente: { tone: 'red', label: 'Pendiente' },
    sin_fecha: { tone: 'neutral', label: 'Sin fecha' },
  }
  const state = map[value] ?? map.sin_fecha
  return <Badge tone={state.tone}>{state.label}</Badge>
}

/** Marcador para valores nulos. Un guion se lee mejor que una celda vacía. */
export function Dash() {
  return <span className="text-ink-300">—</span>
}
