import { useEffect, useRef, type ReactNode } from 'react'

/**
 * Ventana emergente centrada sobre un fondo oscurecido. Se cierra con la X,
 * con Escape o haciendo clic en el fondo.
 *
 * `footer` va fijo abajo (los botones de Cancelar / Guardar), y el cuerpo
 * hace scroll si no cabe en la pantalla.
 */
export function Modal({
  title,
  onClose,
  children,
  footer,
  width = 'max-w-xl',
}: {
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  width?: string
}) {
  const panel = useRef<HTMLDivElement>(null)
  // En un ref: quien abre la ventana suele pasar una función nueva en cada
  // render, y el efecto de abajo no debe volver a correr (robaría el foco).
  const close = useRef(onClose)
  useEffect(() => {
    close.current = onClose
  })

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close.current()
    }
    document.addEventListener('keydown', onKey)
    // Sin scroll de la página de atrás mientras la ventana está abierta.
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    // El foco al primer campo (después de la X del encabezado).
    panel.current?.querySelector<HTMLElement>('[data-modal-body] input, [data-modal-body] select')?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
    }
  }, [])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/50 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close.current()
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`flex max-h-[90vh] w-full ${width} flex-col overflow-hidden rounded-xl bg-white shadow-2xl`}
      >
        <div className="flex items-center justify-between gap-4 border-b border-ink-200 px-6 py-4">
          <h2 className="text-base font-semibold text-ink-950">{title}</h2>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={onClose}
            className="rounded-lg p-1 text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-900"
          >
            <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <div data-modal-body className="flex-1 overflow-y-auto px-6 py-5">
          {children}
        </div>
        {footer && (
          <div className="flex justify-end gap-3 border-t border-ink-200 bg-ink-50 px-6 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
