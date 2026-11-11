import { useEffect, useRef } from 'react'

import { celebrationTheme, type CelebrationKind, type CelebrationTheme } from '../lib/celebration'
import { useT } from '../lib/i18n'

const RAIN_MS = 4000
const STAMP_MS = 2800
const COLORS = ['#f2e63d', '#e3d41c', '#343c48', '#6b7484', '#8b5cf6', '#22c55e', '#f97316', '#ef4444']

const prefersReducedMotion = () =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

/**
 * El momento de «ya entregaste»: lluvia por toda la pantalla si la entrega fue
 * a tiempo, sello de «ENTREGADO» si fue tardía. La lluvia es de temporada
 * (`celebrationTheme`): hojas en otoño, copos en invierno y confeti el resto;
 * solo cambia la forma de las piezas, la caída es la misma.
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
  return kind === 'on_time' ? <FallingPieces onDone={onDone} /> : <Stamp onDone={onDone} />
}

function Stamp({ onDone }: { onDone: () => void }) {
  const t = useT()
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
            {t('ENTREGADO', 'SUBMITTED')}
          </text>
        </g>
      </svg>
    </div>
  )
}

type Shape = 'rect' | 'circle' | 'strip' | 'leaf' | 'maple' | 'flake' | 'dot'

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
  shape: Shape
  color: string
}

/**
 * Lo único que cambia entre temporadas: qué formas caen y de qué colores.
 * Las formas repetidas pesan más al sortear.
 */
const THEMES: Record<CelebrationTheme, { shapes: Shape[]; colors: string[] }> = {
  confetti: { shapes: ['rect', 'rect', 'circle', 'strip'], colors: COLORS },
  leaves: {
    shapes: ['leaf', 'leaf', 'maple'],
    colors: ['#c2410c', '#ea580c', '#d97706', '#b45309', '#a16207', '#991b1b', '#ca8a04'],
  },
  snow: {
    shapes: ['flake', 'flake', 'dot'],
    colors: ['#ffffff', '#f0f9ff', '#e0f2fe', '#bae6fd', '#93c5fd'],
  },
}

/** Ancho y alto de cada forma, en píxeles. */
const sizeOf = (shape: Shape, rand: (min: number, max: number) => number) => {
  switch (shape) {
    case 'strip':
      return { w: rand(4, 6), h: rand(18, 30) }
    case 'circle':
      return { w: rand(7, 12), h: 0 }
    case 'rect':
      return { w: rand(7, 12), h: rand(10, 16) }
    case 'leaf':
    case 'maple':
      return { w: rand(14, 20), h: 0 }
    case 'flake':
      return { w: rand(12, 18), h: 0 }
    case 'dot':
      return { w: rand(4, 7), h: 0 }
  }
}

/** Borde de los copos: sin él, el blanco desaparece sobre el fondo claro. */
const SNOW_RIM = 'rgba(59, 130, 246, 0.55)'
const LEAF_VEIN = 'rgba(0, 0, 0, 0.28)'

/** Formas complejas en coordenadas unitarias (ancho 1), se escalan con `p.w`. */
let paths: { leaf: Path2D; vein: Path2D; maple: Path2D; flake: Path2D } | null = null
const getPaths = () => {
  if (paths) return paths

  const leaf = new Path2D('M0 -0.5 C0.36 -0.25 0.34 0.22 0 0.45 C-0.34 0.22 -0.36 -0.25 0 -0.5 Z')
  const vein = new Path2D('M0 -0.42 L0 0.6')

  // Hoja de arce: cinco lóbulos con dientes y un rabito.
  const maple = new Path2D()
  const lobes: [number, number][] = [
    [-160, 0.42],
    [-90, 0.5],
    [-20, 0.42],
    [35, 0.3],
    [145, 0.3],
  ]
  const at = (deg: number, r: number): [number, number] => {
    const a = (deg * Math.PI) / 180
    return [Math.cos(a) * r, Math.sin(a) * r]
  }
  const pts: [number, number][] = []
  lobes.forEach(([deg, r], i) => {
    const next = lobes[(i + 1) % lobes.length][0]
    const gap = ((next - deg + 360) % 360) / 2
    pts.push(at(deg - 15, r * 0.7), at(deg, r), at(deg + 15, r * 0.7))
    pts.push(at(deg + gap, i === 3 ? 0.12 : 0.17))
  })
  maple.moveTo(...pts[0])
  pts.slice(1).forEach((pt) => maple.lineTo(...pt))
  maple.closePath()
  maple.moveTo(0, 0)
  maple.lineTo(0, 0.55)

  // Copo de seis brazos, cada uno con dos pares de ramitas.
  const flake = new Path2D()
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3
    const [dx, dy] = [Math.cos(a), Math.sin(a)]
    flake.moveTo(0, 0)
    flake.lineTo(dx * 0.5, dy * 0.5)
    for (const [along, len] of [
      [0.22, 0.12],
      [0.36, 0.09],
    ]) {
      const [bx, by] = [dx * along, dy * along]
      for (const side of [-1, 1]) {
        const b = a + (side * Math.PI) / 4
        flake.moveTo(bx, by)
        flake.lineTo(bx + Math.cos(b) * len, by + Math.sin(b) * len)
      }
    }
  }

  paths = { leaf, vein, maple, flake }
  return paths
}

/** Dibuja una pieza ya trasladada, girada y volteada al origen. */
function drawPiece(ctx: CanvasRenderingContext2D, p: Piece) {
  ctx.fillStyle = p.color
  switch (p.shape) {
    case 'rect':
    case 'strip':
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h)
      return
    case 'circle':
    case 'dot':
      ctx.beginPath()
      ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2)
      ctx.fill()
      if (p.shape === 'dot') {
        ctx.strokeStyle = SNOW_RIM
        ctx.lineWidth = 1
        ctx.stroke()
      }
      return
  }

  const { leaf, vein, maple, flake } = getPaths()
  ctx.scale(p.w, p.w)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  switch (p.shape) {
    case 'leaf':
      ctx.fill(leaf)
      ctx.strokeStyle = LEAF_VEIN
      ctx.lineWidth = 0.06
      ctx.stroke(vein)
      return
    case 'maple':
      ctx.fill(maple)
      ctx.strokeStyle = p.color
      ctx.lineWidth = 0.06
      ctx.stroke(maple)
      return
    case 'flake':
      ctx.strokeStyle = SNOW_RIM
      ctx.lineWidth = 0.14
      ctx.stroke(flake)
      ctx.strokeStyle = p.color
      ctx.lineWidth = 0.07
      ctx.stroke(flake)
      return
  }
}

function FallingPieces({ onDone }: { onDone: () => void }) {
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

    const theme = THEMES[celebrationTheme()]
    const rand = (min: number, max: number) => min + Math.random() * (max - min)
    const pick = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)]
    const pieces: Piece[] = Array.from({ length: 700 }, () => {
      const shape = pick(theme.shapes)
      return {
        x: rand(0, window.innerWidth),
        // Arrancan escalonadas por encima de la pantalla: cae como lluvia, no de golpe.
        y: rand(-40, -window.innerHeight * 0.9),
        ...sizeOf(shape, rand),
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
        color: pick(theme.colors),
      }
    })

    let raf = 0
    let last = performance.now()
    const start = last

    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.1)
      last = now
      const elapsed = now - start
      const fade = elapsed > RAIN_MS - 700 ? Math.max(0, (RAIN_MS - elapsed) / 700) : 1

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
        drawPiece(ctx, p)
        ctx.restore()
      }

      if (elapsed >= RAIN_MS) {
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
