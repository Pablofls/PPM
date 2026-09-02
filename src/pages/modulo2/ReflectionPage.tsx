import { Badge, Dash, SubmissionStateBadge } from '../../components/Badge'
import type { Column } from '../../components/DataTable'
import { academicColumns, FormPage, studentColumns } from '../../components/FormPage'
import { useRepositoryQuery } from '../../data/hooks'
import { repository } from '../../data/repository'
import type { PanelFilters, ReflectionRow } from '../../data/types'
import { formByCode, type FormCode } from '../../lib/catalog'
import { formatDateTime } from '../../lib/format'

/**
 * Pantalla compartida por 2.1 FODA, 2.2 CV, 2.4 Cover Letter y 2.5 Elevator Pitch.
 *
 * Los cuatro formularios tienen exactamente las mismas dos preguntas ("¿te fue
 * útil?" y "¿por qué?") y comparten la tabla `reflections`. Solo cambian el
 * título y el `form_code`.
 */
export function ReflectionPage({ formCode }: { formCode: FormCode }) {
  const form = formByCode(formCode)

  const columns: Column<ReflectionRow>[] = [
    ...studentColumns<ReflectionRow>(),
    {
      key: 'wasUseful',
      header: '¿Fue útil?',
      render: (row) =>
        row.wasUseful === null ? (
          <Dash />
        ) : (
          <Badge tone={row.wasUseful ? 'green' : 'neutral'}>
            {row.wasUseful ? 'Sí' : 'No'}
          </Badge>
        ),
    },
    {
      key: 'reason',
      header: 'Por qué',
      width: 'min-w-96',
      render: (row) =>
        row.reason ? (
          <p className="line-clamp-2 max-w-96 text-slate-600">{row.reason}</p>
        ) : (
          <Dash />
        ),
    },
    {
      key: 'submittedAt',
      header: 'Fecha de respuesta',
      render: (row) => formatDateTime(row.submittedAt) || <Dash />,
    },
    {
      // Estos cuatro formularios son los únicos con fecha configurada hoy en
      // `fechas_entrega`. La columna es genérica: se activa en cualquier
      // formulario en cuanto se le configure una fecha límite.
      key: 'submissionState',
      header: 'Entrega',
      render: (row) => <SubmissionStateBadge value={row.submissionState} />,
    },
    ...academicColumns<ReflectionRow>(),
  ]

  return (
    <FormPage
      key={formCode}
      form={form}
      columns={columns}
      useRows={(filters: PanelFilters) =>
        useRepositoryQuery(
          () => repository.getReflections(formCode, filters),
          [],
          [formCode, filters],
        )
      }
      renderDetail={(row) => (
        <div className="text-sm">
          <p className="text-xs text-slate-500">Respuesta completa</p>
          <p className="mt-1 whitespace-pre-line text-slate-700">{row.reason || '—'}</p>
        </div>
      )}
    />
  )
}
