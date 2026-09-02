/** Formato de valores para la interfaz. Todo en español (regla 4 de CLAUDE.md). */

const DATE_FORMAT = new Intl.DateTimeFormat('es-MX', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

const DATE_TIME_FORMAT = new Intl.DateTimeFormat('es-MX', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

export function formatDate(value: string | null): string {
  if (!value) return ''
  return DATE_FORMAT.format(new Date(value))
}

export function formatDateTime(value: string | null): string {
  if (!value) return ''
  return DATE_TIME_FORMAT.format(new Date(value))
}

export function formatWeekRange(start: string | null, end: string | null): string {
  if (!start) return ''
  return end ? `${formatDate(start)} – ${formatDate(end)}` : formatDate(start)
}

/** `6` → `6to`. El Sheets guarda el ordinal; la BD, el número. */
export function formatSemester(value: number | null): string {
  if (value === null) return ''
  const suffixes: Record<number, string> = {
    1: '1ro',
    2: '2do',
    3: '3ro',
    4: '4to',
    5: '5to',
    6: '6to',
    7: '7mo',
    8: '8vo',
    9: '9no',
    10: '10mo',
  }
  return suffixes[value] ?? String(value)
}

export function formatSessionDay(value: string | null): string {
  if (!value) return ''
  return value === 'miercoles' ? 'Miércoles' : 'Lunes'
}

export function formatGender(value: string | null): string {
  if (!value) return ''
  const labels: Record<string, string> = {
    femenino: 'Femenino',
    masculino: 'Masculino',
    otro: 'Otro',
    no_especificado: 'No especificado',
  }
  return labels[value] ?? value
}

export function capitalize(value: string | null): string {
  if (!value) return ''
  return value.charAt(0).toUpperCase() + value.slice(1)
}

/**
 * Los alumnos capturan el enlace del reporte a mano y no siempre es una URL
 * válida. Solo se convierte en enlace lo que realmente lo es.
 */
export function toHref(value: string | null): string | null {
  if (!value) return null
  const trimmed = value.trim()
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(trimmed)) return `https://${trimmed}`
  return null
}
