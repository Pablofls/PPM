import { useState, type FormEvent } from 'react'

import { translateAuthError } from '../auth/AuthProvider'
import { supabase } from '../data/supabaseClient'
import { PasswordInput } from './PasswordInput'

const LONGITUD_MINIMA = 8

/**
 * Cambio de contraseña de la cuenta de la sesión. Lo usan el perfil del
 * alumno y «Mi perfil» del panel.
 *
 * Pide la contraseña actual antes de dejar poner una nueva: `updateUser()`
 * por sí solo cambia la contraseña de cualquier sesión ya abierta sin
 * volver a pedirla. La verificación es un `signInWithPassword()` extra
 * contra la contraseña actual; solo si esa llamada funciona se manda el
 * `updateUser()` con la nueva.
 */
export function PasswordChangeForm({
  email,
  hint,
  onChanged,
}: {
  email: string | null | undefined
  /** Texto bajo el título: por qué conviene cambiarla. */
  hint: string
  onChanged: () => void
}) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [password, setPassword] = useState('')
  const [confirmacion, setConfirmacion] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)

    if (password.length < LONGITUD_MINIMA) {
      setError(`La contraseña debe tener al menos ${LONGITUD_MINIMA} caracteres.`)
      return
    }
    if (password !== confirmacion) {
      setError('Las contraseñas no coinciden.')
      return
    }
    if (!email) {
      setError('No se pudo identificar tu correo. Vuelve a iniciar sesión.')
      return
    }

    setSubmitting(true)

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password: currentPassword,
    })
    if (signInError) {
      setSubmitting(false)
      setError(
        signInError.message.toLowerCase().includes('invalid login credentials')
          ? 'Tu contraseña actual es incorrecta.'
          : translateAuthError(signInError.message),
      )
      return
    }

    const { error: updateError } = await supabase.auth.updateUser({ password })
    setSubmitting(false)

    if (updateError) {
      setError(translateAuthError(updateError.message))
      return
    }

    setCurrentPassword('')
    setPassword('')
    setConfirmacion('')
    onChanged()
  }

  return (
    <form onSubmit={handleSubmit}>
      <h2 className="text-sm font-semibold text-ink-900">Cambiar contraseña</h2>
      <p className="mt-1 text-xs leading-relaxed text-ink-500">{hint}</p>

      <label className="mt-4 block">
        <span className="text-sm text-ink-700">Contraseña actual</span>
        <PasswordInput
          value={currentPassword}
          onChange={setCurrentPassword}
          required
          autoComplete="current-password"
        />
      </label>

      <label className="mt-4 block">
        <span className="text-sm text-ink-700">Nueva contraseña</span>
        <PasswordInput
          value={password}
          onChange={setPassword}
          required
          minLength={LONGITUD_MINIMA}
          autoComplete="new-password"
        />
      </label>

      <label className="mt-4 block">
        <span className="text-sm text-ink-700">Confirmar contraseña</span>
        <PasswordInput
          value={confirmacion}
          onChange={setConfirmacion}
          required
          minLength={LONGITUD_MINIMA}
          autoComplete="new-password"
        />
      </label>

      {error && (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="mt-6 rounded-lg bg-accent-400 px-4 py-2.5 text-sm font-medium text-ink-900 transition-colors hover:bg-accent-500 focus:outline-2 focus:outline-offset-2 focus:outline-ink-900 disabled:cursor-not-allowed disabled:bg-ink-100 disabled:text-ink-400"
      >
        {submitting ? 'Guardando…' : 'Guardar contraseña'}
      </button>
    </form>
  )
}
