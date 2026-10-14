import { useEffect, useRef } from 'react'

import type { CelebrationKind } from '../lib/celebration'

const CONFETTI_MS = 4200
const STAMP_MS = 2600
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
      className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center"
    >
      <div
        className="stamp-animation rounded-lg border-[6px] border-double border-red-600 px-8 py-3 text-5xl font-extrabold tracking-[0.2em] text-red-600 uppercase sm:text-7xl"
        style={{ animationDuration: `${STAMP_MS}ms` }}
      >
        Entregado
      </div>
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
