import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'

import { translateAuthError, useAuth } from '../../auth/AuthProvider'
import { supabase } from '../../data/supabaseClient'
import { Toast } from '../../components/Toast'

const LONGITUD_MINIMA = 10

/**
 * Cambio de contraseña del alumno.
 *
 * Existe porque la cuenta nace con la matrícula como contraseña, y la
 * matrícula no es un secreto: aparece en las listas del grupo y en el panel
 * del profesor. Ahora que el portal muestra el expediente del alumno (ADN
 * Profesional), cualquiera con esos dos datos podía entrar a ver el de otro
 * (ver docs/AUTH.md#lo-que-hay-que-saber-de-este-esquema-de-contraseñas).
 *
 * `supabase.auth.updateUser()` cambia la contraseña de la sesión ya
 * autenticada, sin pedir la actual: es la misma API que usa el resto del
 * panel, no toca ninguna tabla de `public` y no hace falta una migración.
 */
export function ProfilePage() {
  const { profile, session } = useAuth()
  const correo = profile?.email ?? session?.user?.email

  const [password, setPassword] = useState('')
  const [confirmacion, setConfirmacion] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

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

    setSubmitting(true)
    const { error: updateError } = await supabase.auth.updateUser({ password })
    setSubmitting(false)

    if (updateError) {
      setError(translateAuthError(updateError.message))
      return
    }

    setPassword('')
    setConfirmacion('')
    setToast('Tu contraseña se actualizó correctamente.')
  }

  return (
    <>
      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}

      <Link
        to="/alumno"
        className="text-sm font-medium text-ink-500 transition-colors hover:text-ink-900"
      >
        ← Mis tareas
      </Link>

      <header className="mt-4">
        <h1 className="text-2xl font-semibold tracking-tight text-ink-950">Mi perfil</h1>
        <p className="mt-1 text-sm text-ink-600">Tu cuenta y tu contraseña.</p>
      </header>

      <section className="mt-6 max-w-md rounded-xl border border-ink-200 bg-white p-6 shadow-sm">
        <p className="text-sm text-ink-700">Correo institucional</p>
        <p className="mt-1 text-sm font-medium text-ink-950">{correo}</p>

        <form onSubmit={handleSubmit} className="mt-6 border-t border-ink-100 pt-6">
          <h2 className="text-sm font-semibold text-ink-900">Cambiar contraseña</h2>
          <p className="mt-1 text-xs leading-relaxed text-ink-500">
            Tu cuenta se creó con tu matrícula como contraseña. Como tu matrícula no es
            secreta, te recomendamos ponerte una que solo tú sepas.
          </p>

          <label className="mt-4 block">
            <span className="text-sm text-ink-700">Nueva contraseña</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={LONGITUD_MINIMA}
              autoComplete="new-password"
              className="mt-1.5 w-full rounded-lg border border-ink-200 px-3 py-2 text-sm focus:border-ink-400 focus:ring-2 focus:ring-ink-900/5 focus:outline-none"
            />
          </label>

          <label className="mt-4 block">
            <span className="text-sm text-ink-700">Confirmar contraseña</span>
            <input
              type="password"
              value={confirmacion}
              onChange={(event) => setConfirmacion(event.target.value)}
              required
              minLength={LONGITUD_MINIMA}
              autoComplete="new-password"
              className="mt-1.5 w-full rounded-lg border border-ink-200 px-3 py-2 text-sm focus:border-ink-400 focus:ring-2 focus:ring-ink-900/5 focus:outline-none"
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
      </section>
    </>
  )
}
