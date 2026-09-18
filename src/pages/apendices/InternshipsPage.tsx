import { Badge, Dash } from '../../components/Badge'
import type { Column } from '../../components/DataTable'
import { FormPage, studentColumns } from '../../components/FormPage'
import { useRepositoryQuery } from '../../data/hooks'
import { repository } from '../../data/repository'
import type { InternshipRow, PanelFilters } from '../../data/types'
import { formByCode } from '../../lib/catalog'
import { toHref } from '../../lib/format'

const form = formByCode('formA_1')

/** Enlace corto a la página de la empresa, como en la plataforma anterior. */
function WebLink({ url }: { url: string | null }) {
  const href = toHref(url)
  if (!href) return url ? <span className="text-ink-500">{url}</span> : <Dash />
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
}

const columns: Column<InternshipRow>[] = [
  ...studentColumns<InternshipRow>({ omitEmail: true }),
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
    // RFC sin validar en el origen: hay filas con el nombre de la empresa aquí.
    key: 'companyTaxId',
    header: 'RFC',
    render: (row) =>
      row.companyTaxId ? (
        <span className="block max-w-40 truncate" title={row.companyTaxId}>
          {row.companyTaxId}
        </span>
      ) : (
        <Dash />
      ),
  },
  {
    key: 'companyWebsite',
    header: 'Página Web',
    render: (row) => <WebLink url={row.companyWebsite} />,
  },
  {
    key: 'companyFoundedYear',
    header: 'Año Empresa',
    render: (row) =>
      row.companyFoundedYear === null ? (
        <Dash />
      ) : (
        <span className="tabular-nums">{row.companyFoundedYear}</span>
      ),
  },
  {
    key: 'requiredHours',
    header: 'Horas',
    render: (row) =>
      row.requiredHours === null ? (
        <Dash />
      ) : (
        <span className="tabular-nums">{row.requiredHours}</span>
      ),
  },
  {
    key: 'isPaid',
    header: 'Remunerada',
    render: (row) =>
      row.isPaid === null ? (
        <Dash />
      ) : (
        <Badge tone={row.isPaid ? 'green' : 'neutral'}>{row.isPaid ? 'Sí' : 'No'}</Badge>
      ),
  },
  {
    key: 'department',
    header: 'Departamento',
    width: 'min-w-44',
    render: (row) =>
      row.department ? (
        <span className="block max-w-44 truncate" title={row.department}>
          {row.department}
        </span>
      ) : (
        <Dash />
      ),
  },
  {
    key: 'supervisorName',
    header: 'Nombre Jefe',
    width: 'min-w-40',
    render: (row) => row.supervisorName ?? <Dash />,
  },
  {
    key: 'supervisorRole',
    header: 'Puesto Jefe',
    render: (row) =>
      row.supervisorRole ? <Badge>{row.supervisorRole}</Badge> : <Dash />,
  },
  {
    key: 'schedule',
    header: 'Horario',
    width: 'min-w-44',
    render: (row) =>
      row.schedule ? (
        <span className="block max-w-44 truncate" title={row.schedule}>
          {row.schedule}
        </span>
      ) : (
        <Dash />
      ),
  },
]

export function InternshipsPage() {
  return (
    <FormPage
      form={form}
      columns={columns}
      filterMode="solo-busqueda"
      searchPlaceholder="Buscar por nombre o empresa…"
      hideProcessAction
      useRows={(filters: PanelFilters) =>
        useRepositoryQuery(() => repository.getInternships(filters), [], [filters])
      }
      renderDetail={(row) => (
        <div className="space-y-4 text-sm">
          <Campo titulo="Descripción de actividades" valor={row.description} />
          <Campo titulo="Relación con la carrera" valor={row.careerRelation} />
          <Campo titulo="Relación con su desarrollo profesional" valor={row.professionalRelation} />
          <Campo titulo="Opción de prácticas" valor={row.internshipOption} />
          <Campo titulo="Restricciones" valor={row.restrictions} />
          <Campo titulo="Validación de la empresa" valor={row.companyValidation} />

          {/* Datos de contacto de un tercero: solo dentro del panel. */}
          <div className="rounded-lg bg-ink-50 px-3 py-2">
            <p className="text-xs font-medium text-ink-500">Contacto del jefe directo</p>
            <p className="mt-1 text-ink-700">{row.supervisorName || '—'}</p>
            <p className="text-ink-600">{row.supervisorEmail || '—'}</p>
            <p className="text-ink-600">{row.supervisorPhone || '—'}</p>
          </div>
        </div>
      )}
    />
  )
}

export function Campo({ titulo, valor }: { titulo: string; valor: string | null }) {
  return (
    <div>
      <p className="text-xs text-ink-500">{titulo}</p>
      <p className="mt-1 whitespace-pre-line text-ink-700">{valor || '—'}</p>
    </div>
  )
}
