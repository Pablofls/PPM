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

/**
 * Para comparar respuestas entre semanas: sin mayúsculas, acentos, espacios de
 * más ni puntuación al final. Así «Busqué vacantes.» y «busque vacantes» son
 * la misma respuesta.
 */
export function normalizeAnswer(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[\s.,;:!?¡¿…-]+$/u, '')
    .trim()
}

/** Respuestas más cortas no cuentan: «ninguna» o «0» se repiten con razón. */
const MIN_REPEAT_LENGTH = 15

type LogLike = { submissionId: string; weekNumber: number | null }

/**
 * Qué respuestas son iguales a las de otra semana del mismo alumno, campo por
 * campo. La llave es `submissionId|campo` y el valor, las otras semanas con
 * la misma respuesta (`null` si la semana no se pudo clasificar).
 */
export function findRepeats<T extends LogLike>(
  rows: T[],
  fields: string[],
): Map<string, (number | null)[]> {
  const repeats = new Map<string, (number | null)[]>()
  for (const field of fields) {
    const byText = new Map<string, T[]>()
    for (const row of rows) {
      const value = (row as unknown as Record<string, unknown>)[field]
      if (typeof value !== 'string') continue
      const text = normalizeAnswer(value)
      if (text.length < MIN_REPEAT_LENGTH) continue
      byText.set(text, [...(byText.get(text) ?? []), row])
    }
    for (const group of byText.values()) {
      if (group.length < 2) continue
      for (const row of group) {
        const others = group
          .filter((other) => other !== row)
          .map((other) => other.weekNumber)
          .sort((a, b) => (a ?? 0) - (b ?? 0))
        repeats.set(`${row.submissionId}|${field}`, others)
      }
    }
  }
  return repeats
}

/** `[3, 5]` → «Igual a sem. 3, 5». */
export function repeatLabel(weeks: (number | null)[]): string {
  const known = weeks.filter((week): week is number => week !== null)
  if (known.length === 0) return 'Igual a otra semana'
  return `Igual a sem. ${known.join(', ')}`
}
