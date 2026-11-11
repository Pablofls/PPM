import type { GradeEntry } from '../data/types'
import { localeOf, type Lang } from './i18n'

/** `4` → `4`, `4.5` → `4.5`, `4.50` → `4.5`: sin ceros de relleno. */
export function formatPoints(value: number | null, lang: Lang = 'es'): string {
  if (value === null) return ''
  return new Intl.NumberFormat(localeOf(lang), { maximumFractionDigits: 2 }).format(value)
}

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
