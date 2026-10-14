import type { GradeEntry, GradeState } from '../../data/types'

/** `4` → `4`, `4.5` → `4.5`, `4.50` → `4.5`: sin ceros de relleno. */
export function formatPoints(value: number | null): string {
  if (value === null) return ''
  return new Intl.NumberFormat('es-MX', { maximumFractionDigits: 2 }).format(value)
}

/** Lo que escribió el profesor → número, o `null` si lo dejó vacío. `NaN` si no es válido. */
export function parseScore(text: string): number | null {
  const clean = text.trim().replace(',', '.')
  if (clean === '') return null
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return Number.NaN
  return Number(clean)
}

export function stateOf(score: number | null, submissionId: string | null): GradeState {
  if (score !== null) return 'calificado'
  return submissionId ? 'por_calificar' : 'sin_entrega'
}

export const entryKey = (studentId: string, weekNumber: number) => `${studentId}|${weekNumber}`

/**
 * El total del alumno, como el Total de Blackboard: solo cuentan las
 * actividades ya calificadas, así que lo que aún no se califica no baja el
 * porcentaje. `null` mientras no tenga ninguna calificada.
 */
export function computeTotal(entries: GradeEntry[]): {
  earned: number
  possible: number
  percentage: number
} | null {
  const graded = entries.filter((entry) => entry.score !== null)
  if (graded.length === 0) return null
  const earned = graded.reduce((sum, entry) => sum + (entry.score ?? 0), 0)
  const possible = graded.reduce((sum, entry) => sum + entry.pointsPossible, 0)
  return { earned, possible, percentage: (earned / possible) * 100 }
}

export const studentLabel = (entry: Pick<GradeEntry, 'fullName' | 'institutionalEmail'>) =>
  entry.fullName ?? entry.institutionalEmail
