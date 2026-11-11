import type { InternshipLogRow, JobSearchLogRow } from '../data/types'
import type { WeeklyFormMeta } from './catalog'
import { formatDate, formatWeekRange } from './format'

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
}: {
  form: WeeklyFormMeta
  rows: (JobSearchLogRow | InternshipLogRow)[]
  student: WeeklyLogPdfStudent
}): Promise<void> {
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
      `Nombre de estudiante: ${pdfText(student.fullName) || '—'}`,
      `Matrícula: ${pdfText(student.studentNumber) || '—'}`,
    ],
  ]
  if (isInternship) {
    identity.push([`Nombre de la empresa: ${pdfText(student.companyName) || '—'}`, ''])
    identity.push([`Puesto: ${pdfText(student.department) || '—'}`, ''])
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
    ? internshipTable(rows as InternshipLogRow[])
    : jobSearchTable(rows as JobSearchLogRow[])

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
      doc.text(`Total de horas: ${total}`, pageWidth - margin, finalY + 16, { align: 'right' })
    }
  }

  // Pie en todas las páginas, ya que se sabe cuántas son.
  const downloadedOn = formatDate(new Date().toISOString())
  const pages = doc.getNumberOfPages()
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(110)
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page)
    doc.text(`Descargado el ${downloadedOn}`, margin, pageHeight - margin / 2)
    doc.text(`Página ${page} de ${pages}`, pageWidth - margin, pageHeight - margin / 2, {
      align: 'right',
    })
  }

  doc.save(fileName(form.name, student))
}

function weekCell(row: JobSearchLogRow | InternshipLogRow): string {
  const range = formatWeekRange(row.weekStart, row.weekEnd)
  const label = row.weekNumber !== null ? `Semana ${row.weekNumber}` : ''
  return pdfText([label, range].filter(Boolean).join('\n')) || '—'
}

function internshipTable(rows: InternshipLogRow[]) {
  return {
    head: [
      'Semana de trabajo',
      'Actividades realizadas',
      'Horas trabajadas\nHoras acumuladas',
      'Habilidades y conocimientos aplicados',
      'Propuesta de mejora a las actividades realizadas',
    ],
    body: rows.map((row) => [
      weekCell(row),
      cell(row.activities),
      `Horas trabajadas: ${row.hoursWorked ?? '—'}\nHoras acumuladas: ${row.cumulativeHours ?? '—'}`,
      cell(row.skillsPracticed),
      cell(row.proposal),
    ]),
    columnWidths: [0.12, 0.3, 0.13, 0.22, 0.23],
  }
}

function jobSearchTable(rows: JobSearchLogRow[]) {
  return {
    head: ['Semana', 'Actividades', 'Aplicaciones', 'Entrevistas', 'Aprendizajes', 'Siguientes pasos'],
    body: rows.map((row) => [
      weekCell(row),
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
