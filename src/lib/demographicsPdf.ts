import type { DemographicsEntry } from '../data/types'
import { DEMOGRAPHICS_FORM } from './catalog'
import { demographicsAnswers } from './formAnswers'
import type { Lang } from './i18n'
import { downloadQaPdf } from './formPdf'

/**
 * Descarga el 1.0 Datos Demográficos del alumno en PDF: título, recuadro con
 * su nombre, matrícula y la fecha y hora de descarga, y una tabla Pregunta /
 * Respuesta con su entrega más reciente. Hoja vertical: son pocas preguntas.
 */
export async function downloadDemographicsPdf({
  entry,
  student,
  lang = 'es',
}: {
  /** La entrega que se descarga (la más reciente). */
  entry: DemographicsEntry
  /** Del registro: el nombre puede no estar en la entrega si vino del Sheets. */
  student: { fullName: string | null; studentNumber: string | null }
  lang?: Lang
}): Promise<void> {
  const title = `1.0 ${lang === 'en' ? DEMOGRAPHICS_FORM.en.name : DEMOGRAPHICS_FORM.name}`
  await downloadQaPdf({
    title,
    rows: demographicsAnswers(entry, lang),
    student: { fullName: student.fullName ?? entry.fullName ?? null, studentNumber: student.studentNumber },
    lang,
  })
}
