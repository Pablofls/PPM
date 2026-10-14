import { useEffect, useRef } from 'react'

import type { CelebrationKind } from '../lib/celebration'

const CONFETTI_MS = 4200
const STAMP_MS = 2800
const COLORS = ['#f2e63d', '#e3d41c', '#343c48', '#6b7484', '#8b5cf6', '#22c55e', '#f97316', '#ef4444']

const prefersReducedMotion = () =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

/**
 * El momento de «ya entregaste»: confeti por toda la pantalla si la entrega fue
 * a tiempo, sello de «ENTREGADO» si fue tardía.
 *
 * No bloquea la pantalla (`pointer-events-none`) y se retira solo con `onDone`.
 * Es genérico: sirve a cualquier actividad que se entregue en el portal.
 */
export function SubmissionCelebration({
  kind,
  onDone,
}: {
  kind: CelebrationKind
  onDone: () => void
}) {
  return kind === 'on_time' ? <Confetti onDone={onDone} /> : <Stamp onDone={onDone} />
}

function Stamp({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const timer = window.setTimeout(onDone, STAMP_MS)
    return () => window.clearTimeout(timer)
  }, [onDone])

  return (
    <div
      role="status"
      aria-label="Entregado"
      className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center"
    >
      <svg
        viewBox="0 0 560 200"
        className="stamp-animation w-[min(88vw,560px)] text-red-700"
        aria-hidden="true"
      >
        <defs>
          {/* Tinta irregular: el ruido le abre huecos como a un sello de goma. */}
          <filter id="stamp-ink" x="0" y="0" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.45" numOctaves="2" seed="7" result="noise" />
            <feColorMatrix
              in="noise"
              type="matrix"
              values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -11 7.5"
              result="holes"
            />
            <feComposite in="SourceGraphic" in2="holes" operator="in" result="speckled" />
            <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="2" seed="3" result="warp" />
            <feDisplacementMap in="speckled" in2="warp" scale="3" />
          </filter>
        </defs>
        <g filter="url(#stamp-ink)" fill="none" stroke="currentColor">
          <rect x="8" y="8" width="544" height="184" rx="26" strokeWidth="9" />
          <rect x="26" y="26" width="508" height="148" rx="14" strokeWidth="3" />
          <text
            x="280"
            y="124"
            textAnchor="middle"
            fill="currentColor"
            stroke="none"
            fontSize="80"
            fontWeight="900"
            textLength="440"
            lengthAdjust="spacingAndGlyphs"
            fontFamily="Inter, system-ui, sans-serif"
          >
            ENTREGADO
          </text>
        </g>
      </svg>
    </div>
  )
}

interface Piece {
  x: number
  y: number
  w: number
  h: number
  vy: number
  drift: number
  phase: number
  angle: number
  spin: number
  color: string
}

function Confetti({ onDone }: { onDone: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    // Sin movimiento: el toast ya confirma la entrega.
    if (prefersReducedMotion()) {
      onDone()
      return
    }
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    const dpr = window.devicePixelRatio || 1
    const resize = () => {
      canvas.width = window.innerWidth * dpr
      canvas.height = window.innerHeight * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    const pieces: Piece[] = Array.from({ length: 180 }, () => ({
      x: Math.random() * window.innerWidth,
      // Arrancan escalonadas por encima de la pantalla: cae como lluvia, no de golpe.
      y: -20 - Math.random() * window.innerHeight * 0.6,
      w: 6 + Math.random() * 6,
      h: 10 + Math.random() * 8,
      vy: 140 + Math.random() * 180,
      drift: 20 + Math.random() * 40,
      phase: Math.random() * Math.PI * 2,
      angle: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 10,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
    }))

    let raf = 0
    let last = performance.now()
    const start = last

    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05)
      last = now
      const elapsed = now - start
      const fade = elapsed > CONFETTI_MS - 800 ? Math.max(0, (CONFETTI_MS - elapsed) / 800) : 1

      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight)
      ctx.globalAlpha = fade
      for (const p of pieces) {
        p.y += p.vy * dt
        p.phase += dt * 3
        p.angle += p.spin * dt
        const x = p.x + Math.sin(p.phase) * p.drift
        ctx.save()
        ctx.translate(x, p.y)
        ctx.rotate(p.angle)
        ctx.fillStyle = p.color
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h)
        ctx.restore()
      }

      if (elapsed >= CONFETTI_MS) {
        onDone()
        return
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [onDone])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[60] h-full w-full"
    />
  )
}
