import type { GradeEntry, GradeState } from '../../data/types'

// El portal del alumno también los usa: viven en `lib/grades.ts`.
export { computeTotal, formatPoints } from '../../lib/grades'

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

/** Respuestas más cortas no se comparan: «ninguna» o «0» se repiten con razón. */
const MIN_COMPARE_LENGTH = 15

/** Desde aquí se marca una respuesta (ámbar)… */
export const SIMILARITY_NOTICE = 40
/** …y desde aquí se considera copia probable (rojo). */
export const SIMILARITY_HIGH = 70

/**
 * Palabras que aparecen en cualquier respuesta en español y no dicen nada de
 * si se copió: sin quitarlas, dos textos distintos sobre el mismo tema salen
 * parecidos.
 */
const STOPWORDS = new Set(
  (
    'a al algo ante como con de del e el en entre era es esa ese eso esta este esto fue ' +
    'ha han hay la las le les lo los mas me mi mis muy no nos o para pero por que se ' +
    'si sin sobre su sus tambien te tu un una uno unos unas y ya yo the and of to in'
  ).split(' '),
)

/**
 * Las palabras de una respuesta, sueltas y en pares consecutivos («envié
 * solicitudes», «solicitudes empresas»), contadas. Los pares captan el orden:
 * dos alumnos que hablan de lo mismo comparten palabras sueltas, pero solo
 * quien copió comparte las frases. Las sueltas perdonan el retoque de una
 * palabra («3» por «tres»), que rompe dos pares.
 */
function shingles(text: string): { words: Map<string, number>; pairs: Map<string, number> } | null {
  const normalized = normalizeAnswer(text)
  if (normalized.length < MIN_COMPARE_LENGTH) return null
  const words = normalized
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((word) => word && !STOPWORDS.has(word))
  if (words.length === 0) return null
  return {
    words: count(words),
    pairs: count(words.slice(1).map((word, index) => `${words[index]} ${word}`)),
  }
}

function count(items: string[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const item of items) counts.set(item, (counts.get(item) ?? 0) + 1)
  return counts
}

/** Coeficiente de Sørensen–Dice entre dos conjuntos contados, de 0 a 100. */
function dice(a: Map<string, number>, b: Map<string, number>): number {
  let shared = 0
  let sizeA = 0
  let sizeB = 0
  for (const count of a.values()) sizeA += count
  for (const count of b.values()) sizeB += count
  for (const [gram, count] of a) shared += Math.min(count, b.get(gram) ?? 0)
  return sizeA + sizeB === 0 ? 0 : (200 * shared) / (sizeA + sizeB)
}

/** Qué tan parecidas son dos respuestas, de 0 a 100; `null` si alguna es muy corta. */
export function similarity(a: unknown, b: unknown): number | null {
  if (typeof a !== 'string' || typeof b !== 'string') return null
  if (normalizeAnswer(a) === normalizeAnswer(b) && normalizeAnswer(a).length >= MIN_COMPARE_LENGTH) {
    return 100
  }
  const gramsA = shingles(a)
  const gramsB = shingles(b)
  if (!gramsA || !gramsB) return null
  // Con menos de tres palabras casi no hay pares: solo cuentan las sueltas.
  if (gramsA.pairs.size < 2 || gramsB.pairs.size < 2) return dice(gramsA.words, gramsB.words)
  return (dice(gramsA.words, gramsB.words) + dice(gramsA.pairs, gramsB.pairs)) / 2
}

/** Con quién se parece: otra semana del mismo alumno, o un compañero. */
export type SimilaritySource =
  | { kind: 'semana'; week: number | null }
  | { kind: 'alumno'; studentId: string; name: string }

/** Un reporte contra el que se compara: sus respuestas por campo. */
export interface SimilarityCandidate {
  source: SimilaritySource
  answers: Record<string, unknown>
}

export interface SimilarityMatch {
  percent: number
  source: SimilaritySource
}

/**
 * Por campo, la respuesta más parecida entre los candidatos (solo si llega a
 * `SIMILARITY_NOTICE`).
 */
export function findSimilar(
  answers: Record<string, unknown>,
  candidates: SimilarityCandidate[],
  fields: string[],
): Map<string, SimilarityMatch> {
  const matches = new Map<string, SimilarityMatch>()
  for (const field of fields) {
    for (const candidate of candidates) {
      const percent = similarity(answers[field], candidate.answers[field])
      if (percent === null || percent < SIMILARITY_NOTICE) continue
      const best = matches.get(field)
      if (!best || percent > best.percent) matches.set(field, { percent, source: candidate.source })
    }
  }
  return matches
}

/**
 * Qué tan parecido es un reporte entero a otro: el promedio de sus campos,
 * pesado por lo largo de las respuestas (copiar el párrafo largo pesa más que
 * coincidir en una línea). `null` si no comparten ningún campo comparable.
 */
export function reportSimilarity(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
  fields: string[],
): number | null {
  let weighted = 0
  let weights = 0
  for (const field of fields) {
    const percent = similarity(a[field], b[field])
    if (percent === null) continue
    const weight = String(a[field]).length + String(b[field]).length
    weighted += percent * weight
    weights += weight
  }
  return weights === 0 ? null : weighted / weights
}

/** El candidato más parecido al reporte entero. */
export function mostSimilarReport(
  answers: Record<string, unknown>,
  candidates: SimilarityCandidate[],
  fields: string[],
): SimilarityMatch | null {
  let best: SimilarityMatch | null = null
  for (const candidate of candidates) {
    const percent = reportSimilarity(answers, candidate.answers, fields)
    if (percent === null) continue
    if (!best || percent > best.percent) best = { percent, source: candidate.source }
  }
  return best
}

export const formatPercent = (percent: number) => `${Math.round(percent)} %`

/** «sem. 3», «Ana López», «otra semana». */
export function sourceLabel(source: SimilaritySource): string {
  if (source.kind === 'alumno') return source.name
  return source.week === null ? 'otra semana' : `sem. ${source.week}`
}

/** «Idéntica a sem. 3», «82 % similar a Ana López». */
export function similarityLabel(match: SimilarityMatch): string {
  if (Math.round(match.percent) >= 100) return `Idéntica a ${sourceLabel(match.source)}`
  return `${formatPercent(match.percent)} similar a ${sourceLabel(match.source)}`
}
