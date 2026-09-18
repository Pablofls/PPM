import { Badge, Dash } from '../../components/Badge'
import type { Column } from '../../components/DataTable'
import { academicColumns, FormPage, studentColumns } from '../../components/FormPage'
import { useRepositoryQuery } from '../../data/hooks'
import { repository } from '../../data/repository'
import type { MbtiRow, PanelFilters } from '../../data/types'
import { formByCode } from '../../lib/catalog'
import { capitalize, toHref } from '../../lib/format'

const form = formByCode('form1_2')

/**
 * Dimensión MBTI con su porcentaje.
 *
 * El porcentaje se muestra con una barra: leer "68" no dice tanto como verlo.
 */
function Dimension({ value, pct }: { value: string | null; pct: number | null }) {
  if (!value) return <Dash />
  return (
    <div className="min-w-32">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-slate-800">{capitalize(value)}</span>
        {pct !== null && (
          <span className="text-xs text-slate-500 tabular-nums">{pct}%</span>
        )}
      </div>
      {pct !== null && (
        <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-brand-500" style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  )
}

const columns: Column<MbtiRow>[] = [
  ...studentColumns<MbtiRow>(),
  {
    key: 'mbtiType',
    header: 'Tipo',
    render: (row) => (row.mbtiType ? <Badge tone="violet">{row.mbtiType}</Badge> : <Dash />),
  },
  {
    key: 'identity',
    header: 'Identidad',
    render: (row) => capitalize(row.identity) || <Dash />,
  },
  {
    key: 'energy',
    header: 'Energía',
    render: (row) => <Dimension value={row.energy} pct={row.energyPct} />,
  },
  {
    key: 'mind',
    header: 'Mente',
    render: (row) => <Dimension value={row.mind} pct={row.mindPct} />,
  },
  {
    key: 'nature',
    header: 'Naturaleza',
    render: (row) => <Dimension value={row.nature} pct={row.naturePct} />,
  },
  {
    key: 'tactics',
    header: 'Tácticas',
    render: (row) => <Dimension value={row.tactics} pct={row.tacticsPct} />,
  },
  {
    key: 'reportUrl',
    header: 'Reporte',
    render: (row) => <ReportLink url={row.reportUrl} />,
  },
  ...academicColumns<MbtiRow>(),
]

/**
 * Los alumnos capturan el enlace a mano y no siempre es una URL válida, así que
 * solo se enlaza lo que de verdad lo es; el resto se muestra como texto.
 */
export function ReportLink({ url }: { url: string | null }) {
  if (!url) return <Dash />
  const href = toHref(url)
  if (!href) return <span className="text-slate-500">{url}</span>
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="font-medium text-brand-600 hover:text-brand-700 hover:underline"
    >
      Ver reporte
    </a>
  )
}

export function PersonalityPage() {
  return (
    <FormPage
      form={form}
      columns={columns}
      useRows={(filters: PanelFilters) =>
        useRepositoryQuery(() => repository.getMbti(filters), [], [filters])
      }
    />
  )
}
