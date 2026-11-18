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
import { allFields, displayAnswer, pick, type PortalFormMeta, type PortalValues } from './portalForms'

/** Una fila de la tabla: pregunta y respuesta, o el título de un bloque. */
export type QaRow = { label: string; value: string } | { heading: string }

/**
 * El PDF de un formulario del portal: título, recuadro con nombre, matrícula y
 * fecha y hora de descarga, y una tabla Pregunta / Respuesta. Hoja vertical.
 * Lo usan el 1.0 (`demographicsPdf.ts`) y 1.1–1.5.
 */
export async function downloadQaPdf({
  title,
  rows,
  student,
  lang = 'es',
}: {
  title: string
  rows: QaRow[]
  student: { fullName: string | null; studentNumber: string | null }
  lang?: Lang
}): Promise<void> {
  const t = translator(lang)
  const downloadedAt = new Date()
  const { jsPDF, autoTable } = await loadPdf()

  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = 48

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text(pdfText(title.toUpperCase()), pageWidth / 2, margin + 10, { align: 'center' })

  autoTable(doc, {
    startY: margin + 28,
    margin: { left: margin, right: margin },
    theme: 'plain',
    body: [
      [
        `${t('Nombre de estudiante', 'Student name')}: ${pdfText(student.fullName) || '—'}`,
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
    body: rows.map((row) =>
      'heading' in row
        ? [{ content: pdfText(row.heading), colSpan: 2, styles: { fillColor: PDF_HEADER_FILL, fontStyle: 'bold' as const } }]
        : [pdfText(row.label), pdfText(row.value) || '—'],
    ),
    showHead: 'everyPage',
    rowPageBreak: 'avoid',
    styles: {
      font: 'helvetica',
      fontSize: 10,
      cellPadding: 6,
      valign: 'top',
      overflow: 'linebreak',
      ...PDF_LINE_STYLES,
    },
    headStyles: { fontStyle: 'bold', fillColor: PDF_HEADER_FILL, ...PDF_LINE_STYLES },
    columnStyles: { 0: { cellWidth: (pageWidth - margin * 2) * 0.4, fontStyle: 'bold' } },
  })

  addFooter(doc, downloadedAt, lang, margin)
  doc.save(pdfFileName([title, student.fullName, student.studentNumber]))
}

/** Las preguntas de un formulario 1.1–1.5 con lo contestado, por bloque. */
export function portalFormRows(form: PortalFormMeta, values: PortalValues, lang: Lang): QaRow[] {
  const rows: QaRow[] = []
  for (const section of form.sections) {
    if (section.title) rows.push({ heading: pick(section.title, lang) })
    for (const field of section.fields) {
      rows.push({ label: pick(field.label, lang), value: displayAnswer(field, values[field.key], lang) })
    }
  }
  return rows
}

/** «1.1 Intereses Profesionales - Nombre - Matrícula.pdf» */
export async function downloadPortalFormPdf({
  form,
  values,
  student,
  lang = 'es',
}: {
  form: PortalFormMeta
  values: PortalValues
  student: { fullName: string | null; studentNumber: string | null }
  lang?: Lang
}): Promise<void> {
  await downloadQaPdf({
    title: `${form.label} ${pick(form.name, lang)}`,
    rows: portalFormRows(form, values, lang),
    student,
    lang,
  })
}

/** Para Calificar: las respuestas sin títulos de bloque. */
export function portalAnswerLines(form: PortalFormMeta, values: PortalValues, lang: Lang = 'es') {
  return allFields(form).map((field) => ({
    label: pick(field.label, lang),
    value: displayAnswer(field, values[field.key], lang),
  }))
}
