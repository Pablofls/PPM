import { useAuth } from '../../auth/AuthProvider'
import { useStudentDossier } from '../../components/StudentDossier'
import { useRepositoryQuery } from '../../data/hooks'
import { repository } from '../../data/repository'
import type { Activity } from '../../data/types'
import { activityState } from '../../lib/activities'
import type { ActivityFormCode } from '../../lib/catalog'

/**
 * Las actividades que ve el alumno del portal (`0051`): las de su grupo,
 * publicadas y cuyo «Disponible desde» ya pasó.
 *
 * Al alumno se las filtra RLS (`activities_select_own`). El admin en «Ver
 * como Alumno» lee todas (su RLS es otra), así que se acotan aquí también al
 * grupo del alumno que está viendo y a las visibles: los dos ven lo mismo.
 */
export function useMyActivities() {
  const { portalStudentId } = useAuth()
  const { dossier, error: dossierError } = useStudentDossier(portalStudentId)
  const groupId = dossier?.groupId ?? null

  const { data, loading, error } = useRepositoryQuery(
    () => (groupId ? repository.getMyActivities(groupId) : Promise.resolve([] as Activity[])),
    [] as Activity[],
    [groupId],
    'myActivities',
  )

  const activities = data.filter((activity) => {
    const state = activityState(activity)
    return activity.groupId === groupId && (state === 'abierta' || state === 'cerrada')
  })

  return {
    activities,
    // Sin expediente todavía no se sabe el grupo: sigue cargando.
    loading: loading || (portalStudentId !== null && dossier === null && !dossierError),
    error: error ?? dossierError,
    byCode: (code: ActivityFormCode) => activities.find((activity) => activity.formCode === code),
  }
}
