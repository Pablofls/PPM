import { useEffect, useState } from 'react'

/**
 * Aviso flotante y efímero.
 *
 * Existe para confirmar algo que pasó en otra pantalla: el alumno entrega su
 * bitácora y aterriza en su lista de tareas, donde el formulario que acaba de
 * llenar ya no está. Sin el aviso, la entrega se sentiría como si se hubiera
 * perdido.
 *
 * Va fijo abajo y no dentro del flujo de la página a propósito: no tiene que
 * empujar el contenido ni depender de dónde quedó el scroll.
 */
export function Toast({
  message,
  onDismiss,
  duration = 6000,
  tone = 'success',
}: {
  message: string
  onDismiss: () => void
  duration?: number
  /** `error` reusa la paleta roja que ya usan los formularios del panel. */
  tone?: 'success' | 'error'
}) {
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    // Dos tiempos: primero se desvanece, luego se desmonta. Sin esto el aviso
    // desaparecería de golpe.
    const fade = setTimeout(() => setLeaving(true), duration)
    const remove = setTimeout(onDismiss, duration + 300)
    return () => {
      clearTimeout(fade)
      clearTimeout(remove)
    }
  }, [duration, onDismiss])

  const palette =
    tone === 'error'
      ? { border: 'border-red-200', bg: 'bg-red-50', text: 'text-red-800', button: 'text-red-700 hover:bg-red-100 hover:text-red-900' }
      : { border: 'border-emerald-200', bg: 'bg-emerald-50', text: 'text-emerald-900', button: 'text-emerald-700 hover:bg-emerald-100 hover:text-emerald-900' }

  return (
    <div
      // `alert` en el error interrumpe al lector de pantalla a propósito: una
      // corrida fallida es justo el caso donde no basta con no molestar.
      role={tone === 'error' ? 'alert' : 'status'}
      aria-live={tone === 'error' ? 'assertive' : 'polite'}
      className={`fixed inset-x-4 bottom-6 z-50 mx-auto flex max-w-md items-start gap-3 rounded-xl border ${palette.border} ${palette.bg} px-5 py-4 shadow-lg transition-opacity duration-300 ${
        leaving ? 'opacity-0' : 'opacity-100'
      }`}
    >
      <p className={`min-w-0 flex-1 text-sm ${palette.text}`}>{message}</p>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Cerrar aviso"
        className={`shrink-0 rounded-md px-1 transition-colors ${palette.button}`}
      >
        ✕
      </button>
    </div>
  )
}
