import { useState } from 'react'

import { useT } from '../lib/i18n'

/**
 * «Descargar PDF» de las actividades del portal. Cada formulario pasa su
 * generador (`src/lib/*Pdf.ts`); no escribe nada, así que también funciona en
 * «Ver como Alumno».
 */
export function DownloadPdfButton({
  onDownload,
  disabled,
  onError,
}: {
  onDownload: () => Promise<void>
  disabled: boolean
  onError: (message: string) => void
}) {
  const [generating, setGenerating] = useState(false)
  const t = useT()

  async function download() {
    setGenerating(true)
    try {
      await onDownload()
    } catch {
      onError(t('No se pudo generar el PDF. Intenta de nuevo.', 'The PDF could not be created. Try again.'))
    } finally {
      setGenerating(false)
    }
  }

  return (
    <button
      type="button"
      onClick={download}
      disabled={disabled || generating}
      className="rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-sm font-medium text-ink-700 shadow-sm hover:bg-ink-100 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {generating ? t('Generando…', 'Generating…') : t('Descargar PDF', 'Download PDF')}
    </button>
  )
}
