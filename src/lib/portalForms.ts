import { formatDate } from './format'
import type { Lang } from './i18n'

/**
 * Los formularios que el alumno contesta en su portal: Módulo 1 (1.1–1.5,
 * `0054`) y Módulo 2 (2.1, 2.2, 2.4, 2.5 y 2.7, `0055`). Antes eran Google Forms con una rama en español y otra en inglés;
 * aquí cada pregunta trae los dos textos y el portal muestra el del idioma
 * del grupo (`useLang`). Ya no se pregunta el idioma ni el correo.
 *
 * La `key` de cada campo es la columna de su tabla (`holland_results`,
 * `mbti_results`…), así el repositorio arma la entrega y lee las anteriores
 * sin una segunda lista. En el 1.5 `top_values` son códigos de `human_values`.
 * En el 2.7 las llaves son planas (`position_1_title`, `company_2_url`…) y el
 * repositorio las arma en filas de `indeed_positions` / `indeed_companies`.
 *
 * El 1.0 Datos Demográficos tiene su propia página (`DemographicsActivityPage`).
 */

export type PortalFormCode =
  | 'form1_1'
  | 'form1_2'
  | 'form1_3'
  | 'form1_4'
  | 'form1_5'
  | 'form2_1'
  | 'form2_2'
  | 'form2_4'
  | 'form2_5'
  | 'form2_7'
  | 'formA_1'
  | 'formB_1'

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
  | 'correo'
  | 'fecha'
  | 'telefono'

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
  /** No es obligatoria (todas lo son, salvo estas). */
  optional?: boolean
  /** Solo se pregunta si otra respuesta tiene ese valor (p. ej. LinkedIn = «sí»). */
  showIf?: { key: string; value: string }
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


// ---------------------------------------------------------------------------
// Módulo 2 (0055)
// ---------------------------------------------------------------------------

const SAME_AGAIN = {
  es: 'Si te equivocas, vuelve a entregarlo: tu profesor ve siempre la entrega más reciente.',
  en: 'If you make a mistake, submit it again: your professor always sees your latest submission.',
}

/** 2.1, 2.2, 2.4 y 2.5: ¿fue de utilidad? (sí/no) y por qué. Tabla `reflections`. */
function reflectionForm(
  code: PortalFormCode,
  label: string,
  slug: string,
  name: Text,
  subtitle: Text,
  question: Text,
): PortalFormMeta {
  return {
    code,
    label,
    slug,
    name,
    subtitle,
    instructions: {
      es: ['Cuéntanos qué tan útil fue esta actividad para ti.', SAME_AGAIN.es],
      en: ['Tell us how useful this activity was for you.', SAME_AGAIN.en],
    },
    sections: [
      {
        fields: [
          { key: 'was_useful', type: 'sino', options: YES_NO, wide: true, label: question },
          { key: 'reason', type: 'parrafo', wide: true, label: t('¿Por qué?', 'Explain why') },
        ],
      },
    ],
  }
}

const position = (n: number): PortalSection => ({
  title: t(`Puesto ${n}`, `Position ${n}`),
  fields: [
    { key: `position_${n}_title`, type: 'texto', label: t('Nombre del puesto', 'Position name') },
    {
      key: `position_${n}_salary`,
      type: 'numero',
      min: 0,
      max: 9_999_999,
      label: t('Sueldo mensual (pesos)', 'Monthly salary (pesos)'),
    },
    { key: `position_${n}_url`, type: 'liga', wide: true, label: t('Link de Indeed', 'Indeed link') },
  ],
})

const company = (n: number): PortalSection => ({
  title: t(`Compañía ${n}`, `Company ${n}`),
  fields: [
    { key: `company_${n}_name`, type: 'texto', label: t('Nombre de la compañía', 'Company name') },
    { key: `company_${n}_url`, type: 'liga', label: t('Link de Indeed', 'Indeed link') },
  ],
})

PORTAL_FORMS.push(
  reflectionForm(
    'form2_1',
    '2.1',
    'habilidades-profesionales',
    t('Habilidades Profesionales y de Carrera', 'Professional and Career Skills'),
    t('Tu reflexión sobre la actividad', 'Your reflection on the activity'),
    t(
      '¿La realización de esta actividad fue de utilidad para entender cómo empezar a tomar responsabilidad de tu desarrollo profesional y de carrera?',
      'Was completing this activity helpful in understanding how to start taking responsibility for your professional and career development?',
    ),
  ),
  reflectionForm(
    'form2_2',
    '2.2',
    'cv',
    t('CV', 'Resume'),
    t('Tu reflexión sobre la elaboración de tu CV', 'Your reflection on writing your resume'),
    t(
      '¿Los videos de esta actividad fueron de utilidad para hacer o mejorar tu CV?',
      'Were the videos in this activity helpful in creating or improving your resume?',
    ),
  ),
  reflectionForm(
    'form2_4',
    '2.4',
    'cover-letter',
    t('Carta de presentación', 'Cover Letter'),
    t('Tu reflexión sobre tu carta de presentación', 'Your reflection on your cover letter'),
    t(
      '¿Fueron útiles los recursos (videos y enlaces) para escribir tu carta de presentación?',
      'Were the resources (videos and links) helpful in writing your cover letter?',
    ),
  ),
  reflectionForm(
    'form2_5',
    '2.5',
    'elevator-pitch',
    t('Elevator Pitch', 'Elevator Pitch'),
    t('Tu reflexión sobre tu elevator pitch', 'Your reflection on your elevator pitch'),
    t(
      '¿Los recursos (videos y links) de esta actividad fueron de utilidad para redactar tu Elevator Pitch?',
      'Were the resources (videos and links) in this activity helpful in writing your Elevator Pitch?',
    ),
  ),
  {
    code: 'form2_7',
    label: '2.7',
    slug: 'indeed',
    name: t('Indeed', 'Indeed'),
    subtitle: t(
      'Los puestos y compañías que te gustaría al graduarte',
      'The positions and companies you would like after graduation',
    ),
    instructions: {
      es: [
        'Busca en Indeed los 3 puestos que te gustaría tener al graduarte, con su sueldo mensual y el link de cada vacante. Ejemplo: Coordinador de Mercadotecnia Digital, 35,000 pesos.',
        'Luego, las 3 compañías en las que te gustaría trabajar, en orden de preferencia, con el link de cada una en Indeed. Ejemplo: 1. Google, 2. Cemex, 3. Vitro.',
        SAME_AGAIN.es,
      ],
      en: [
        'Search Indeed for the 3 positions you would like to have after graduating, with their monthly salary and the link to each job posting. Example: Digital Marketing Coordinator, 35,000 pesos.',
        'Then, the 3 companies you would like to work for, in order of preference, with the Indeed link for each one. Example: 1. Google, 2. Cemex, 3. Vitro.',
        SAME_AGAIN.en,
      ],
    },
    sections: [position(1), position(2), position(3), company(1), company(2), company(3)],
  },
)

// ---------------------------------------------------------------------------
// Apéndices (0056)
// ---------------------------------------------------------------------------
// Las preguntas cerradas del A.1 guardan el texto en español de la opción
// (`value`), como las respuestas en español del Google Form.

const text = (key: string, es: string, en: string, extra: Partial<PortalField> = {}): PortalField => ({
  key,
  type: 'texto',
  label: t(es, en),
  ...extra,
})

const long = (key: string, es: string, en: string, extra: Partial<PortalField> = {}): PortalField => ({
  key,
  type: 'parrafo',
  wide: true,
  label: t(es, en),
  ...extra,
})

const TWO_YEARS = t(
  'La UDEM requiere que la empresa tenga más de 2 años de operación formal.',
  'UDEM requires that the company has more than 2 years of formal operation.',
)

PORTAL_FORMS.push(
  {
    code: 'formA_1',
    label: 'A.1',
    slug: 'autorizacion-de-practicas',
    name: t('Autorización de Prácticas Profesionales', 'Internship Authorization'),
    subtitle: t(
      'Para que tu profesor evalúe si tus prácticas cumplen con los requisitos de la UDEM',
      'So your professor can check whether your internship meets UDEM requirements',
    ),
    instructions: {
      es: [
        'Completa y entrega este formulario para que tu profesor evalúe si tus prácticas profesionales cumplen con los requisitos de la UDEM. No se autorizan prácticas sin el formulario debidamente llenado.',
        'Después, escríbele a tu profesor para que te responda si tus prácticas están autorizadas, si necesita más información o si hay que agendar una sesión para revisarla. Puedes descargar tu entrega en PDF.',
      ],
      en: [
        'Complete and submit this form so your professor can check whether your internship meets UDEM requirements. Internships are not authorized without this form properly completed.',
        'Then email your professor to find out whether your internship is authorized, whether more information is needed, or whether a review session must be scheduled. You can download your submission as a PDF.',
      ],
    },
    sections: [
      {
        title: t('Requisitos', 'Requirements'),
        fields: [
          {
            key: 'required_hours',
            type: 'numero',
            min: 0,
            max: 2000,
            label: t(
              '¿Cuál es el mínimo de horas que debo hacer en mis prácticas profesionales?',
              'What is the minimum number of hours I must complete in my professional internship?',
            ),
          },
          {
            key: 'internship_option',
            type: 'opcion',
            wide: true,
            label: t('Las prácticas profesionales pueden hacerse en:', 'Professional internships can be done in:'),
            options: [
              option('Lo que yo quiera', 'Lo que yo quiera', 'Wherever I want'),
              option(
                'Alineadas al programa académico de mi carrera',
                'Alineadas al programa académico de mi carrera',
                'Aligned with the academic program of my degree',
              ),
            ],
          },
          {
            key: 'restrictions',
            type: 'opcion',
            wide: true,
            label: t(
              '¿Cuál de las siguientes NO es una restricción para hacer prácticas profesionales en la UDEM?',
              'Which of the following is NOT a restriction for doing professional internships at UDEM?',
            ),
            options: [
              option('Negocios Familiares', 'Negocios familiares', 'Family businesses'),
              option('Negocios Personales', 'Negocios personales', 'Personal businesses'),
              option('Emprendimientos Personales', 'Emprendimientos personales', 'Personal entrepreneurship'),
              option(
                'Todas las anteriores son restricciones para realizar prácticas en la UDEM',
                'Todas las anteriores son restricciones para realizar prácticas en la UDEM',
                'All of the above are restrictions for completing internships at UDEM',
              ),
            ],
          },
        ],
      },
      {
        title: t('La empresa', 'The company'),
        fields: [
          text('company_name', 'Nombre de la empresa que quiero para hacer mis prácticas', 'Name of the company I propose for my internship', { wide: true }),
          { key: 'company_website', type: 'liga', label: t('Página de internet de la empresa', 'Company website'), help: TWO_YEARS },
          text('company_tax_id', 'RFC de la empresa', 'Company RFC'),
          {
            key: 'company_founded_year',
            type: 'numero',
            min: 1800,
            max: new Date().getFullYear(),
            label: t('¿En qué año comenzó operaciones la empresa?', 'In what year did the company begin operations?'),
            help: TWO_YEARS,
          },
          text('department', 'Departamento en el que trabajaría', 'Department where I would work'),
        ],
      },
      {
        title: t('Jefe directo o supervisor', 'Direct supervisor'),
        fields: [
          text('supervisor_name', 'Nombre de quien sería mi jefe directo o supervisor', 'Name of my direct supervisor'),
          text('supervisor_role', 'Puesto de mi jefe directo o supervisor', 'Position of my direct supervisor'),
          { key: 'supervisor_email', type: 'correo', label: t('Correo electrónico de mi jefe directo', 'Email of my direct supervisor') },
          { key: 'supervisor_phone', type: 'telefono', label: t('Teléfono de contacto de mi jefe directo', 'Phone number of my direct supervisor') },
        ],
      },
      {
        title: t('Las prácticas', 'The internship'),
        fields: [
          long('schedule', 'Horario de trabajo semanal', 'Weekly work schedule', {
            help: t(
              'Detalla el horario por día. Ejemplo: Lunes 4 horas (de 2pm a 6pm), Martes 8 horas (de 8am a 5pm con 1 hora de comida). Total semanal = 20 horas.',
              'Detail the schedule for each day. Example: Monday 4 hours (2 pm to 6 pm), Tuesday 8 hours (8 am to 5 pm with a 1-hour lunch break). Weekly total = 20 hours.',
            ),
          }),
          {
            key: 'is_paid',
            type: 'sino',
            options: YES_NO,
            wide: true,
            label: t('¿Mis prácticas cuentan con alguna remuneración económica?', 'Does my internship include any financial compensation?'),
          },
          long('description', 'Describe las actividades que te asignarían: tu descripción de puesto y responsabilidades', 'Describe the activities you would be assigned: your job description and responsibilities'),
          long('career_relation', '¿Cómo se alinean esas responsabilidades a tu plan de carrera (LMEC/LMI)?', 'How do those responsibilities align with your career plan (LMEC/LMI)?'),
          long('professional_relation', '¿Cómo se alinean esas responsabilidades con tus metas profesionales y personales?', 'How do those responsibilities align with your professional and personal goals?'),
          {
            key: 'company_validation',
            type: 'opcion',
            wide: true,
            label: t(
              '¿La empresa que propongo es una empresa familiar, una empresa personal o una empresa a la que doy o daré servicios a través de mi empresa?',
              'Is the company I propose a family business, a personal business, or a company I provide or will provide services to through my own company?',
            ),
            options: [
              option(
                'SÍ, la empresa es una empresa familiar y/o SÍ, la empresa es una empresa personal y/o SÍ, la empresa es una empresa a la que doy o daré servicios a través de mi empresa',
                'Sí: es familiar, personal o le doy servicios a través de mi empresa',
                'Yes: it is a family or personal business, or I provide services to it through my company',
              ),
              option(
                'La empresa NO es una empresa familiar; NO es una empresa personal, NO es una empresa a la que doy o daré servicios a través de mi empresa.',
                'No: no es familiar, ni personal, ni le doy servicios a través de mi empresa',
                'No: it is not a family or personal business, and I do not provide services to it through my company',
              ),
            ],
          },
        ],
      },
    ],
  },
  {
    code: 'formB_1',
    label: 'B.1',
    slug: 'inicio-de-practicas',
    name: t('Reporte de Inicio de Prácticas', 'Internship Start Report'),
    subtitle: t('Los datos de la empresa y de tus prácticas', 'Information about the company and your internship'),
    instructions: {
      es: [
        'Contesta con los datos de la organización donde harás tus prácticas y de tus prácticas.',
        SAME_AGAIN.es,
      ],
      en: [
        'Answer with information about the organization where you will do your internship and about the internship itself.',
        SAME_AGAIN.en,
      ],
    },
    sections: [
      {
        title: t('Datos generales de la organización', 'General information about the organization'),
        fields: [
          text('company_name', 'Empresa', 'Company'),
          { key: 'company_website', type: 'liga', label: t('Página de internet', 'Website') },
          text('industry', 'Giro', 'Industry'),
          long('mission', 'Misión', 'Mission'),
          long('vision', 'Visión', 'Vision'),
          long('company_values', 'Valores', 'Values'),
        ],
      },
      {
        title: t('Datos específicos de las prácticas', 'Internship details'),
        fields: [
          {
            key: 'internship_start_date',
            type: 'fecha',
            label: t('Fecha de inicio de las prácticas', 'Internship start date'),
          },
          text('address', 'Dirección de la empresa (ubicación física)', 'Company address (physical location)', { wide: true }),
          text('work_schedule', 'Horario laboral del practicante', "Intern's working hours", {
            help: t('Ejemplo: Lunes a viernes de 9am a 4pm.', 'Example: Monday to Friday, 9 am to 4 pm.'),
          }),
          text('department', 'Departamento donde se llevarán a cabo las prácticas', 'Department where the internship will take place'),
          long('activities', 'Actividades que realizará el practicante', 'Activities the intern will perform'),
        ],
      },
      {
        title: t('Jefe directo del practicante', "Intern's direct supervisor"),
        fields: [
          text('supervisor_name', 'Nombre', 'Name'),
          text('supervisor_title', 'Título', 'Title', {
            help: t('Ejemplo: Lic., Ing., Mtra.', 'Example: Mr., Ms., Dr.'),
          }),
          text('supervisor_role', 'Cargo', 'Position'),
          { key: 'supervisor_email', type: 'correo', label: t('Correo electrónico', 'Email') },
          { key: 'supervisor_phone', type: 'telefono', label: t('Teléfono', 'Phone number') },
        ],
      },
      {
        title: t('Datos de compensación', 'Compensation'),
        fields: [
          {
            key: 'has_contract',
            type: 'sino',
            options: YES_NO,
            label: t('Contrato Programa Escuela Empresa', 'School-Business Program contract'),
          },
          {
            key: 'salary',
            type: 'numero',
            min: 0,
            max: 9_999_999,
            optional: true,
            label: t('Sueldo mensual (pesos)', 'Monthly salary (pesos)'),
            help: t('Si no tienes sueldo, déjalo vacío.', 'Leave it empty if you have no salary.'),
          },
        ],
      },
      {
        title: t('LinkedIn', 'LinkedIn'),
        fields: [
          {
            key: 'has_linkedin_profile',
            type: 'sino',
            options: YES_NO,
            wide: true,
            label: t('Tengo perfil de LinkedIn', 'I have a LinkedIn profile'),
          },
          {
            key: 'linkedin_connections',
            type: 'numero',
            min: 0,
            max: 9_999_999,
            showIf: { key: 'has_linkedin_profile', value: 'si' },
            label: t('Total de contactos en LinkedIn al día de hoy', 'Total LinkedIn connections as of today'),
          },
          {
            key: 'linkedin_url',
            type: 'liga',
            showIf: { key: 'has_linkedin_profile', value: 'si' },
            label: t('URL de tu perfil de LinkedIn', 'LinkedIn profile URL'),
          },
        ],
      },
    ],
  },
)

export const PORTAL_FORM_CODES = PORTAL_FORMS.map((form) => form.code)

export const portalFormByCode = (code: string): PortalFormMeta | undefined =>
  PORTAL_FORMS.find((form) => form.code === code)

export const portalFormBySlug = (slug: string): PortalFormMeta | undefined =>
  PORTAL_FORMS.find((form) => form.slug === slug)

export const portalFormPath = (form: PortalFormMeta) => `/alumno/actividades/${form.slug}`

export const allFields = (form: PortalFormMeta): PortalField[] =>
  form.sections.flatMap((section) => section.fields)

/** ¿Se pregunta este campo con lo que va contestado? */
export function isVisible(field: PortalField, values: PortalValues): boolean {
  return !field.showIf || values[field.showIf.key] === field.showIf.value
}

/** ¿Falta este campo? Los ocultos y los opcionales vacíos no faltan. */
export function isMissing(field: PortalField, values: PortalValues): boolean {
  if (!isVisible(field, values)) return false
  const value = values[field.key]
  const empty = value === undefined || (typeof value === 'string' ? value.trim() === '' : value.length === 0)
  if (field.optional && empty) return false
  return !isAnswered(field, value)
}

/** ¿Está contestado este campo (con un valor válido)? */
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
  if (field.type === 'fecha') return formatDate(value, lang)
  return value
}
