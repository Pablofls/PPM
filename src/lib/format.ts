import { localeOf, type Lang } from './i18n'

/**
 * Formato de valores para la interfaz. En español (regla «Nomenclatura» de
 * CLAUDE.md); el portal de un alumno de un grupo de Inglés pasa `lang = 'en'`
 * (ver `src/lib/i18n.ts`). Sin `lang`, español: el panel del profesor no
 * cambia.
 */

const DATE_FORMAT: Record<Lang, Intl.DateTimeFormat> = {
  es: new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' }),
  en: new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
}

const DATE_TIME_FORMAT: Record<Lang, Intl.DateTimeFormat> = {
  es: new Intl.DateTimeFormat('es-MX', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }),
  en: new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }),
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

/**
 * `new Date('2026-08-03')` la interpreta como medianoche UTC; en un huso
 * negativo (México) eso cae en el día anterior al formatear en hora local.
 * Las columnas `date` de Postgres (semanas del semestre, fechas límite,
 * fecha de nacimiento) no traen hora: se arma la fecha en horario local para
 * que el día no se recorra.
 */
export function formatDate(value: string | null, lang: Lang = 'es'): string {
  if (!value) return ''
  if (DATE_ONLY.test(value)) {
    const [year, month, day] = value.split('-').map(Number)
    return DATE_FORMAT[lang].format(new Date(year, month - 1, day))
  }
  return DATE_FORMAT[lang].format(new Date(value))
}

export function formatDateTime(value: string | null, lang: Lang = 'es'): string {
  if (!value) return ''
  return DATE_TIME_FORMAT[lang].format(new Date(value))
}

/**
 * `2026-09-18T20:03:00Z` → `hace 12 minutos`.
 *
 * Se elige la unidad más grande que siga siendo legible: nadie lee «hace 184
 * minutos», pero «hace 3 horas» se entiende de un vistazo.
 */
export function formatRelativeTime(value: string | null, lang: Lang = 'es'): string {
  if (!value) return ''
  const relative = new Intl.RelativeTimeFormat(localeOf(lang), { numeric: 'auto' })

  const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60_000)
  if (minutes < 1) return lang === 'en' ? 'just now' : 'hace un momento'
  if (minutes < 60) return relative.format(-minutes, 'minute')

  const hours = Math.round(minutes / 60)
  if (hours < 24) return relative.format(-hours, 'hour')

  return relative.format(-Math.round(hours / 24), 'day')
}

export function formatWeekRange(start: string | null, end: string | null, lang: Lang = 'es'): string {
  if (!start) return ''
  return end ? `${formatDate(start, lang)} – ${formatDate(end, lang)}` : formatDate(start, lang)
}

/** `6` → `6to`. El Sheets guarda el ordinal; la BD, el número. */
export function formatSemester(value: number | null, lang: Lang = 'es'): string {
  if (value === null) return ''
  if (lang === 'en') {
    const suffix = value % 10 === 1 && value !== 11 ? 'st' : value % 10 === 2 && value !== 12 ? 'nd' : value % 10 === 3 && value !== 13 ? 'rd' : 'th'
    return `${value}${suffix}`
  }
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

const SESSION_DAY_LABELS: Record<string, string> = {
  lunes: 'Lunes',
  martes: 'Martes',
  miercoles: 'Miércoles',
  jueves: 'Jueves',
  viernes: 'Viernes',
}

const SESSION_DAY_LABELS_EN: Record<string, string> = {
  lunes: 'Monday',
  martes: 'Tuesday',
  miercoles: 'Wednesday',
  jueves: 'Thursday',
  viernes: 'Friday',
}

export function formatSessionDay(value: string | null, lang: Lang = 'es'): string {
  if (!value) return ''
  return (lang === 'en' ? SESSION_DAY_LABELS_EN : SESSION_DAY_LABELS)[value] ?? value
}

export function formatGender(value: string | null, lang: Lang = 'es'): string {
  if (!value) return ''
  const labels: Record<string, string> =
    lang === 'en'
      ? { femenino: 'Female', masculino: 'Male', otro: 'Other', no_especificado: 'Not specified' }
      : {
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

export function formatLanguage(value: string | null, lang: Lang = 'es'): string {
  if (!value) return ''
  if (lang === 'en') return value === 'en' ? 'English' : 'Spanish'
  return value === 'en' ? 'Inglés' : 'Español'
}

/**
 * `OT-26 · Lunes · Español`. El nombre de un grupo no se guarda en la base
 * (`0032`): se arma siempre de sus tres columnas, así que nunca se desfasa.
 */
export function formatGroupLabel(
  group: {
    periodCode: string
    sessionDay: string
    language: string
  },
  lang: Lang = 'es',
): string {
  return `${group.periodCode} · ${formatSessionDay(group.sessionDay, lang)} · ${formatLanguage(group.language, lang)}`
}
