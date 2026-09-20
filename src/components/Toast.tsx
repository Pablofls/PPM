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
}: {
  message: string
  onDismiss: () => void
  duration?: number
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

  return (
    <div
      // `status` y no `alert`: es una confirmación, no un problema. El lector
      // de pantalla lo anuncia sin interrumpir lo que esté leyendo.
      role="status"
      aria-live="polite"
      className={`fixed inset-x-4 bottom-6 z-50 mx-auto flex max-w-md items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4 shadow-lg transition-opacity duration-300 ${
        leaving ? 'opacity-0' : 'opacity-100'
      }`}
    >
      <p className="min-w-0 flex-1 text-sm text-emerald-900">{message}</p>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Cerrar aviso"
        className="shrink-0 rounded-md px-1 text-emerald-700 transition-colors hover:bg-emerald-100 hover:text-emerald-900"
      >
        ✕
      </button>
    </div>
  )
}
