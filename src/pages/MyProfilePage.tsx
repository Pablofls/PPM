import { useState, type FormEvent } from 'react'

import { ROLE_LABELS, useAuth } from '../auth/AuthProvider'
import { Badge } from '../components/Badge'
import { PasswordChangeForm } from '../components/PasswordChangeForm'
import { Toast } from '../components/Toast'

const FIELD_INPUT =
  'mt-1 block w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm text-ink-900 shadow-sm focus:border-ink-400 focus:ring-2 focus:ring-ink-900/5 focus:outline-none'

/**
 * Mi perfil, para quien usa el panel: nombre y apellido (por separado,
 * `0034`), el correo y el rol —de solo lectura— y el cambio de contraseña.
 *
 * El nombre es el que se ve en las tarjetas de Mis grupos cuando la cuenta
 * imparte un grupo. El correo y el rol no se editan aquí: el correo es el
 * usuario de la cuenta, y el rol lo asigna un administrador.
 */
export function MyProfilePage() {
  const { profile, session, updateName } = useAuth()
  const email = profile?.email ?? session?.user?.email ?? ''

  const [firstName, setFirstName] = useState(profile?.first_name ?? '')
  const [lastName, setLastName] = useState(profile?.last_name ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const unchanged =
    firstName.trim() === (profile?.first_name ?? '') && lastName.trim() === (profile?.last_name ?? '')

  async function handleSave(event: FormEvent) {
    event.preventDefault()
    if (!firstName.trim() || !lastName.trim()) {
      setError('Escribe tu nombre y tu apellido.')
      return
    }
    setSaving(true)
    setError(null)
    const failure = await updateName(firstName, lastName)
    setSaving(false)
    if (failure) setError(failure)
    else setToast('Tu nombre se guardó.')
  }

  return (
    <div className="mx-auto max-w-xl">
      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}

      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-ink-950">Mi perfil</h1>
        <p className="mt-1.5 text-sm text-ink-500">Tus datos, tu rol y tu contraseña.</p>
      </header>

      <section className="rounded-xl border border-ink-200 bg-white p-6 shadow-sm">
        <form onSubmit={handleSave}>
          <h2 className="text-sm font-semibold text-ink-900">Datos personales</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm text-ink-700">Nombre</span>
              <input
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
                autoComplete="given-name"
                className={FIELD_INPUT}
              />
            </label>
            <label className="block">
              <span className="text-sm text-ink-700">Apellido</span>
              <input
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
                autoComplete="family-name"
                className={FIELD_INPUT}
              />
            </label>
          </div>

          <dl className="mt-5 grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-sm text-ink-700">Correo</dt>
              <dd className="mt-1 truncate text-sm font-medium text-ink-950" title={email}>
                {email}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-ink-700">Rol</dt>
              <dd className="mt-1">
                {profile ? <Badge tone="neutral">{ROLE_LABELS[profile.role]}</Badge> : null}
              </dd>
            </div>
          </dl>

          {error && (
            <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={saving || unchanged}
            className="mt-6 rounded-lg bg-ink-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-ink-800 disabled:cursor-not-allowed disabled:bg-ink-200 disabled:text-ink-400"
          >
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </form>
      </section>

      <section className="mt-6 rounded-xl border border-ink-200 bg-white p-6 shadow-sm">
        <PasswordChangeForm
          email={email}
          hint="Te pedimos tu contraseña actual para confirmar que eres tú."
          onChanged={() => setToast('Tu contraseña se actualizó correctamente.')}
        />
      </section>
    </div>
  )
}
