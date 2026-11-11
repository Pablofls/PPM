import type { InternshipLogRow, JobSearchLogRow } from '../data/types'
import type { WeeklyFormMeta } from './catalog'
import { formatDate, formatWeekRange } from './format'
import type { Lang } from './i18n'

/** Lo que el encabezado del PDF dice del alumno. Sale de `StudentDossier`. */
export interface WeeklyLogPdfStudent {
  fullName: string | null
  studentNumber: string | null
  companyName: string | null
  department: string | null
}

const BLACK: [number, number, number] = [0, 0, 0]
const HEADER_FILL: [number, number, number] = [235, 235, 235]

/**
 * Descarga una bitácora semanal completa en PDF, con la forma del documento
 * que los alumnos llenaban a mano: hoja horizontal, título, recuadro con sus
 * datos y una fila por semana, la más reciente primero (como pedían las
 * indicaciones del original: «en el PRIMER RENGLÓN siempre la semana más
 * reciente»). `rows` ya llega en ese orden desde el repositorio.
 *
 * jsPDF se carga al hacer clic: pesa lo suyo y casi nadie descarga.
 */
export async function downloadWeeklyLogPdf({
  form,
  rows,
  student,
  lang = 'es',
}: {
  /** Ya traducido (`localizeWeeklyForm`): su `name` es el título. */
  form: WeeklyFormMeta
  rows: (JobSearchLogRow | InternshipLogRow)[]
  student: WeeklyLogPdfStudent
  /** El del portal: un grupo de Inglés descarga su bitácora en inglés. */
  lang?: Lang
}): Promise<void> {
  const t = (es: string, en: string) => (lang === 'en' ? en : es)
  const [{ jsPDF }, { autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ])

  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 36

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text(pdfText(form.name.toUpperCase()), pageWidth / 2, margin + 14, { align: 'center' })

  const isInternship = form.code === 'form_practicas'
  const lineStyles = { lineColor: BLACK, lineWidth: 0.6, textColor: BLACK }

  // Recuadro de datos del alumno.
  const identity: string[][] = [
    [
      `${t('Nombre de estudiante', 'Student name')}: ${pdfText(student.fullName) || '—'}`,
      `${t('Matrícula', 'Student ID')}: ${pdfText(student.studentNumber) || '—'}`,
    ],
  ]
  if (isInternship) {
    identity.push([`${t('Nombre de la empresa', 'Company name')}: ${pdfText(student.companyName) || '—'}`, ''])
    identity.push([`${t('Puesto', 'Position')}: ${pdfText(student.department) || '—'}`, ''])
  }

  autoTable(doc, {
    startY: margin + 30,
    margin: { left: margin, right: margin },
    theme: 'plain',
    body: identity.map(([left, right]) =>
      right
        ? [left, right]
        : [{ content: left, colSpan: 2 }],
    ),
    styles: { font: 'helvetica', fontSize: 10, cellPadding: 4, ...lineStyles },
    columnStyles: { 0: { cellWidth: (pageWidth - margin * 2) * 0.55 } },
  })

  const { head, body, columnWidths } = isInternship
    ? internshipTable(rows as InternshipLogRow[], t, lang)
    : jobSearchTable(rows as JobSearchLogRow[], t, lang)

  const tableWidth = pageWidth - margin * 2
  const previousY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY

  autoTable(doc, {
    startY: previousY + 16,
    margin: { left: margin, right: margin, bottom: margin + 10 },
    theme: 'grid',
    head: [head],
    body,
    showHead: 'everyPage',
    rowPageBreak: 'auto',
    styles: {
      font: 'helvetica',
      fontSize: 9,
      cellPadding: 5,
      valign: 'top',
      overflow: 'linebreak',
      ...lineStyles,
    },
    headStyles: {
      fontStyle: 'bold',
      halign: 'center',
      valign: 'middle',
      fillColor: HEADER_FILL,
      ...lineStyles,
    },
    columnStyles: Object.fromEntries(
      columnWidths.map((share, index) => [index, { cellWidth: tableWidth * share }]),
    ),
  })

  if (isInternship) {
    const total = (rows as InternshipLogRow[])[0]?.totalHours
    if (total !== null && total !== undefined) {
      const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(10)
      doc.text(`${t('Total de horas', 'Total hours')}: ${total}`, pageWidth - margin, finalY + 16, { align: 'right' })
    }
  }

  // Pie en todas las páginas, ya que se sabe cuántas son.
  const downloadedOn = formatDate(new Date().toISOString(), lang)
  const pages = doc.getNumberOfPages()
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(110)
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page)
    doc.text(`${t('Descargado el', 'Downloaded on')} ${downloadedOn}`, margin, pageHeight - margin / 2)
    doc.text(t(`Página ${page} de ${pages}`, `Page ${page} of ${pages}`), pageWidth - margin, pageHeight - margin / 2, {
      align: 'right',
    })
  }

  doc.save(fileName(form.name, student))
}

type Translate = (es: string, en: string) => string

function weekCell(row: JobSearchLogRow | InternshipLogRow, t: Translate, lang: Lang): string {
  const range = formatWeekRange(row.weekStart, row.weekEnd, lang)
  const label = row.weekNumber !== null ? `${t('Semana', 'Week')} ${row.weekNumber}` : ''
  return pdfText([label, range].filter(Boolean).join('\n')) || '—'
}

function internshipTable(rows: InternshipLogRow[], t: Translate, lang: Lang) {
  const worked = t('Horas trabajadas', 'Hours worked')
  const cumulative = t('Horas acumuladas', 'Cumulative hours')
  return {
    head: [
      t('Semana de trabajo', 'Work week'),
      t('Actividades realizadas', 'Activities performed'),
      `${worked}\n${cumulative}`,
      t('Habilidades y conocimientos aplicados', 'Skills and knowledge applied'),
      t('Propuesta de mejora a las actividades realizadas', 'Proposed improvements to the activities'),
    ],
    body: rows.map((row) => [
      weekCell(row, t, lang),
      cell(row.activities),
      `${worked}: ${row.hoursWorked ?? '—'}\n${cumulative}: ${row.cumulativeHours ?? '—'}`,
      cell(row.skillsPracticed),
      cell(row.proposal),
    ]),
    columnWidths: [0.12, 0.3, 0.13, 0.22, 0.23],
  }
}

function jobSearchTable(rows: JobSearchLogRow[], t: Translate, lang: Lang) {
  return {
    head: [
      t('Semana', 'Week'),
      t('Actividades', 'Activities'),
      t('Aplicaciones', 'Applications'),
      t('Entrevistas', 'Interviews'),
      t('Aprendizajes', 'Learnings'),
      t('Siguientes pasos', 'Next steps'),
    ],
    body: rows.map((row) => [
      weekCell(row, t, lang),
      cell(row.activities),
      cell(row.applications),
      cell(row.interviews),
      cell(row.learnings),
      cell(row.nextSteps),
    ]),
    columnWidths: [0.12, 0.18, 0.18, 0.18, 0.17, 0.17],
  }
}

function cell(value: string | null): string {
  return pdfText(value) || '—'
}

/**
 * La Helvetica de jsPDF solo trae Latin-1: los acentos y la ñ salen bien, pero
 * comillas tipográficas, guiones largos o emojis saldrían como basura. Se
 * pasan a su equivalente simple y lo que no tiene equivalente se quita.
 */
function pdfText(value: string | null): string {
  if (!value) return ''
  return value
    .normalize('NFC')
    .replace(/[‘’‚′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[–—−]/g, '-')
    .replace(/…/g, '...')
    .replace(/[•●▪]/g, '-')
    .replace(/[   ]/g, ' ')
    .replace(/\r\n?/g, '\n')
    .replace(/[^\n -~¡-ÿ]/g, '')
    .trim()
}

function fileName(reportName: string, student: WeeklyLogPdfStudent): string {
  const parts = [reportName, student.fullName, student.studentNumber]
    .map((part) => (part ?? '').replace(/[\\/:*?"<>|]/g, '').trim())
    .filter(Boolean)
  return `${parts.join(' - ')}.pdf`
}
