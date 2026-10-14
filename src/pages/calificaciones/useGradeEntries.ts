import { useCallback, useEffect, useMemo, useState } from 'react'

import { useRepositoryQuery } from '../../data/hooks'
import { repository } from '../../data/repository'
import type { GradeEntry, PanelFilters } from '../../data/types'
import { entryKey, stateOf } from './gradeUtils'

interface Edit {
  score: number | null
  comment: string | null
}

/**
 * Las calificaciones del grupo elegido (`v_grade_center`) con lo que el
 * profesor va guardando aplicado al instante.
 *
 * Al calificar no se vuelve a consultar: la celda ya sabe qué guardó, y
 * recargar la tabla mientras el profesor avanza con Tab le quitaría el foco.
 * Las ediciones se descartan en cuanto llegan datos nuevos de la base.
 */
export function useGradeEntries(filters: PanelFilters) {
  const { data, loading, error, isConnected } = useRepositoryQuery(
    () => repository.getGradeCenter(filters),
    [] as GradeEntry[],
    [filters],
  )
  const [edits, setEdits] = useState<Record<string, Edit>>({})

  useEffect(() => {
    setEdits({})
  }, [data])

  const entries = useMemo(
    () =>
      data.map((entry) => {
        const edit = edits[entryKey(entry.studentId, entry.weekNumber)]
        if (!edit) return entry
        return {
          ...entry,
          score: edit.score,
          comment: edit.comment,
          state: stateOf(edit.score, entry.submissionId),
        }
      }),
    [data, edits],
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
      setEdits((current) => ({
        ...current,
        [entryKey(entry.studentId, entry.weekNumber)]: { score, comment: cleanComment },
      }))
    },
    [],
  )

  return { entries, loading, error, isConnected, save }
}
