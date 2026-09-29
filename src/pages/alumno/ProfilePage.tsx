import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'

import { translateAuthError, useAuth } from '../../auth/AuthProvider'
import { supabase } from '../../data/supabaseClient'
import { PasswordInput } from '../../components/PasswordInput'
import { Toast } from '../../components/Toast'

const LONGITUD_MINIMA = 8

/**
 * Cambio de contraseña del alumno.
 *
 * Existe porque la cuenta nace con la matrícula como contraseña, y la
 * matrícula no es un secreto: aparece en las listas del grupo y en el panel
 * del profesor. Ahora que el portal muestra el expediente del alumno (ADN
 * Profesional), cualquiera con esos dos datos podía entrar a ver el de otro
 * (ver docs/AUTH.md#lo-que-hay-que-saber-de-este-esquema-de-contraseñas).
 *
 * Pide la contraseña actual antes de dejar poner una nueva: `updateUser()`
 * por sí solo cambia la contraseña de cualquier sesión ya abierta sin
 * volver a pedirla, y esta pantalla es justo la que existe para que abrir
 * sesión con la matrícula deje de bastar. La verificación es un
 * `signInWithPassword()` extra contra la contraseña actual; solo si esa
 * llamada funciona se manda el `updateUser()` con la nueva.
 */
export function ProfilePage() {
  const { profile, session } = useAuth()
  const correo = profile?.email ?? session?.user?.email

  const [currentPassword, setCurrentPassword] = useState('')
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
    if (!correo) {
      setError('No se pudo identificar tu correo. Vuelve a iniciar sesión.')
      return
    }

    setSubmitting(true)

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: correo,
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

      <header className="mt-4 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-ink-950">Mi perfil</h1>
        <p className="mt-1 text-sm text-ink-600">Tu cuenta y tu contraseña.</p>
      </header>

      <section className="mx-auto mt-6 max-w-md rounded-xl border border-ink-200 bg-white p-6 shadow-sm">
        <p className="text-sm text-ink-700">Correo institucional</p>
        <p className="mt-1 text-sm font-medium text-ink-950">{correo}</p>

        <form onSubmit={handleSubmit} className="mt-6 border-t border-ink-100 pt-6">
          <h2 className="text-sm font-semibold text-ink-900">Cambiar contraseña</h2>
          <p className="mt-1 text-xs leading-relaxed text-ink-500">
            Tu cuenta se creó con tu matrícula como contraseña. Como tu matrícula no es
            secreta, te recomendamos ponerte una que solo tú sepas.
          </p>

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
      </section>
    </>
  )
}
