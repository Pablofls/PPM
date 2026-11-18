import type { DemographicsInput } from '../data/types'
import { DEMOGRAPHICS_FORM } from './catalog'
import { formatDate, formatGender, formatSemester } from './format'
import type { Lang } from './i18n'

/** Una pregunta del formulario con lo que contestó el alumno, ya legible. */
export interface AnswerLine {
  label: string
  value: string
}

/**
 * Las respuestas del 1.0 en el orden del formulario, con sus etiquetas. Lo
 * usan Calificar (para leerlas) y el PDF que descarga el alumno, así ambos
 * dicen lo mismo.
 */
export function demographicsAnswers(values: Partial<DemographicsInput>, lang: Lang = 'es'): AnswerLine[] {
  return DEMOGRAPHICS_FORM.fields.map((field) => {
    const raw = values[field.key]
    let value: string
    if (raw === undefined || raw === null || raw === '') value = ''
    else if (field.key === 'birthDate') value = formatDate(String(raw), lang)
    else if (field.key === 'gender') value = formatGender(String(raw), lang)
    else if (field.key === 'semester') value = formatSemester(Number(raw), lang)
    else value = String(raw)
    return { label: lang === 'en' ? field.en.label : field.label, value }
  })
}
