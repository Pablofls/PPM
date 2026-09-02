import { Dash } from '../../components/Badge'
import type { Column } from '../../components/DataTable'
import { academicColumns, FormPage, studentColumns } from '../../components/FormPage'
import { useRepositoryQuery } from '../../data/hooks'
import { repository } from '../../data/repository'
import type { IndeedRow, PanelFilters } from '../../data/types'
import { formByCode } from '../../lib/catalog'
import { toHref } from '../../lib/format'

const form = formByCode('form2_7')

/**
 * Las URLs de Indeed son larguísimas y llevan parámetros codificados, así que se
 * muestran como enlaces numerados en vez de texto crudo.
 */
function NumberedLinks({ urls, label }: { urls: (string | null)[]; label: string }) {
  const links = urls
    .map((url, index) => ({ href: toHref(url), index: index + 1 }))
    .filter((link) => link.href)

  if (links.length === 0) return <Dash />

  return (
    <div className="flex flex-wrap gap-2">
      {links.map((link) => (
        <a
          key={link.index}
          href={link.href!}
          target="_blank"
          rel="noreferrer"
          className="text-sm font-medium whitespace-nowrap text-blue-600 hover:text-blue-700 hover:underline"
        >
          {label} {link.index}
        </a>
      ))}
    </div>
  )
}

/**
 * Los puestos y compañías se capturan como texto multilínea. No se parsean a
 * campos separados: el formato lo escribe el alumno a mano y no es confiable.
 */
function MultilineCell({ value }: { value: string | null }) {
  if (!value) return <Dash />
  return (
    <p className="line-clamp-3 max-w-80 whitespace-pre-line text-slate-600">{value}</p>
  )
}

const columns: Column<IndeedRow>[] = [
  ...studentColumns<IndeedRow>(),
  {
    key: 'positions',
    header: 'Puestos',
    width: 'min-w-80',
    render: (row) => <MultilineCell value={row.positions} />,
  },
  {
    key: 'positionUrls',
    header: 'Vacantes',
    render: (row) => <NumberedLinks urls={row.positionUrls} label="Vacante" />,
  },
  {
    key: 'companies',
    header: 'Compañías',
    width: 'min-w-80',
    render: (row) => <MultilineCell value={row.companies} />,
  },
  {
    key: 'companyUrls',
    header: 'Perfiles',
    render: (row) => <NumberedLinks urls={row.companyUrls} label="Perfil" />,
  },
  ...academicColumns<IndeedRow>(),
]

export function IndeedPage() {
  return (
    <FormPage
      form={form}
      columns={columns}
      useRows={(filters: PanelFilters) =>
        useRepositoryQuery(() => repository.getIndeed(filters), [], [filters])
      }
      renderDetail={(row) => (
        <div className="space-y-4 text-sm">
          <div>
            <p className="text-xs text-slate-500">Puestos investigados</p>
            <p className="mt-1 whitespace-pre-line text-slate-700">
              {row.positions || '—'}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Compañías investigadas</p>
            <p className="mt-1 whitespace-pre-line text-slate-700">
              {row.companies || '—'}
            </p>
          </div>
        </div>
      )}
    />
  )
}
