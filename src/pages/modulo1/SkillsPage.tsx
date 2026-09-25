import { useState } from 'react'

import { Badge, Dash } from '../../components/Badge'
import type { Column } from '../../components/DataTable'
import { Select } from '../../components/FilterBar'
import { FormPage, studentColumns, submittedAtColumn } from '../../components/FormPage'
import { useRepositoryQuery } from '../../data/hooks'
import { repository } from '../../data/repository'
import type { PanelFilters, SkillsRow } from '../../data/types'
import {
  formByCode,
  SKILL_GROUPS,
  SKILL_LEVEL_LABELS,
  type SkillLevel,
} from '../../lib/catalog'

const form = formByCode('form1_4')

/** Un color por nivel, de menor a mayor dominio. */
const LEVEL_TONES: Record<SkillLevel, 'neutral' | 'red' | 'amber' | 'blue' | 'green'> = {
  novato: 'neutral',
  principiante: 'red',
  intermedio: 'amber',
  avanzado: 'blue',
  experto: 'green',
}

function SkillLevelBadge({ value }: { value: SkillLevel | null | undefined }) {
  if (!value) return <Dash />
  return <Badge tone={LEVEL_TONES[value]}>{SKILL_LEVEL_LABELS[value]}</Badge>
}

/**
 * 1.4 Formulario de Habilidades.
 *
 * Las 33 habilidades no caben a lo ancho, así que la pantalla muestra un grupo a
 * la vez. Nombre, correo, idioma y "PEF y graduando" quedan fijos en todos los
 * grupos.
 */
export function SkillsPage() {
  const [groupId, setGroupId] = useState(SKILL_GROUPS[0].id)
  const group = SKILL_GROUPS.find((candidate) => candidate.id === groupId) ?? SKILL_GROUPS[0]

  const columns: Column<SkillsRow>[] = [
    ...studentColumns<SkillsRow>(),
    {
      key: 'isPefistaGraduating',
      header: 'PEF y graduando',
      render: (row) =>
        row.isPefistaGraduating === null ? (
          <Dash />
        ) : (
          <Badge tone={row.isPefistaGraduating ? 'green' : 'neutral'}>
            {row.isPefistaGraduating ? 'Sí' : 'No'}
          </Badge>
        ),
    },
    ...group.skills.map<Column<SkillsRow>>((skill) => ({
      key: skill.key,
      header: skill.label,
      render: (row) => <SkillLevelBadge value={row.skills[skill.key]} />,
    })),
    ...submittedAtColumn<SkillsRow>(),
  ]

  return (
    <FormPage
      form={form}
      columns={columns}
      useRows={(filters: PanelFilters) =>
        useRepositoryQuery(() => repository.getSkills(filters), [], [filters])
      }
      filterControls={
        <Select
          label="Grupo de habilidades"
          value={groupId}
          options={SKILL_GROUPS.map((candidate) => ({
            value: candidate.id,
            label: candidate.label,
          }))}
          onChange={(value) => setGroupId(value || SKILL_GROUPS[0].id)}
        />
      }
    />
  )
}
