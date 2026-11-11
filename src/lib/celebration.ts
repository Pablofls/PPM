/** Cómo se celebra una entrega: lluvia de temporada si llegó a tiempo, sello si fue tardía. */
export type CelebrationKind = 'on_time' | 'late'

export const celebrationKind = (late: boolean): CelebrationKind => (late ? 'late' : 'on_time')

/**
 * Qué cae en la lluvia de una entrega a tiempo, según el mes (hora local):
 * hojas en octubre y noviembre, copos de diciembre a febrero, confeti el resto.
 */
export type CelebrationTheme = 'confetti' | 'leaves' | 'snow'

export const celebrationTheme = (date: Date = new Date()): CelebrationTheme => {
  const month = date.getMonth() // 0 = enero
  if (month === 9 || month === 10) return 'leaves'
  if (month === 11 || month === 0 || month === 1) return 'snow'
  return 'confetti'
}
