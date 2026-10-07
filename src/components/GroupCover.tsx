/**
 * Portada de la tarjeta de un grupo, generada a partir de su id.
 *
 * Cumple el papel de la foto de cada materia en Blackboard —que las tarjetas
 * se distingan de un vistazo— sin subir ni guardar imágenes: el mismo grupo
 * siempre tiene la misma portada, y dos grupos distintos casi nunca la
 * misma.
 */

/** Pares de color de fondo. Oscuros a propósito: el texto encima es blanco. */
const PALETTES: [string, string][] = [
  ['#0f766e', '#134e4a'],
  ['#1d4ed8', '#1e3a8a'],
  ['#7c3aed', '#4c1d95'],
  ['#be123c', '#881337'],
  ['#c2410c', '#7c2d12'],
  ['#0369a1', '#0c4a6e'],
  ['#4d7c0f', '#365314'],
  ['#a21caf', '#701a75'],
  ['#334155', '#0f172a'],
]

function hash(value: string): number {
  let result = 0
  for (const char of value) result = (result * 31 + char.charCodeAt(0)) >>> 0
  return result
}

export function GroupCover({ seed, title }: { seed: string; title: string }) {
  const h = hash(seed)
  const [from, to] = PALETTES[h % PALETTES.length]
  const pattern = (h >>> 4) % 3
  const offset = (h >>> 8) % 120

  return (
    <div
      className="relative h-28 overflow-hidden"
      style={{ background: `linear-gradient(135deg, ${from}, ${to})` }}
    >
      <svg
        aria-hidden
        className="absolute inset-0 h-full w-full opacity-25"
        viewBox="0 0 320 112"
        preserveAspectRatio="xMidYMid slice"
      >
        {pattern === 0 &&
          [0, 1, 2, 3].map((i) => (
            <circle
              key={i}
              cx={200 + offset - i * 10}
              cy={20 + i * 12}
              r={30 + i * 22}
              fill="none"
              stroke="white"
              strokeWidth="1.5"
            />
          ))}
        {pattern === 1 &&
          [0, 1, 2, 3, 4].map((i) => (
            <path
              key={i}
              d={`M0 ${30 + i * 18} Q 80 ${10 + i * 18 + offset / 6}, 160 ${30 + i * 18} T 320 ${30 + i * 18}`}
              fill="none"
              stroke="white"
              strokeWidth="1.5"
            />
          ))}
        {pattern === 2 &&
          Array.from({ length: 12 }, (_, i) => (
            <line
              key={i}
              x1={i * 32 - offset / 2}
              y1="112"
              x2={i * 32 + 112 - offset / 2}
              y2="0"
              stroke="white"
              strokeWidth="1.5"
            />
          ))}
      </svg>
      <span className="absolute bottom-3 left-4 text-2xl font-semibold tracking-tight text-white drop-shadow-sm">
        {title}
      </span>
    </div>
  )
}
