import { useCallback } from 'react'

import { useRepositoryQuery } from '../../data/hooks'
import { repository } from '../../data/repository'
import type { ActivityGradeEntry, PanelFilters } from '../../data/types'
import { stateOf } from './gradeUtils'

/** La clave del caché: la usan el hook y la precarga del menú. */
export const ACTIVITY_GRADE_CENTER_KEY = 'activityGradeCenter'

export const activityEntryKey = (studentId: string, formCode: string) => `${studentId}|${formCode}`

/**
 * Las calificaciones de las actividades que no son bitácora
 * (`v_activity_grade_center`, `0053`), con lo que el profesor guarda aplicado
 * al instante. Mismo criterio que `useGradeEntries`: no se vuelve a consultar
 * al calificar, se escribe en el caché compartido.
 */
export function useActivityGradeEntries(filters: PanelFilters) {
  const { data, loading, error, isConnected, mutate } = useRepositoryQuery(
    () => repository.getActivityGradeCenter(filters),
    [] as ActivityGradeEntry[],
    [filters],
    ACTIVITY_GRADE_CENTER_KEY,
  )

  /** `score: null` quita la calificación. Lanza si la base no la guardó. */
  const save = useCallback(
    async (entry: ActivityGradeEntry, score: number | null, comment: string | null) => {
      const cleanComment = score === null ? null : comment?.trim() || null
      await repository.setActivityGrade(
        entry.studentId,
        entry.groupId,
        entry.formCode,
        score,
        cleanComment,
      )
      const key = activityEntryKey(entry.studentId, entry.formCode)
      mutate((current) =>
        current.map((item) =>
          activityEntryKey(item.studentId, item.formCode) === key
            ? {
                ...item,
                score,
                comment: cleanComment,
                state: stateOf(score, item.submissionId),
                gradedAt: score === null ? null : new Date().toISOString(),
                seenAt: null,
              }
            : item,
        ),
      )
    },
    [mutate],
  )

  return { entries: data, loading, error, isConnected, save }
}
