import { Badge, Dash } from '../../components/Badge'
import type { Column } from '../../components/DataTable'
import { academicColumns, FormPage, studentColumns } from '../../components/FormPage'
import { useRepositoryQuery } from '../../data/hooks'
import { repository } from '../../data/repository'
import type { HollandRow, PanelFilters } from '../../data/types'
import { formByCode, HOLLAND_LABELS } from '../../lib/catalog'

const form = formByCode('form1_1')

/** Muestra la letra Holland con su significado: `S` → `S · Social`. */
function HollandType({ letter, score }: { letter: string | null; score: number | null }) {
  if (!letter) return <Dash />
  return (
    <div className="whitespace-nowrap">
      <span className="font-medium text-slate-800">{letter}</span>
      <span className="ml-1.5 text-slate-500">{HOLLAND_LABELS[letter] ?? ''}</span>
      {score !== null && (
        <span className="ml-2 text-xs text-slate-400 tabular-nums">{score} pts</span>
      )}
    </div>
  )
}

const columns: Column<HollandRow>[] = [
  ...studentColumns<HollandRow>(),
  {
    key: 'hollandCode',
    header: 'Código Holland',
    render: (row) =>
      row.hollandCode ? <Badge tone="violet">{row.hollandCode}</Badge> : <Dash />,
  },
  {
    key: 'first',
    header: '1er interés',
    width: 'min-w-44',
    render: (row) => <HollandType letter={row.firstType} score={row.firstScore} />,
  },
  {
    key: 'second',
    header: '2do interés',
    width: 'min-w-44',
    render: (row) => <HollandType letter={row.secondType} score={row.secondScore} />,
  },
  {
    key: 'third',
    header: '3er interés',
    width: 'min-w-44',
    render: (row) => <HollandType letter={row.thirdType} score={row.thirdScore} />,
  },
  ...academicColumns<HollandRow>(),
]

export function InterestsPage() {
  return (
    <FormPage
      form={form}
      columns={columns}
      useRows={(filters: PanelFilters) =>
        useRepositoryQuery(() => repository.getHolland(filters), [], [filters])
      }
    />
  )
}
