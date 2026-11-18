import type { DemographicsEntry } from '../data/types'
import { DEMOGRAPHICS_FORM } from './catalog'
import { demographicsAnswers } from './formAnswers'
import type { Lang } from './i18n'
import {
  addFooter,
  downloadStamp,
  lastTableY,
  loadPdf,
  pdfFileName,
  pdfText,
  PDF_HEADER_FILL,
  PDF_LINE_STYLES,
  translator,
} from './pdf'

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
  const t = translator(lang)
  const downloadedAt = new Date()
  const { jsPDF, autoTable } = await loadPdf()

  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = 48
  const title = `1.0 ${lang === 'en' ? DEMOGRAPHICS_FORM.en.name : DEMOGRAPHICS_FORM.name}`
  const fullName = student.fullName ?? entry.fullName ?? null

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text(pdfText(title.toUpperCase()), pageWidth / 2, margin + 10, { align: 'center' })

  autoTable(doc, {
    startY: margin + 28,
    margin: { left: margin, right: margin },
    theme: 'plain',
    body: [
      [
        `${t('Nombre de estudiante', 'Student name')}: ${pdfText(fullName) || '—'}`,
        `${t('Matrícula', 'Student ID')}: ${pdfText(student.studentNumber) || '—'}`,
      ],
      [
        {
          content: `${t('Fecha y hora de descarga', 'Downloaded on')}: ${downloadStamp(downloadedAt, lang)}`,
          colSpan: 2,
        },
      ],
    ],
    styles: { font: 'helvetica', fontSize: 10, cellPadding: 4, ...PDF_LINE_STYLES },
    columnStyles: { 0: { cellWidth: (pageWidth - margin * 2) * 0.6 } },
  })

  autoTable(doc, {
    startY: lastTableY(doc) + 16,
    margin: { left: margin, right: margin, bottom: margin + 10 },
    theme: 'grid',
    head: [[t('Pregunta', 'Question'), t('Respuesta', 'Answer')]],
    body: demographicsAnswers(entry, lang).map((line) => [pdfText(line.label), pdfText(line.value) || '—']),
    styles: {
      font: 'helvetica',
      fontSize: 10,
      cellPadding: 6,
      valign: 'top',
      overflow: 'linebreak',
      ...PDF_LINE_STYLES,
    },
    headStyles: {
      fontStyle: 'bold',
      fillColor: PDF_HEADER_FILL,
      ...PDF_LINE_STYLES,
    },
    columnStyles: { 0: { cellWidth: (pageWidth - margin * 2) * 0.35, fontStyle: 'bold' } },
  })

  addFooter(doc, downloadedAt, lang, margin)
  doc.save(pdfFileName([title, fullName, student.studentNumber]))
}
