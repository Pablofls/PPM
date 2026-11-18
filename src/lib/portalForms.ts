import type { Lang } from './i18n'

/**
 * Los formularios del Módulo 1 que el alumno contesta en su portal (`0054`):
 * 1.1–1.5. Antes eran Google Forms con una rama en español y otra en inglés;
 * aquí cada pregunta trae los dos textos y el portal muestra el del idioma
 * del grupo (`useLang`). Ya no se pregunta el idioma ni el correo.
 *
 * La `key` de cada campo es la columna de su tabla (`holland_results`,
 * `mbti_results`…), así el repositorio arma la entrega y lee las anteriores
 * sin una segunda lista. En el 1.5 `top_values` son códigos de `human_values`.
 *
 * El 1.0 Datos Demográficos tiene su propia página (`DemographicsActivityPage`).
 */

export type PortalFormCode = 'form1_1' | 'form1_2' | 'form1_3' | 'form1_4' | 'form1_5'

export interface Text {
  es: string
  en: string
}

export interface PortalOption {
  value: string
  label: Text
}

export type PortalFieldType =
  /** Una opción de una lista. */
  | 'opcion'
  /** Número entero entre `min` y `max`. */
  | 'numero'
  | 'texto'
  /** Liga (URL) a un reporte. */
  | 'liga'
  /** Texto largo. */
  | 'parrafo'
  /** Varias opciones (casillas). */
  | 'varias'
  /** Escala 1–10. */
  | 'escala'
  /** Nivel de dominio de una habilidad (1.4). */
  | 'nivel'
  | 'sino'

export interface PortalField {
  key: string
  type: PortalFieldType
  label: Text
  help?: Text
  options?: PortalOption[]
  min?: number
  max?: number
  /** Ocupa las dos columnas del formulario. */
  wide?: boolean
}

/** Un bloque de preguntas con su título (en el 1.4, cada grupo de habilidades). */
export interface PortalSection {
  title?: Text
  description?: Text
  fields: PortalField[]
}

export interface PortalFormMeta {
  code: PortalFormCode
  /** «1.1» */
  label: string
  /** Ruta en el portal, debajo de Actividades. */
  slug: string
  name: Text
  subtitle: Text
  instructions: { es: string[]; en: string[] }
  sections: PortalSection[]
}

export type PortalValues = Record<string, string | string[]>

const t = (es: string, en: string): Text => ({ es, en })

export const pick = (text: Text, lang: Lang) => (lang === 'en' ? text.en : text.es)

// ---------------------------------------------------------------------------
// Catálogos de opciones
// ---------------------------------------------------------------------------

/** RIASEC, en el orden del formulario original. */
const HOLLAND_OPTIONS: PortalOption[] = [
  { value: 'R', label: t('R (Realista)', 'R (Realistic)') },
  { value: 'A', label: t('A (Artística)', 'A (Artistic)') },
  { value: 'I', label: t('I (Investigadora)', 'I (Investigative)') },
  { value: 'S', label: t('S (Social)', 'S (Social)') },
  { value: 'E', label: t('E (Emprendedora)', 'E (Enterprising)') },
  { value: 'C', label: t('C (Convencional)', 'C (Conventional)') },
]

/** Los 16 tipos con su nombre en 16Personalities. */
const MBTI_OPTIONS: PortalOption[] = (
  [
    ['INTJ', 'Arquitecto', 'Architect'],
    ['INTP', 'Lógico', 'Logician'],
    ['ENTJ', 'Comandante', 'Commander'],
    ['ENTP', 'Innovador', 'Debater'],
    ['INFJ', 'Abogado', 'Advocate'],
    ['INFP', 'Mediador', 'Mediator'],
    ['ENFJ', 'Protagonista', 'Protagonist'],
    ['ENFP', 'Activista', 'Campaigner'],
    ['ISTJ', 'Logista', 'Logistician'],
    ['ISFJ', 'Defensor', 'Defender'],
    ['ESTJ', 'Ejecutivo', 'Executive'],
    ['ESFJ', 'Cónsul', 'Consul'],
    ['ISTP', 'Virtuoso', 'Virtuoso'],
    ['ISFP', 'Aventurero', 'Adventurer'],
    ['ESTP', 'Emprendedor', 'Entrepreneur'],
    ['ESFP', 'Animador', 'Entertainer'],
  ] as const
).map(([value, es, en]) => ({ value, label: t(`${value} - ${es}`, `${value} - ${en}`) }))

const option = (value: string, es: string, en: string): PortalOption => ({ value, label: t(es, en) })

/** Los diez valores de `human_values` (0054), en su orden. */
export const HUMAN_VALUE_OPTIONS: PortalOption[] = [
  option('benevolencia', 'Benevolencia', 'Benevolence'),
  option('universalidad', 'Universalidad', 'Universalism'),
  option('seguridad', 'Seguridad', 'Security'),
  option('logro', 'Logro', 'Achievement'),
  option('hedonismo', 'Hedonismo', 'Hedonism'),
  option('estimulacion', 'Estimulación', 'Stimulation'),
  option('poder', 'Poder', 'Power'),
  option('autonomia', 'Autonomía', 'Self-direction'),
  option('tradicion', 'Tradición', 'Tradition'),
  option('conformidad', 'Conformidad', 'Conformity'),
]

/** El enum `skill_level`, con la descripción del formulario original. */
export const SKILL_LEVEL_OPTIONS: (PortalOption & { help: Text })[] = [
  {
    value: 'novato',
    label: t('Novato', 'Novice'),
    help: t('Poca o ninguna experiencia o conocimiento.', 'Little to no experience or knowledge.'),
  },
  {
    value: 'principiante',
    label: t('Principiante', 'Beginner'),
    help: t('Algún conocimiento básico, pero requiere orientación.', 'Some basic knowledge, but requires guidance.'),
  },
  {
    value: 'intermedio',
    label: t('Intermedio', 'Intermediate'),
    help: t('Competente y puede realizar tareas de forma independiente.', 'Competent and can perform tasks independently.'),
  },
  {
    value: 'avanzado',
    label: t('Avanzado', 'Advanced'),
    help: t('Altamente habilidoso y puede manejar tareas complejas con facilidad.', 'Highly skilled and can handle complex tasks with ease.'),
  },
  {
    value: 'experto',
    label: t('Experto', 'Expert'),
    help: t('Nivel de dominio, puede enseñar y guiar a otros.', 'Mastery level; can teach and guide others.'),
  },
]

const YES_NO: PortalOption[] = [option('si', 'Sí', 'Yes'), option('no', 'No', 'No')]

const skill = (key: string, es: string, en: string): PortalField => ({
  key,
  type: 'nivel',
  label: t(es, en),
  options: SKILL_LEVEL_OPTIONS,
})

const score = (key: string, es: string, en: string, example: number): PortalField => ({
  key,
  type: 'numero',
  min: 0,
  max: 999,
  label: t(es, en),
  help: t(
    `En el reporte dice algo como «Tu puntuación en este apartado es de ${example} puntos»: escribe ${example}.`,
    `The report says something like "Your score in this section is ${example} points": enter ${example}.`,
  ),
})

const pct = (key: string, es: string, en: string): PortalField => ({
  key,
  type: 'numero',
  min: 0,
  max: 100,
  label: t(`${es} (%)`, `${en} (%)`),
})

// ---------------------------------------------------------------------------
// Los cinco formularios
// ---------------------------------------------------------------------------

export const PORTAL_FORMS: PortalFormMeta[] = [
  {
    code: 'form1_1',
    label: '1.1',
    slug: 'intereses',
    name: t('Intereses Profesionales', 'Professional Interests'),
    subtitle: t('Tus resultados del Test de Intereses de Holland', 'Your Holland Interest Test results'),
    instructions: {
      es: [
        'Contesta con los resultados de tu Test de Intereses de Holland. Revisa el gráfico y el reporte.',
        'Si te equivocas, vuelve a entregarlo: tu profesor ve siempre la entrega más reciente.',
      ],
      en: [
        'Answer with the results of your Holland Interest Test. Check the chart and the report.',
        'If you make a mistake, submit it again: your professor always sees your latest submission.',
      ],
    },
    sections: [
      {
        fields: [
          {
            key: 'first_type',
            type: 'opcion',
            options: HOLLAND_OPTIONS,
            label: t('¿Cuál es tu personalidad con el puntaje más alto?', 'What is your personality with the highest score?'),
          },
          score('first_score', 'Puntuación de esa área', 'Score for that area', 14),
          {
            key: 'second_type',
            type: 'opcion',
            options: HOLLAND_OPTIONS,
            label: t('¿Cuál es tu personalidad con el segundo puntaje más alto?', 'What is your personality with the second highest score?'),
          },
          score('second_score', 'Puntuación de esa área', 'Score for that area', 11),
          {
            key: 'third_type',
            type: 'opcion',
            options: HOLLAND_OPTIONS,
            label: t('¿Cuál es tu personalidad con el tercer puntaje más alto?', 'What is your personality with the third highest score?'),
          },
          score('third_score', 'Puntuación de esa área', 'Score for that area', 10),
          {
            key: 'holland_code',
            type: 'texto',
            label: t('¿Cuál es tu código Holland?', 'What is your Holland code?'),
            help: t(
              'Las iniciales de tus tres áreas principales, en mayúsculas. Letras posibles: RAISEC. Ejemplo: RIC.',
              'The initials of your three main areas, in uppercase. Possible letters: RAISEC. Example: RIC.',
            ),
          },
        ],
      },
    ],
  },
  {
    code: 'form1_2',
    label: '1.2',
    slug: 'personalidad',
    name: t('Personalidad', 'Personality'),
    subtitle: t('Tu perfil de 16Personalities', 'Your 16Personalities profile'),
    instructions: {
      es: [
        'Contesta con la información de tu perfil de 16Personalities.',
        'Si te equivocas, vuelve a entregarlo: tu profesor ve siempre la entrega más reciente.',
      ],
      en: [
        'Answer with the information from your 16Personalities profile.',
        'If you make a mistake, submit it again: your professor always sees your latest submission.',
      ],
    },
    sections: [
      {
        fields: [
          {
            key: 'report_url',
            type: 'liga',
            wide: true,
            label: t('Link de tu perfil', 'Link to your profile'),
            help: t(
              'Usa la opción «Compartir perfil» de 16Personalities y pega aquí el link.',
              'Use the "Share profile" option on 16Personalities and paste the link here.',
            ),
          },
          {
            key: 'mbti_type',
            type: 'opcion',
            options: MBTI_OPTIONS,
            label: t('Tu personalidad', 'Your personality'),
            help: t('Según el reporte de tu perfil.', 'As shown in your profile report.'),
          },
          {
            key: 'identity',
            type: 'opcion',
            options: [option('asertivo', 'A - Asertivo', 'A - Assertive'), option('cauteloso', 'T - Cauteloso', 'T - Turbulent')],
            label: t('Identidad', 'Identity'),
          },
        ],
      },
      {
        title: t('Características de la personalidad I', 'Personality traits I'),
        description: t(
          'El número del porcentaje de cada característica. Ejemplo: «Energía: 60% Introvertido», escribe 60.',
          'The percentage of each trait. Example: "Energy: 60% Introverted", enter 60.',
        ),
        fields: [
          pct('energy_pct', 'Energía', 'Energy'),
          pct('mind_pct', 'Mente', 'Mind'),
          pct('nature_pct', 'Naturaleza', 'Nature'),
          pct('tactics_pct', 'Tácticas', 'Tactics'),
          pct('identity_pct', 'Identidad', 'Identity'),
        ],
      },
      {
        title: t('Características de la personalidad II', 'Personality traits II'),
        description: t('Elige la característica de tu personalidad.', 'Choose your personality trait.'),
        fields: [
          {
            key: 'energy',
            type: 'opcion',
            options: [option('extravertido', 'Extravertido', 'Extraverted'), option('introvertido', 'Introvertido', 'Introverted')],
            label: t('Energía', 'Energy'),
          },
          {
            key: 'mind',
            type: 'opcion',
            options: [option('intuitivo', 'Intuitivo', 'Intuitive'), option('observador', 'Observador', 'Observant')],
            label: t('Mente', 'Mind'),
          },
          {
            key: 'nature',
            type: 'opcion',
            options: [option('pensamiento', 'Pensamiento', 'Thinking'), option('emocional', 'Emocional', 'Feeling')],
            label: t('Naturaleza', 'Nature'),
          },
          {
            key: 'tactics',
            type: 'opcion',
            options: [option('juzgador', 'Juzgador', 'Judging'), option('prospeccion', 'Prospección', 'Prospecting')],
            label: t('Tácticas', 'Tactics'),
          },
        ],
      },
    ],
  },
  {
    code: 'form1_3',
    label: '1.3',
    slug: 'estilos-de-comportamiento',
    name: t('Estilos de Comportamiento', 'Behavioral Styles'),
    subtitle: t('Tu estilo DISC', 'Your DISC style'),
    instructions: {
      es: [
        'Contesta con la información de tu reporte DISC. Asegúrate de estar en la pestaña correcta.',
        'Si te equivocas, vuelve a entregarlo: tu profesor ve siempre la entrega más reciente.',
      ],
      en: [
        'Answer with the information from your DISC report. Make sure you are on the correct tab.',
        'If you make a mistake, submit it again: your professor always sees your latest submission.',
      ],
    },
    sections: [
      {
        fields: [
          {
            key: 'disc_style',
            type: 'texto',
            label: t('Letras de tu estilo DISC (Your DISC Style)', 'Your DISC Style'),
            help: t(
              'Escríbelo tal cual aparece en tu reporte, con mayúsculas y minúsculas. Ejemplo: Dc.',
              'Type it exactly as it appears in your report, with uppercase and lowercase letters. Example: Dc.',
            ),
          },
          {
            key: 'disc_category',
            type: 'texto',
            label: t('Tu categoría DISC', 'Your DISC category'),
          },
          {
            key: 'explanation',
            type: 'parrafo',
            wide: true,
            label: t('¿Te identificas con tu estilo?', 'Do you identify with your style?'),
            help: t(
              'Lee las pestañas Report y Style Overview. Contesta sí o no y justifica por qué.',
              'Read the Report and Style Overview tabs. Answer yes or no and explain why.',
            ),
          },
        ],
      },
    ],
  },
  {
    code: 'form1_4',
    label: '1.4',
    slug: 'habilidades',
    name: t('Habilidades', 'Skills'),
    subtitle: t('Tu autoevaluación de habilidades', 'Your skills self-assessment'),
    instructions: {
      es: [
        'Califica tu dominio en cada habilidad con la escala. Sé honesto: así podrás priorizar en tu plan de carrera las habilidades que necesitas desarrollar.',
        'Novato: poca o ninguna experiencia. Principiante: algo básico, requiere orientación. Intermedio: trabaja de forma independiente. Avanzado: maneja tareas complejas con facilidad. Experto: puede enseñar y guiar a otros.',
      ],
      en: [
        'Rate your mastery of each skill using the scale. Be honest: it will help you prioritize the skills you need to develop in your career plan.',
        'Novice: little to no experience. Beginner: some basics, needs guidance. Intermediate: works independently. Advanced: handles complex tasks with ease. Expert: can teach and guide others.',
      ],
    },
    sections: [
      {
        title: t('Comunicación', 'Communication'),
        fields: [
          skill('written_communication', 'Comunicación escrita', 'Written communication'),
          skill('verbal_communication', 'Comunicación verbal', 'Verbal communication'),
          skill('nonverbal_communication', 'Comunicación no verbal', 'Non-verbal communication'),
        ],
      },
      {
        title: t('Habilidades interpersonales', 'Interpersonal skills'),
        fields: [
          skill('collaboration_teamwork', 'Colaboración y trabajo en equipo', 'Collaboration and teamwork'),
          skill('leadership', 'Liderazgo', 'Leadership'),
          skill('conflict_resolution', 'Resolución de conflictos', 'Conflict resolution'),
          skill('negotiation', 'Negociación', 'Negotiation'),
          skill('active_listening', 'Escucha activa', 'Active listening'),
          skill('empathy', 'Empatía y compasión', 'Empathy and compassion'),
          skill('customer_service', 'Servicio al cliente', 'Customer service'),
        ],
      },
      {
        title: t('Habilidades técnicas', 'Technical skills'),
        fields: [
          skill('excel', 'Microsoft Excel', 'Microsoft Excel'),
          skill('sheets', 'Google Sheets', 'Google Sheets'),
          skill('word', 'Microsoft Word', 'Microsoft Word'),
          skill('docs', 'Google Docs', 'Google Docs'),
          skill('powerpoint', 'Microsoft PowerPoint', 'Microsoft PowerPoint'),
          skill('slides', 'Google Slides', 'Google Slides'),
          skill('chatgpt', 'ChatGPT', 'ChatGPT'),
          skill('gemini', 'Google Gemini', 'Google Gemini'),
          skill('programming', 'Lenguaje de programación', 'Programming'),
        ],
      },
      {
        title: t('Habilidades empresariales', 'Business skills'),
        fields: [
          skill('critical_thinking', 'Pensamiento crítico y resolución de problemas', 'Critical thinking and problem solving'),
          skill('decision_making', 'Toma de decisiones', 'Decision making'),
          skill('time_management', 'Administración del tiempo y priorización', 'Time management and prioritization'),
          skill('planning_organization', 'Planeación y organización', 'Planning and organization'),
          skill('research_analysis', 'Análisis e investigación', 'Research and analysis'),
          skill('creativity_innovation', 'Creatividad e innovación', 'Creativity and innovation'),
          skill('flexibility_adaptability', 'Flexibilidad y adaptabilidad', 'Flexibility and adaptability'),
          skill('work_ethic', 'Ética de trabajo y profesionalismo', 'Work ethic and professionalism'),
        ],
      },
      {
        title: t('Otras habilidades', 'Other skills'),
        fields: [
          skill('financial_literacy', 'Educación financiera', 'Financial literacy'),
          skill('project_management', 'Administración de proyectos', 'Project management'),
          skill('learning_ability', 'Habilidad para aprender', 'Ability to learn'),
          skill('emotional_intelligence', 'Inteligencia emocional', 'Emotional intelligence'),
          skill('networking', 'Networking', 'Networking'),
          skill('sales', 'Ventas', 'Sales'),
        ],
      },
      {
        title: t('Información personal', 'Personal information'),
        fields: [
          {
            key: 'is_pefista_graduating',
            type: 'sino',
            options: YES_NO,
            label: t('¿Eres PEFista y te gradúas este semestre?', 'Are you a PEF student graduating this semester?'),
          },
        ],
      },
    ],
  },
  {
    code: 'form1_5',
    label: '1.5',
    slug: 'valores',
    name: t('Valores', 'Values'),
    subtitle: t('Tus resultados del Test de Valores Humanos', 'Your Human Values Test results'),
    instructions: {
      es: [
        'Contesta con los resultados de tu Test de Valores Humanos (IDRlabs).',
        'Si te equivocas, vuelve a entregarlo: tu profesor ve siempre la entrega más reciente.',
      ],
      en: [
        'Answer with the results of your Human Values Test (IDRlabs).',
        'If you make a mistake, submit it again: your professor always sees your latest submission.',
      ],
    },
    sections: [
      {
        fields: [
          {
            key: 'report_url',
            type: 'liga',
            wide: true,
            label: t('Link de tu assessment', 'Link to your assessment'),
          },
          {
            key: 'top_values',
            type: 'varias',
            wide: true,
            options: HUMAN_VALUE_OPTIONS,
            label: t('¿Cuáles son tus valores más fuertes?', 'Which are your strongest values?'),
            help: t(
              'Los que dice tu resultado: «Tus valores más fuertes son…». Marca todos los que correspondan.',
              'The ones in your result: "Your strongest values are…". Check all that apply.',
            ),
          },
          {
            key: 'score',
            type: 'escala',
            min: 1,
            max: 10,
            wide: true,
            label: t('Tu puntuación según el assessment', 'Your score according to the assessment'),
            help: t(
              'Del 1 al 10, según los anillos del gráfico de tus resultados.',
              'From 1 to 10, according to the rings of your results chart.',
            ),
          },
        ],
      },
    ],
  },
]

export const PORTAL_FORM_CODES = PORTAL_FORMS.map((form) => form.code)

export const portalFormByCode = (code: string): PortalFormMeta | undefined =>
  PORTAL_FORMS.find((form) => form.code === code)

export const portalFormBySlug = (slug: string): PortalFormMeta | undefined =>
  PORTAL_FORMS.find((form) => form.slug === slug)

export const portalFormPath = (form: PortalFormMeta) => `/alumno/actividades/${form.slug}`

export const allFields = (form: PortalFormMeta): PortalField[] =>
  form.sections.flatMap((section) => section.fields)

/** ¿Está contestado este campo? Todas las preguntas son obligatorias. */
export function isAnswered(field: PortalField, value: string | string[] | undefined): boolean {
  if (field.type === 'varias') return Array.isArray(value) && value.length > 0
  if (typeof value !== 'string' || value.trim() === '') return false
  if (field.type === 'numero' || field.type === 'escala') {
    const number = Number(value)
    return Number.isInteger(number) && number >= (field.min ?? 0) && number <= (field.max ?? Infinity)
  }
  return true
}

/** Lo contestado, legible: la etiqueta de la opción, «Sí», la lista de valores. */
export function displayAnswer(field: PortalField, value: string | string[] | undefined, lang: Lang): string {
  if (value === undefined) return ''
  const labelOf = (raw: string) => {
    const found = field.options?.find((item) => item.value === raw)
    return found ? pick(found.label, lang) : raw
  }
  if (Array.isArray(value)) return value.map(labelOf).join(', ')
  if (field.options) return labelOf(value)
  return value
}
