import { Badge, Dash } from '../../components/Badge'
import type { Column } from '../../components/DataTable'
import { FormPage, studentColumns, submittedAtColumn } from '../../components/FormPage'
import { useRepositoryQuery } from '../../data/hooks'
import { repository } from '../../data/repository'
import type { CompanyRow, PanelFilters } from '../../data/types'
import { formByCode } from '../../lib/catalog'
import { toHref } from '../../lib/format'
import { Campo } from './InternshipsPage'

const form = formByCode('formB_1')

const CURRENCY = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 0,
})

/** Celda de texto largo: se trunca aquí y se lee completa en el panel lateral. */
function Larga({ valor, ancho = 'max-w-56' }: { valor: string | null; ancho?: string }) {
  if (!valor) return <Dash />
  return (
    <span className={`block ${ancho} truncate`} title={valor}>
      {valor}
    </span>
  )
}

const columns: Column<CompanyRow>[] = [
  ...studentColumns<CompanyRow>({ omitEmail: true }),
  {
    key: 'companyName',
    header: 'Empresa',
    width: 'min-w-48',
    render: (row) =>
      row.companyName ? (
        <span className="font-medium text-ink-800">{row.companyName}</span>
      ) : (
        <Dash />
      ),
  },
  {
    key: 'companyWebsite',
    header: 'Página Web',
    render: (row) => {
      const href = toHref(row.companyWebsite)
      if (!href) return row.companyWebsite ? <Larga valor={row.companyWebsite} /> : <Dash />
      return (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="font-medium text-ink-700 underline underline-offset-2 hover:text-ink-950"
        >
          Ver
        </a>
      )
    },
  },
  {
    key: 'industry',
    header: 'Giro',
    width: 'min-w-40',
    render: (row) =>
      row.industry ? (
        <Badge tone="blue">
          <span className="block max-w-40 truncate">{row.industry}</span>
        </Badge>
      ) : (
        <Dash />
      ),
  },
  {
    key: 'mission',
    header: 'Misión',
    width: 'min-w-56',
    render: (row) => <Larga valor={row.mission} />,
  },
  {
    key: 'vision',
    header: 'Visión',
    width: 'min-w-56',
    render: (row) => <Larga valor={row.vision} />,
  },
  {
    key: 'companyValues',
    header: 'Valores',
    width: 'min-w-56',
    render: (row) => <Larga valor={row.companyValues} />,
  },
  {
    key: 'address',
    header: 'Dirección',
    width: 'min-w-48',
    render: (row) => <Larga valor={row.address} ancho="max-w-48" />,
  },
  {
    // 'horarioLaboral' es texto descriptivo, no un número de horas.
    key: 'workSchedule',
    header: 'Horario',
    width: 'min-w-44',
    render: (row) => <Larga valor={row.workSchedule} ancho="max-w-44" />,
  },
  {
    key: 'department',
    header: 'Departamento',
    width: 'min-w-40',
    render: (row) => <Larga valor={row.department} ancho="max-w-40" />,
  },
  {
    key: 'hasContract',
    header: 'Contrato',
    render: (row) =>
      row.hasContract === null ? (
        <Dash />
      ) : (
        <Badge tone={row.hasContract ? 'green' : 'neutral'}>
          {row.hasContract ? 'Sí' : 'No'}
        </Badge>
      ),
  },
  {
    key: 'salary',
    header: 'Sueldo',
    render: (row) =>
      row.salary === null ? (
        <Dash />
      ) : (
        <span className="tabular-nums">{CURRENCY.format(row.salary)}</span>
      ),
  },
  {
    key: 'linkedinConnections',
    header: 'Contactos LinkedIn',
    render: (row) =>
      row.linkedinConnections === null ? (
        <Dash />
      ) : (
        <span className="tabular-nums">{row.linkedinConnections}</span>
      ),
  },
  ...submittedAtColumn<CompanyRow>(),
]

export function CompaniesPage() {
  return (
    <FormPage
      form={form}
      columns={columns}
      filterMode="solo-busqueda"
      searchPlaceholder="Buscar por nombre o empresa…"
      hideProcessAction
      useRows={(filters: PanelFilters) =>
        useRepositoryQuery(() => repository.getCompanies(filters), [], [filters])
      }
      renderDetail={(row) => (
        <div className="space-y-4 text-sm">
          <Campo titulo="Misión" valor={row.mission} />
          <Campo titulo="Visión" valor={row.vision} />
          <Campo titulo="Valores" valor={row.companyValues} />
          <Campo titulo="Actividades del alumno" valor={row.activities} />
          <Campo titulo="Horario laboral" valor={row.workSchedule} />
          <Campo titulo="Dirección" valor={row.address} />

          {/* Datos de contacto de un tercero: solo dentro del panel. */}
          <div className="rounded-lg bg-ink-50 px-3 py-2">
            <p className="text-xs font-medium text-ink-500">Contacto del jefe directo</p>
            <p className="mt-1 text-ink-700">{row.supervisorInfo || '—'}</p>
            <p className="text-ink-600">{row.supervisorEmail || '—'}</p>
            <p className="text-ink-600">{row.supervisorPhone || '—'}</p>
          </div>
        </div>
      )}
    />
  )
}
