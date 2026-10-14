/** Cómo se celebra una entrega: confeti si llegó a tiempo, sello si fue tardía. */
export type CelebrationKind = 'on_time' | 'late'

export const celebrationKind = (late: boolean): CelebrationKind => (late ? 'late' : 'on_time')
