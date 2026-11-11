import { useState } from 'react'
import { Link } from 'react-router-dom'

import { useAuth } from '../../auth/AuthProvider'
import { PasswordChangeForm } from '../../components/PasswordChangeForm'
import { Toast } from '../../components/Toast'
import { useT } from '../../lib/i18n'

/**
 * Cambio de contraseña del alumno.
 *
 * Existe porque la cuenta nace con la matrícula como contraseña, y la
 * matrícula no es un secreto: aparece en las listas del grupo y en el panel
 * del profesor. Ahora que el portal muestra el expediente del alumno (ADN
 * Profesional), cualquiera con esos dos datos podía entrar a ver el de otro
 * (ver docs/AUTH.md#lo-que-hay-que-saber-de-este-esquema-de-contraseñas).
 * El formulario es `PasswordChangeForm`, el mismo de «Mi perfil» del panel.
 */
export function ProfilePage() {
  const { profile, session } = useAuth()
  const correo = profile?.email ?? session?.user?.email
  const [toast, setToast] = useState<string | null>(null)
  const t = useT()

  return (
    <>
      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}

      <Link
        to="/alumno"
        className="text-sm font-medium text-ink-500 transition-colors hover:text-ink-900"
      >
        ← {t('Inicio', 'Home')}
      </Link>

      <header className="mt-4 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-ink-950">
          {t('Mi perfil', 'My profile')}
        </h1>
        <p className="mt-1 text-sm text-ink-600">
          {t('Tu cuenta y tu contraseña.', 'Your account and your password.')}
        </p>
      </header>

      <section className="mx-auto mt-6 max-w-md rounded-xl border border-ink-200 bg-white p-6 shadow-sm">
        <p className="text-sm text-ink-700">{t('Correo institucional', 'Institutional email')}</p>
        <p className="mt-1 text-sm font-medium text-ink-950">{correo}</p>

        <div className="mt-6 border-t border-ink-100 pt-6">
          <PasswordChangeForm
            email={correo}
            hint={t(
              'Tu cuenta se creó con tu matrícula como contraseña. Como tu matrícula no es secreta, te recomendamos ponerte una que solo tú sepas.',
              'Your account was created with your student ID as the password. Since your student ID is not secret, we recommend choosing one that only you know.',
            )}
            onChanged={() =>
              setToast(t('Tu contraseña se actualizó correctamente.', 'Your password was updated successfully.'))
            }
          />
        </div>
      </section>
    </>
  )
}
