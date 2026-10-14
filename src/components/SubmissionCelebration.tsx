import { useEffect, useRef } from 'react'

import type { CelebrationKind } from '../lib/celebration'

const CONFETTI_MS = 3600
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
  /** Velocidad a la que el aire frena la caída. */
  terminal: number
  drift: number
  phase: number
  phaseSpeed: number
  angle: number
  spin: number
  flip: number
  flipSpeed: number
  shape: 'rect' | 'circle' | 'strip'
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

    const rand = (min: number, max: number) => min + Math.random() * (max - min)
    const pieces: Piece[] = Array.from({ length: 360 }, () => {
      const shape = (['rect', 'rect', 'circle', 'strip'] as const)[Math.floor(Math.random() * 4)]
      return {
        x: rand(0, window.innerWidth),
        // Arrancan escalonadas por encima de la pantalla: cae como lluvia, no de golpe.
        y: rand(-40, -window.innerHeight * 0.45),
        w: shape === 'strip' ? rand(4, 6) : rand(7, 12),
        h: shape === 'strip' ? rand(18, 30) : shape === 'circle' ? 0 : rand(10, 16),
        vy: rand(150, 350),
        terminal: rand(330, 560),
        drift: rand(25, 70),
        phase: rand(0, Math.PI * 2),
        phaseSpeed: rand(3, 7),
        angle: rand(0, Math.PI * 2),
        spin: rand(-8, 8),
        flip: rand(0, Math.PI * 2),
        flipSpeed: rand(6, 14),
        shape,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
      }
    })

    let raf = 0
    let last = performance.now()
    const start = last

    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05)
      last = now
      const elapsed = now - start
      const fade = elapsed > CONFETTI_MS - 600 ? Math.max(0, (CONFETTI_MS - elapsed) / 600) : 1

      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight)
      ctx.globalAlpha = fade
      for (const p of pieces) {
        // Cae acelerando hasta su velocidad límite, como papel en el aire.
        p.vy += (p.terminal - p.vy) * Math.min(1, dt * 2.2)
        p.y += p.vy * dt
        p.phase += dt * p.phaseSpeed
        p.angle += p.spin * dt
        p.flip += dt * p.flipSpeed
        const x = p.x + Math.sin(p.phase) * p.drift
        // El volteo en 3D: al girar de canto el pedazo se ve más delgado.
        const flat = Math.cos(p.flip)

        ctx.save()
        ctx.translate(x, p.y)
        ctx.rotate(p.angle)
        ctx.scale(1, flat)
        ctx.fillStyle = p.color
        if (p.shape === 'circle') {
          ctx.beginPath()
          ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2)
          ctx.fill()
        } else {
          ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h)
        }
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
