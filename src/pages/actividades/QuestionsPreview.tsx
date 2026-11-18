import {
  DEMOGRAPHICS_FORM,
  isWeeklyActivity,
  localizeWeeklyForm,
  weeklyFormByCode,
  type ActivityFormCode,
} from '../../lib/catalog'
import type { Lang } from '../../lib/i18n'
import { pick, portalFormByCode, type PortalFieldType } from '../../lib/portalForms'

/** Una pregunta como la ve el alumno, con su tipo y sus opciones. */
interface PreviewQuestion {
  label: string
  help?: string
  type: string
  options?: string[]
  optional?: boolean
  condition?: string
}

interface PreviewSection {
  title?: string
  questions: PreviewQuestion[]
}

const TYPE_LABELS: Record<PortalFieldType, string> = {
  opcion: 'Una opción',
  numero: 'Número',
  texto: 'Texto',
  liga: 'Liga',
  parrafo: 'Texto largo',
  varias: 'Varias opciones',
  escala: 'Escala 1–10',
  nivel: 'Novato … Experto',
  sino: 'Sí / No',
  correo: 'Correo',
  fecha: 'Fecha',
  telefono: 'Teléfono',
}

const DEMOGRAPHICS_TYPES = {
  texto: 'Texto',
  correo: 'Correo',
  fecha: 'Fecha',
  opcion: 'Una opción',
} as const

/** Las preguntas de cualquier formulario del portal, en el idioma dado. */
function previewOf(formCode: ActivityFormCode, lang: Lang): PreviewSection[] | null {
  const portal = portalFormByCode(formCode)
  if (portal) {
    const labels = new Map(
      portal.sections.flatMap((section) =>
        section.fields.map((field) => [field.key, pick(field.label, lang)] as const),
      ),
    )
    return portal.sections.map((section) => ({
      title: section.title ? pick(section.title, lang) : undefined,
      questions: section.fields.map((field) => {
        const parent = field.showIf ? labels.get(field.showIf.key) : undefined
        const value = field.showIf?.value === 'si' ? 'Sí' : field.showIf?.value
        return {
          label: pick(field.label, lang),
          help: field.help ? pick(field.help, lang) : undefined,
          type: TYPE_LABELS[field.type],
          // En el 1.4 los cinco niveles se repiten en cada habilidad: van en el tipo.
          options:
            field.type === 'nivel' ? undefined : field.options?.map((item) => pick(item.label, lang)),
          optional: field.optional,
          condition: parent ? `Solo si «${parent}» es «${value}»` : undefined,
        }
      }),
    }))
  }
  if (formCode === 'form1_0') {
    return [
      {
        questions: DEMOGRAPHICS_FORM.fields.map((field) => ({
          label: lang === 'en' ? field.en.label : field.label,
          help: (lang === 'en' ? field.en.help : field.help) || undefined,
          type: DEMOGRAPHICS_TYPES[field.type],
        })),
      },
    ]
  }
  if (isWeeklyActivity(formCode)) {
    const form = localizeWeeklyForm(weeklyFormByCode(formCode), lang)
    return [
      {
        questions: form.fields.map((field) => ({
          label: field.label,
          help: field.help || undefined,
          type: field.type === 'numero' ? 'Número' : 'Texto largo',
          optional: field.required === false,
        })),
      },
    ]
  }
  return null
}

/**
 * Las preguntas de la actividad, a la derecha del editor: lo que va a
 * contestar el alumno, en el idioma del grupo (así las ve él).
 */
export function QuestionsPreview({ formCode, lang }: { formCode: ActivityFormCode; lang: Lang }) {
  const sections = previewOf(formCode, lang)
  if (!sections) return null
  const total = sections.reduce((sum, section) => sum + section.questions.length, 0)

  return (
    <aside className="rounded-xl border border-ink-200 bg-white shadow-sm xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] xl:overflow-y-auto">
      <div className="border-b border-ink-100 px-5 py-4">
        <h2 className="text-sm font-semibold text-ink-900">Preguntas</h2>
        <p className="mt-0.5 text-xs text-ink-500">
          {total} {total === 1 ? 'pregunta' : 'preguntas'}, como las ve el alumno
          {lang === 'en' ? ' (grupo de Inglés)' : ''}.
        </p>
      </div>
      <ol className="divide-y divide-ink-100">
        {sections.map((section, sectionIndex) => (
          <li key={sectionIndex}>
            {section.title && (
              <p className="bg-ink-50 px-5 py-2 text-[11px] font-semibold tracking-wider text-ink-500 uppercase">
                {section.title}
              </p>
            )}
            <ul className="divide-y divide-ink-100">
              {section.questions.map((question, index) => (
                <li key={index} className="px-5 py-3">
                  <p className="text-sm text-ink-900">
                    {question.label}
                    {!question.optional && <span className="ml-1 text-red-700">*</span>}
                  </p>
                  {question.help && <p className="mt-0.5 text-xs text-ink-500">{question.help}</p>}
                  <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-ink-500">
                    <span className="rounded bg-ink-100 px-1.5 py-0.5 font-medium text-ink-600">
                      {question.type}
                    </span>
                    {question.optional && <span>Opcional</span>}
                    {question.condition && <span>{question.condition}</span>}
                  </p>
                  {question.options && (
                    <ul className="mt-1.5 space-y-0.5 text-xs text-ink-600">
                      {question.options.map((option) => (
                        <li key={option} className="flex gap-1.5">
                          <span aria-hidden="true" className="text-ink-300">
                            ○
                          </span>
                          {option}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </aside>
  )
}
