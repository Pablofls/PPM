import { useEffect, useState } from 'react'

const CHECK_EVERY_MS = 5 * 60 * 1000

/**
 * Avisa cuando hay una versión nueva desplegada.
 *
 * Cada build publica `/version.json` con el id del despliegue; el JS que el
 * navegador ya tiene lleva el suyo incrustado. Si difieren, el usuario sigue
 * con la versión vieja y se le ofrece recargar (o cerrar el aviso). Se revisa cada 5 minutos y al
 * volver a la pestaña, que es cuando una pestaña olvidada suele quedarse atrás.
 */
export function UpdateToast() {
  const [outdated, setOutdated] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    // En desarrollo no hay `version.json` y el id cambia con cada arranque.
    if (import.meta.env.DEV) return

    let cancelled = false
    async function check() {
      try {
        const response = await fetch('/version.json', { cache: 'no-store' })
        if (!response.ok) return
        const { id } = (await response.json()) as { id?: string }
        if (!cancelled && id && id !== __APP_VERSION__) setOutdated(true)
      } catch {
        // Sin red no hay nada que avisar; se vuelve a intentar en la siguiente.
      }
    }
    function onVisible() {
      if (document.visibilityState === 'visible') void check()
    }

    void check()
    const timer = setInterval(check, CHECK_EVERY_MS)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  if (!outdated || dismissed) return null

  // Arriba a la derecha, casi pegado a la barra superior; entra deslizándose.
  return (
    <div
      role="status"
      aria-live="polite"
      className="update-toast fixed top-[4.75rem] right-4 z-50 flex max-w-[calc(100vw-2rem)] items-center gap-4 rounded-xl bg-ink-900 py-3 pr-3 pl-4 text-white shadow-lg"
    >
      <p className="text-sm leading-snug">
        <span className="font-semibold">Salió una versión nueva del panel.</span>
        <br />
        Recarga la página para continuar.
      </p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="shrink-0 rounded-lg bg-accent-400 px-3.5 py-1.5 text-sm font-semibold text-ink-950 transition-colors hover:bg-accent-300"
      >
        Recargar
      </button>
      <button
        type="button"
        aria-label="Cerrar aviso"
        onClick={() => setDismissed(true)}
        className="shrink-0 rounded-md p-1 text-white/80 transition-colors hover:bg-white/15 hover:text-white"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  )
}
