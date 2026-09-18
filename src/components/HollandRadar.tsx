import { HOLLAND_LABELS } from '../lib/catalog'

/**
 * Radar de los intereses Holland, dibujado en SVG.
 *
 * No usa Chart.js: son seis ejes fijos y una sola serie, unas cuantas
 * coordenadas polares. Meter una librería de gráficas —y sus ~70 KB— para esto
 * sería el mismo error que habría sido usar TanStack Table para una tabla de
 * sesenta líneas.
 */

/**
 * Orden del hexágono RIASEC, el estándar del modelo.
 *
 * La plataforma anterior ordenaba los ejes **por puntuación**, así que cada
 * alumno tenía el radar en un orden distinto y la forma no se podía comparar
 * entre dos. Con el orden fijo, dos radares con la misma silueta significan lo
 * mismo.
 */
const AXES = ['R', 'I', 'A', 'S', 'E', 'C'] as const

// El lienzo es más ancho que alto a propósito: las etiquetas de los cuatro ejes
// diagonales salen hacia los lados, y «Investigadora» o «Emprendedora» no caben
// en un cuadrado con el hexágono centrado.
const WIDTH = 340
const HEIGHT = 250
const CENTER_X = WIDTH / 2
const CENTER_Y = HEIGHT / 2 - 6
const RADIUS = 72
const RINGS = [0.25, 0.5, 0.75, 1]
/** Separación de las etiquetas, en proporción del radio. */
const LABEL_GAP = 1.26

interface HollandRadarProps {
  /** Las puntuaciones que hay. Las letras ausentes valen 0. */
  scores: Partial<Record<string, number | null>>
}

export function HollandRadar({ scores }: HollandRadarProps) {
  const valores = AXES.map((letra) => scores[letra] ?? 0)

  // Escala mínima de 12 para que un alumno con puntuaciones bajas no salga con
  // el polígono pegado al borde y parezca que va mejor de lo que va.
  const escala = Math.max(12, ...valores)

  const puntos = valores.map((valor, indice) => coord(indice, valor / escala))

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="h-auto w-full max-w-[340px]"
      role="img"
      aria-label={`Radar de intereses: ${AXES.map(
        (letra, i) => `${HOLLAND_LABELS[letra]} ${valores[i]}`,
      ).join(', ')}`}
    >
      {RINGS.map((proporcion) => (
        <polygon
          key={proporcion}
          points={AXES.map((_, indice) => coord(indice, proporcion))
            .map(([x, y]) => `${x},${y}`)
            .join(' ')}
          className="fill-none stroke-ink-200"
          strokeWidth={1}
        />
      ))}

      {AXES.map((letra, indice) => {
        const [x, y] = coord(indice, 1)
        return (
          <line
            key={letra}
            x1={CENTER_X}
            y1={CENTER_Y}
            x2={x}
            y2={y}
            className="stroke-ink-200"
            strokeWidth={1}
          />
        )
      })}

      <polygon
        points={puntos.map(([x, y]) => `${x},${y}`).join(' ')}
        className="fill-accent-400/40 stroke-ink-800"
        strokeWidth={2}
        strokeLinejoin="round"
      />

      {puntos.map(([x, y], indice) => (
        <circle key={AXES[indice]} cx={x} cy={y} r={3} className="fill-ink-900" />
      ))}

      {AXES.map((letra, indice) => {
        const [x, y] = coord(indice, LABEL_GAP)
        return (
          <text
            key={letra}
            x={x}
            y={y}
            textAnchor={anchor(x)}
            dominantBaseline="middle"
            className="fill-ink-600 text-[10px] font-medium"
          >
            {HOLLAND_LABELS[letra]}
          </text>
        )
      })}
    </svg>
  )
}

/** Vértice `indice` del hexágono, a `proporcion` del radio. Empieza arriba. */
function coord(indice: number, proporcion: number): [number, number] {
  const angulo = (Math.PI / 180) * (indice * 60 - 90)
  return [
    CENTER_X + Math.cos(angulo) * RADIUS * proporcion,
    CENTER_Y + Math.sin(angulo) * RADIUS * proporcion,
  ]
}

/** Evita que las etiquetas de los lados se encimen con el hexágono. */
function anchor(x: number): 'start' | 'middle' | 'end' {
  if (x > CENTER_X + 4) return 'start'
  if (x < CENTER_X - 4) return 'end'
  return 'middle'
}
