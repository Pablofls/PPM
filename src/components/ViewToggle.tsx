export interface ViewOption<T extends string> {
  value: T
  label: string
  /** Trazo SVG de 16 × 16, opcional. */
  icon?: string
}

/**
 * Dos o más vistas de la misma pantalla, como botones pegados: Mis grupos
 * (tarjetas o tabla) y Estado de Entregas (formularios o reportes).
 */
export function ViewToggle<T extends string>({
  options,
  value,
  onChange,
  label = 'Vista',
}: {
  options: ViewOption<T>[]
  value: T
  onChange: (value: T) => void
  label?: string
}) {
  return (
    <div role="group" aria-label={label} className="flex rounded-lg border border-ink-200 bg-white p-0.5 shadow-sm">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm ${
            value === option.value
              ? 'bg-ink-900 font-medium text-white'
              : 'text-ink-500 hover:bg-ink-100 hover:text-ink-900'
          }`}
        >
          {option.icon && (
            <svg viewBox="0 0 16 16" aria-hidden="true" className="size-4 fill-none stroke-current" strokeWidth={1.5}>
              <path d={option.icon} />
            </svg>
          )}
          {option.label}
        </button>
      ))}
    </div>
  )
}
