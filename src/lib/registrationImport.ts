import type { StudentRegistrationInput } from '../data/types'

/** Encabezados de la plantilla, en el orden en que el profesor llena el Excel. */
export const TEMPLATE_HEADERS = ['Correo UDEM', 'Matrícula', 'Periodo', 'Frecuencia', 'Idioma']

/** Una fila leída del Excel, con su número de fila en la hoja y el problema si lo hay. */
export interface ParsedRegistrationRow {
  /** Número de fila en el Excel (la 1 es el encabezado). */
  sheetRow: number
  input: StudentRegistrationInput
  error: string | null
}

const UDEM_EMAIL = /^[^@\s]+@([a-z0-9-]+\.)*udem\.edu(\.mx)?$/i

function plain(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

/**
 * Valida una fila igual que `admin_register_students()` (`0031`). Es solo
 * retroalimentación temprana: la función de la base es la autoridad.
 */
export function validateRegistration(input: StudentRegistrationInput): string | null {
  if (!UDEM_EMAIL.test(input.email.trim())) return 'Correo institucional inválido'
  if (!/^[A-Za-z0-9]+$/.test(input.studentNumber.trim())) return 'Matrícula inválida'
  if (!/^[A-Za-z]{2}-[0-9]{2}$/.test(input.periodCode.trim())) return 'Periodo inválido (formato PR-26)'
  if (!['lunes', 'miercoles'].includes(plain(input.sessionDay))) return 'Frecuencia inválida (lunes o miércoles)'
  if (!['es', 'espanol', 'en', 'ingles', 'english'].includes(plain(input.language))) {
    return 'Idioma inválido (español o inglés)'
  }
  return null
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

/** Lee la primera hoja de un .xlsx con el orden de la plantilla. */
export async function parseRegistrationFile(file: File): Promise<ParsedRegistrationRow[]> {
  // Importación dinámica: la librería pesa y solo hace falta al subir un archivo.
  const { readSheet } = await import('read-excel-file/browser')
  const rows = await readSheet(file)

  const parsed: ParsedRegistrationRow[] = []
  rows.forEach((cells, index) => {
    const texts = cells.map(cellText)
    if (texts.every((text) => text === '')) return

    // La primera fila es el encabezado si su primera celda no es un correo.
    if (index === 0 && !texts[0].includes('@')) return

    const input: StudentRegistrationInput = {
      email: texts[0] ?? '',
      studentNumber: texts[1] ?? '',
      periodCode: texts[2] ?? '',
      sessionDay: texts[3] ?? '',
      language: texts[4] ?? '',
    }
    parsed.push({ sheetRow: index + 1, input, error: validateRegistration(input) })
  })
  return parsed
}

/** Descarga la plantilla: hoja vacía con encabezados y otra con las reglas. */
export async function downloadRegistrationTemplate(): Promise<void> {
  const { default: writeXlsxFile } = await import('write-excel-file/browser')

  const header = TEMPLATE_HEADERS.map((value) => ({ value, fontWeight: 'bold' as const }))
  const columns = [{ width: 34 }, { width: 14 }, { width: 12 }, { width: 14 }, { width: 12 }]

  // La fila de ejemplo va en otra hoja a propósito: si estuviera en la hoja de
  // datos, un alumno ficticio se registraría con solo subir la plantilla.
  const instructions = [
    [{ value: 'Columna', fontWeight: 'bold' as const }, { value: 'Qué poner', fontWeight: 'bold' as const }],
    ['Correo UDEM', 'Correo institucional, p. ej. alumno.ejemplo@udem.edu'],
    ['Matrícula', 'Solo letras y números. Es la contraseña inicial del alumno'],
    ['Periodo', 'Dos letras, guion y dos dígitos, p. ej. PR-26'],
    ['Frecuencia', 'Lunes o Miércoles'],
    ['Idioma', 'Español o Inglés'],
    ['', ''],
    ['Llena la hoja «Alumnos» desde la fila 2. Las filas vacías se ignoran.', ''],
  ]

  await writeXlsxFile([
    { data: [header], sheet: 'Alumnos', columns },
    { data: instructions, sheet: 'Instrucciones', columns: [{ width: 20 }, { width: 60 }] },
  ]).toFile('plantilla-alumnos.xlsx')
}
