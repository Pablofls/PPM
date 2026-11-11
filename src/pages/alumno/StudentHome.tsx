import { useCallback, useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { useAuth } from '../../auth/AuthProvider'
import {
  SubmissionStatusGrid,
  useSubmissionStatus,
  useWeeklyLogStatus,
  WeeklyLogStatusGrid,
} from '../../components/SubmissionStatusGrid'
import { DossierProfile, useStudentDossier } from '../../components/StudentDossier'
import { Toast } from '../../components/Toast'
import { usePermissions } from '../../auth/PermissionsProvider'
import { targetWeek } from '../../lib/weeks'
import { translateServerText, useLang, useT } from '../../lib/i18n'

/**
 * Inicio del portal del alumno: su ADN Profesional y su Estado de Entregas.
 *
 * Las bitácoras que entrega viven en su propia sección, Actividades
 * (`StudentActivitiesPage`).
 */
export function StudentHome() {
  const t = useT()
  const lang = useLang()
  const { profile, session, portalStudentId, portalReadOnly } = useAuth()
  const studentId = portalStudentId
  const [toast, dismissToast] = useHandoffToast()
  const { dossier } = useStudentDossier(studentId)
  // El nombre del alumno vive en su 1.0 (`demographics`), no en su cuenta
  // (`0034`): sin 1.0 contestado, el saludo usa el correo.
  const nombre = dossier?.fullName?.trim()
  // En «Ver como Alumno» el correo es el del alumno, no el de la sesión.
  const correo = portalReadOnly
    ? dossier?.institutionalEmail
    : (profile?.email ?? session?.user?.email)
  // Lo que el rol alumno puede ver (0038): cada parte del portal es una
  // pantalla con permiso.
  const { can } = usePermissions()
  const { statuses, error: statusError } = useSubmissionStatus(studentId)
  const { weeks, error: weeksError } = useWeeklyLogStatus(studentId)

  return (
    <>
      {toast && <Toast message={toast} onDismiss={dismissToast} />}

      {(can('alumno_adn') || can('alumno_estado')) && (
        <section className="rounded-xl border border-ink-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-ink-900">
            {can('alumno_adn')
              ? t('ADN Profesional', 'Professional DNA')
              : t('Estado de Entregas', 'Submission Status')}
          </h2>
          <div className="mt-4 space-y-7">
            {can('alumno_adn') && (
              <DossierProfile
                dossier={dossier}
                fallback={{ fullName: nombre ?? null, institutionalEmail: correo ?? null }}
              />
            )}

            {can('alumno_estado') && (
              <section>
                <h3 className="mb-3 text-sm font-semibold text-ink-950">
                  {t('Estado de Entregas', 'Submission Status')}
                </h3>
                {statusError ? (
                  <p className="text-sm text-red-800">{translateServerText(statusError, lang)}</p>
                ) : (
                  <div className="flex flex-wrap gap-8">
                    <div className="space-y-2">
                      <p className="text-[11px] font-semibold tracking-wider text-ink-500 uppercase">
                        {t('Formularios', 'Forms')}
                      </p>
                      <SubmissionStatusGrid statuses={statuses} />
                    </div>
                    <div className="space-y-2">
                      <p className="text-[11px] font-semibold tracking-wider text-ink-500 uppercase">
                        {t('Semanas', 'Weeks')}
                      </p>
                      {weeksError ? (
                        <p className="text-sm text-red-800">{translateServerText(weeksError, lang)}</p>
                      ) : (
                        <WeeklyLogStatusGrid weeks={weeks} highlightWeek={targetWeek(weeks)?.cell.weekNumber} />
                      )}
                    </div>
                  </div>
                )}
              </section>
            )}
          </div>
        </section>
      )}

    </>
  )
}

/**
 * El aviso que dejó la pantalla de la que venimos.
 *
 * Viaja en el `state` de la navegación y no en la URL: es un mensaje de una
 * sola vez, y en la URL quedaría en el historial y en cualquier enlace que el
 * alumno copiara.
 *
 * Se limpia del historial en cuanto se lee. Sin eso, recargar la página
 * volvería a anunciar una entrega que se hizo hace rato.
 */
function useHandoffToast(): [string | null, () => void] {
  const location = useLocation()
  const navigate = useNavigate()
  const entrante = (location.state as { toast?: string } | null)?.toast ?? null

  const [toast, setToast] = useState<string | null>(entrante)

  useEffect(() => {
    if (!entrante) return
    setToast(entrante)
    navigate(location.pathname, { replace: true, state: null })
  }, [entrante, location.pathname, navigate])

  const dismiss = useCallback(() => setToast(null), [])

  return [toast, dismiss]
}
