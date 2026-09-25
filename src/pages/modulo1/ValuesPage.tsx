import { Badge, Dash } from '../../components/Badge'
import type { Column } from '../../components/DataTable'
import {
  academicColumns,
  FormPage,
  studentColumns,
  submittedAtColumn,
} from '../../components/FormPage'
import { ReportLink } from './PersonalityPage'
import { useRepositoryQuery } from '../../data/hooks'
import { repository } from '../../data/repository'
import type { PanelFilters, ValuesRow } from '../../data/types'
import { formByCode } from '../../lib/catalog'

const form = formByCode('form1_5')

const columns: Column<ValuesRow>[] = [
  ...studentColumns<ValuesRow>(),
  {
    // En el Sheets es una sola celda ('Seguridad, Logro'); en la BD es un arreglo
    // y aquí se muestra un chip por valor.
    key: 'topValues',
    header: 'Valores fuertes',
    width: 'min-w-64',
    render: (row) =>
      row.topValues.length === 0 ? (
        <Dash />
      ) : (
        <div className="flex flex-wrap gap-1">
          {row.topValues.map((value) => (
            <Badge key={value} tone="violet">
              {value}
            </Badge>
          ))}
        </div>
      ),
  },
  {
    key: 'score',
    header: 'Puntuación',
    render: (row) =>
      row.score === null ? <Dash /> : <span className="tabular-nums">{row.score}</span>,
  },
  {
    key: 'reportUrl',
    header: 'Reporte',
    render: (row) => <ReportLink url={row.reportUrl} />,
  },
  ...academicColumns<ValuesRow>(),
  ...submittedAtColumn<ValuesRow>(),
]

export function ValuesPage() {
  return (
    <FormPage
      form={form}
      columns={columns}
      useRows={(filters: PanelFilters) =>
        useRepositoryQuery(() => repository.getValues(filters), [], [filters])
      }
    />
  )
}
