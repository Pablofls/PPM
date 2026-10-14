import { useEffect, useState } from 'react'

const CHECK_EVERY_MS = 5 * 60 * 1000

/**
 * Avisa cuando hay una versión nueva desplegada.
 *
 * Cada build publica `/version.json` con el id del despliegue; el JS que el
 * navegador ya tiene lleva el suyo incrustado. Si difieren, el usuario sigue
 * con la versión vieja y se le ofrece recargar. Se revisa cada 5 minutos y al
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

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-4 bottom-6 z-50 mx-auto flex max-w-md items-center gap-3 rounded-xl border border-ink-200 bg-white px-5 py-4 shadow-lg"
    >
      <p className="min-w-0 flex-1 text-sm text-ink-900">
        Hay una nueva versión del panel disponible.
      </p>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="shrink-0 rounded-lg px-2 py-1 text-sm text-ink-500 hover:bg-ink-100"
      >
        Después
      </button>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="shrink-0 rounded-lg bg-ink-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-ink-800"
      >
        Actualizar
      </button>
    </div>
  )
}
