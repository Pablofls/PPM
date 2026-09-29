import { useId, useState } from 'react'

/**
 * Campo de contraseña con el ojo para mostrarla u ocultarla.
 *
 * Comparte el mismo componente el login y el cambio de contraseña del
 * perfil: es el mismo control en los dos lugares, no dos implementaciones
 * del mismo ojo.
 */
export function PasswordInput({
  value,
  onChange,
  autoComplete,
  required,
  minLength,
}: {
  value: string
  onChange: (value: string) => void
  autoComplete?: string
  required?: boolean
  minLength?: number
}) {
  const [visible, setVisible] = useState(false)
  const inputId = useId()

  return (
    <div className="relative mt-1.5">
      <input
        id={inputId}
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        minLength={minLength}
        autoComplete={autoComplete}
        className="w-full rounded-lg border border-ink-200 px-3 py-2 pr-10 text-sm focus:border-ink-400 focus:ring-2 focus:ring-ink-900/5 focus:outline-none"
      />
      <button
        type="button"
        onClick={() => setVisible((current) => !current)}
        aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
        tabIndex={-1}
        className="absolute inset-y-0 right-0 flex items-center px-3 text-ink-400 transition-colors hover:text-ink-700"
      >
        {visible ? <EyeOffIcon /> : <EyeIcon />}
      </button>
    </div>
  )
}

function EyeIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path
        d="M1.5 10S4.5 4 10 4s8.5 6 8.5 6-3 6-8.5 6-8.5-6-8.5-6Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="10" cy="10" r="2.25" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function EyeOffIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path
        d="M2.5 2.5l15 15M8.36 8.36a2.25 2.25 0 0 0 3.28 3.28M6.1 6.13C3.6 7.65 1.5 10 1.5 10s3 6 8.5 6c1.6 0 2.98-.5 4.12-1.19M15.4 14.88C17.02 13.57 18.5 10 18.5 10s-3-6-8.5-6c-.57 0-1.11.06-1.62.17"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
