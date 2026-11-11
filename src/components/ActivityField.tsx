/**
 * Las piezas de un formulario de actividad del portal (una bitácora, el 1.0):
 * la etiqueta con su ayuda y el estilo de los campos.
 */

export const INPUT =
  'w-full rounded-lg border border-ink-300 bg-white px-3 py-2 text-sm text-ink-900 shadow-sm outline-none transition-colors placeholder:text-ink-400 focus:border-ink-500 focus:ring-2 focus:ring-ink-200 disabled:bg-ink-50'

export function Field({
  label,
  help,
  required,
  children,
}: {
  label: string
  help?: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-ink-800">
        {label}
        {required && (
          <span aria-hidden="true" className="ml-1 text-red-700">
            *
          </span>
        )}
      </span>
      {help && <span className="mt-0.5 block text-xs text-ink-500">{help}</span>}
      <div className="mt-2">{children}</div>
    </label>
  )
}
