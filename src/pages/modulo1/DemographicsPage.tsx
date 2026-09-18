import { Dash, LanguageBadge } from '../../components/Badge'
import type { Column } from '../../components/DataTable'
import { FormPage } from '../../components/FormPage'
import { useRepositoryQuery } from '../../data/hooks'
import { repository } from '../../data/repository'
import type { DemographicsRow, PanelFilters } from '../../data/types'
import { formByCode } from '../../lib/catalog'
import { formatDate, formatGender, formatSemester, formatSessionDay } from '../../lib/format'

const form = formByCode('form1_0')

/**
 * 1.0 Datos Demográficos.
 *
 * Es la única pantalla que define sus columnas completas en vez de reutilizar
 * `studentColumns()`: el orden replica exactamente el de la plataforma actual en
 * Apps Script, con la matrícula en segundo lugar.
 */
const columns: Column<DemographicsRow>[] = [
  {
    key: 'fullName',
    header: 'Nombre',
    width: 'min-w-52',
    sticky: true,
    render: (row) =>
      row.fullName ? (
        <span className="font-medium text-brand-700">{row.fullName}</span>
      ) : (
        <Dash />
      ),
  },
  {
    key: 'studentNumber',
    header: 'Matrícula',
    render: (row) => row.studentNumber ?? <Dash />,
  },
  {
    key: 'institutionalEmail',
    header: 'Correo Institucional',
    width: 'min-w-56',
    render: (row) => (
      <span className="block max-w-56 truncate" title={row.institutionalEmail}>
        {row.institutionalEmail}
      </span>
    ),
  },
  {
    key: 'language',
    header: 'Idioma',
    render: (row) => <LanguageBadge value={row.language} />,
  },
  {
    key: 'personalEmail',
    header: 'Correo Personal',
    width: 'min-w-56',
    render: (row) =>
      row.personalEmail ? (
        <span className="block max-w-56 truncate" title={row.personalEmail}>
          {row.personalEmail}
        </span>
      ) : (
        <Dash />
      ),
  },
  {
    key: 'birthDate',
    header: 'Fecha Nacimiento',
    render: (row) => formatDate(row.birthDate) || <Dash />,
  },
  {
    key: 'birthCountry',
    // Texto libre en el origen: hay 'Mexico', 'MEXICO', 'MX'. No se normaliza.
    header: 'País Nacimiento',
    render: (row) => row.birthCountry ?? <Dash />,
  },
  {
    key: 'gender',
    header: 'Sexo',
    render: (row) => formatGender(row.gender) || <Dash />,
  },
  {
    key: 'sessionDay',
    header: 'Frecuencia',
    render: (row) => formatSessionDay(row.sessionDay) || <Dash />,
  },
  {
    key: 'degreeCode',
    header: 'Carrera',
    render: (row) => row.degreeCode ?? <Dash />,
  },
  {
    key: 'semester',
    header: 'Semestre',
    render: (row) => formatSemester(row.semester) || <Dash />,
  },
  {
    key: 'periodCode',
    header: 'Período',
    render: (row) => row.periodCode ?? <Dash />,
  },
]

export function DemographicsPage() {
  return (
    <FormPage
      form={form}
      columns={columns}
      useRows={(filters: PanelFilters) =>
        useRepositoryQuery(() => repository.getDemographics(filters), [], [filters])
      }
    />
  )
}
