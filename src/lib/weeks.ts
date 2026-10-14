import type { WeeklyLogStatusCell } from '../data/types'

/** `YYYY-MM-DD` en Monterrey, igual que `today_monterrey()` en la base (`0030`). */
export function todayMonterrey(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Monterrey' }).format(new Date())
}

/**
 * La semana que le toca entregar al alumno (`next_weekly_week_number()`,
 * `0043`): la más antigua ya iniciada y sin entrega; si no debe ninguna, la
 * semana en curso. `undefined` si hoy cae fuera de todas las semanas.
 *
 * `late` es verdadero cuando esa semana ya cerró: entregarla será entrega
 * tardía. `pendingAfter` cuenta las semanas ya iniciadas que quedan por
 * entregar después de esta.
 */
export function targetWeek(cells: WeeklyLogStatusCell[]):
  | { cell: WeeklyLogStatusCell; late: boolean; pendingAfter: number }
  | undefined {
  const hoy = todayMonterrey()
  const started = cells.filter((cell) => cell.weekStart <= hoy)
  const pending = started.filter((cell) => !cell.submittedAt)

  if (pending.length) {
    const cell = pending[0]
    return { cell, late: cell.weekEnd < hoy, pendingAfter: pending.length - 1 }
  }

  const current = cells.find((cell) => cell.weekStart <= hoy && hoy <= cell.weekEnd)
  return current ? { cell: current, late: false, pendingAfter: 0 } : undefined
}
