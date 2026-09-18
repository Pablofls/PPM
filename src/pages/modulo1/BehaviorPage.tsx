import { Badge, Dash } from '../../components/Badge'
import type { Column } from '../../components/DataTable'
import { academicColumns, FormPage, studentColumns } from '../../components/FormPage'
import { useRepositoryQuery } from '../../data/hooks'
import { repository } from '../../data/repository'
import type { DiscRow, PanelFilters } from '../../data/types'
import { formByCode } from '../../lib/catalog'

const form = formByCode('form1_3')

const columns: Column<DiscRow>[] = [
  ...studentColumns<DiscRow>(),
  {
    key: 'discStyle',
    header: 'Estilo DISC',
    render: (row) =>
      row.discStyle ? <Badge tone="blue">{row.discStyle.toUpperCase()}</Badge> : <Dash />,
  },
  {
    key: 'discCategory',
    header: 'Categoría',
    render: (row) => row.discCategory ?? <Dash />,
  },
  {
    key: 'explanation',
    header: 'Explicación',
    width: 'min-w-72',
    render: (row) =>
      row.explanation ? (
        <p className="line-clamp-2 max-w-72 text-ink-600">{row.explanation}</p>
      ) : (
        <Dash />
      ),
  },
  {
    // Columna propia de esta pantalla: la hoja de origen llega contaminada
    // (el traductor del formulario convierte el estilo 'SC' en 'Carolina del
    // Sur', y hay alumnos que escriben texto libre). Esas respuestas se
    // importan marcadas en vez de descartarse, para que el profesor las corrija.
    key: 'needsReview',
    header: 'Revisión',
    render: (row) =>
      row.needsReview ? <Badge tone="amber">Revisar</Badge> : <Dash />,
  },
  ...academicColumns<DiscRow>(),
]

export function BehaviorPage() {
  return (
    <FormPage
      form={form}
      columns={columns}
      useRows={(filters: PanelFilters) =>
        useRepositoryQuery(() => repository.getDisc(filters), [], [filters])
      }
      renderDetail={(row) => (
        <div className="space-y-3 text-sm">
          {row.needsReview && (
            <p className="rounded-lg border-l-4 border-accent-400 bg-accent-100 px-3 py-2 text-ink-700">
              Esta respuesta llegó con un valor que no corresponde a un estilo DISC
              válido. Conviene revisarla contra el formulario original.
            </p>
          )}
          <div>
            <p className="text-xs text-ink-500">Explicación del alumno</p>
            <p className="mt-1 whitespace-pre-line text-ink-700">
              {row.explanation || '—'}
            </p>
          </div>
        </div>
      )}
    />
  )
}
