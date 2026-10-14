import { useCallback } from 'react'

import { useRepositoryQuery } from '../../data/hooks'
import { repository } from '../../data/repository'
import type { GradeEntry, PanelFilters } from '../../data/types'
import { entryKey, stateOf } from './gradeUtils'

/** La clave del caché: la usan el hook y la precarga del menú. */
export const GRADE_CENTER_KEY = 'gradeCenter'

/**
 * Las calificaciones del grupo elegido (`v_grade_center`) con lo que el
 * profesor va guardando aplicado al instante.
 *
 * Al calificar no se vuelve a consultar: la celda ya sabe qué guardó, y
 * recargar la tabla mientras el profesor avanza con Tab le quitaría el foco.
 * El cambio se escribe en el caché compartido, así que Calificar y el Centro
 * de calificaciones lo ven igual y al volver no hay nada viejo.
 */
export function useGradeEntries(filters: PanelFilters) {
  const { data, loading, error, isConnected, mutate } = useRepositoryQuery(
    () => repository.getGradeCenter(filters),
    [] as GradeEntry[],
    [filters],
    GRADE_CENTER_KEY,
  )

  /** `score: null` quita la calificación. Lanza si la base no la guardó. */
  const save = useCallback(
    async (entry: GradeEntry, score: number | null, comment: string | null) => {
      const cleanComment = score === null ? null : comment?.trim() || null
      await repository.setGrade(
        entry.studentId,
        entry.groupId,
        entry.weekNumber,
        score,
        cleanComment,
      )
      const key = entryKey(entry.studentId, entry.weekNumber)
      mutate((current) =>
        current.map((item) =>
          entryKey(item.studentId, item.weekNumber) === key
            ? {
                ...item,
                score,
                comment: cleanComment,
                state: stateOf(score, item.submissionId),
              }
            : item,
        ),
      )
    },
    [mutate],
  )

  return { entries: data, loading, error, isConnected, save }
}
