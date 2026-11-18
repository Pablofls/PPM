import type { jsPDF } from 'jspdf'

import { formatDateTime } from './format'
import type { Lang } from './i18n'

/**
 * Lo común de los PDF que descarga el alumno: cargar jsPDF, limpiar el texto,
 * el sello de fecha y hora de descarga y el pie de página. Cada formulario
 * arma su contenido (`weeklyLogPdf.ts`, `demographicsPdf.ts`); el siguiente
 * que se pase a la plataforma usa lo mismo.
 */

export type Translate = (es: string, en: string) => string

export const translator =
  (lang: Lang): Translate =>
  (es, en) =>
    lang === 'en' ? en : es

export const PDF_BLACK: [number, number, number] = [0, 0, 0]
export const PDF_HEADER_FILL: [number, number, number] = [235, 235, 235]
export const PDF_LINE_STYLES = { lineColor: PDF_BLACK, lineWidth: 0.6, textColor: PDF_BLACK }

/** jsPDF se carga al hacer clic: pesa lo suyo y casi nadie descarga. */
export async function loadPdf() {
  const [{ jsPDF }, { autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ])
  return { jsPDF, autoTable }
}

/** «17/11/2026, 14:32»: fecha y hora en que se descargó. */
export function downloadStamp(downloadedAt: Date, lang: Lang): string {
  return formatDateTime(downloadedAt.toISOString(), lang)
}

/** Dónde terminó la última tabla de jspdf-autotable. */
export function lastTableY(doc: jsPDF): number {
  return (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY
}

/** Pie en todas las páginas: cuándo se descargó y «Página x de y». */
export function addFooter(doc: jsPDF, downloadedAt: Date, lang: Lang, margin: number): void {
  const t = translator(lang)
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const stamp = downloadStamp(downloadedAt, lang)
  const pages = doc.getNumberOfPages()
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(110)
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page)
    doc.text(`${t('Descargado el', 'Downloaded on')} ${stamp}`, margin, pageHeight - margin / 2)
    doc.text(t(`Página ${page} de ${pages}`, `Page ${page} of ${pages}`), pageWidth - margin, pageHeight - margin / 2, {
      align: 'right',
    })
  }
}

/**
 * La Helvetica de jsPDF solo trae Latin-1: los acentos y la ñ salen bien, pero
 * comillas tipográficas, guiones largos o emojis saldrían como basura. Se
 * pasan a su equivalente simple y lo que no tiene equivalente se quita.
 */
export function pdfText(value: string | null | undefined): string {
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

/** «Bitácora - Ana López - 123456.pdf», sin caracteres que el sistema rechace. */
export function pdfFileName(parts: (string | null | undefined)[]): string {
  const clean = parts
    .map((part) => (part ?? '').replace(/[\\/:*?"<>|]/g, '').trim())
    .filter(Boolean)
  return `${clean.join(' - ')}.pdf`
}
