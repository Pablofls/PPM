/**
 * Catálogos de la interfaz.
 *
 * Refleja `docs/FORMS_CATALOG.md` y las tablas de catálogo del esquema
 * (`modules`, `forms`, `periods`, `degree_programs`). Cuando la base de datos
 * esté conectada, los periodos y carreras se leerán de ahí; el resto es
 * estructura fija de la aplicación.
 */

export type ModuleCode = '1' | '2' | 'A' | 'B' | 'W'

export type FormCode =
  | 'form1_0'
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

export interface FormMeta {
  code: FormCode
  moduleCode: ModuleCode
  /** Numeración que ve el profesor: 1.0, 2.7. Es la del Sheets original. */
  label: string
  name: string
  subtitle: string
  path: string
}

/**
 * Los 13 formularios con pantalla.
 *
 * No existen 2.3 ni 2.6: la numeración del Módulo 2 salta de 2.2 a 2.4 y de 2.5
 * a 2.7 en el original, y se respeta porque es la que el profesor y los alumnos
 * ya conocen.
 */
export const FORMS: FormMeta[] = [
  {
    code: 'form1_0',
    moduleCode: '1',
    label: '1.0',
    name: 'Datos Demográficos',
    subtitle: 'Datos generales que el alumno registra al inicio del periodo',
    path: '/modulo1/datos-demograficos',
  },
  {
    code: 'form1_1',
    moduleCode: '1',
    label: '1.1',
    name: 'Intereses Profesionales',
    subtitle: 'Resultados del inventario de intereses Holland (RIASEC)',
    path: '/modulo1/intereses-profesionales',
  },
  {
    code: 'form1_2',
    moduleCode: '1',
    label: '1.2',
    name: 'Personalidad',
    subtitle: 'Tipo de personalidad y sus cinco dimensiones',
    path: '/modulo1/personalidad',
  },
  {
    code: 'form1_3',
    moduleCode: '1',
    label: '1.3',
    name: 'Estilos de Comportamiento',
    subtitle: 'Estilo DISC y categoría de comportamiento',
    path: '/modulo1/estilos-de-comportamiento',
  },
  {
    code: 'form1_4',
    moduleCode: '1',
    label: '1.4',
    name: 'Formulario de Habilidades',
    subtitle: 'Autoevaluación de 33 habilidades en cinco niveles de dominio',
    path: '/modulo1/habilidades',
  },
  {
    code: 'form1_5',
    moduleCode: '1',
    label: '1.5',
    name: 'Valores',
    subtitle: 'Valores predominantes del alumno y su puntuación',
    path: '/modulo1/valores',
  },
  {
    code: 'form2_1',
    moduleCode: '2',
    label: '2.1',
    name: 'Análisis FODA',
    subtitle: 'Reflexión del alumno sobre su análisis FODA',
    path: '/modulo2/analisis-foda',
  },
  {
    code: 'form2_2',
    moduleCode: '2',
    label: '2.2',
    name: 'Curriculum Vitae',
    subtitle: 'Reflexión del alumno sobre la elaboración de su CV',
    path: '/modulo2/curriculum-vitae',
  },
  {
    code: 'form2_4',
    moduleCode: '2',
    label: '2.4',
    name: 'Cover Letter',
    subtitle: 'Reflexión del alumno sobre su carta de presentación',
    path: '/modulo2/cover-letter',
  },
  {
    code: 'form2_5',
    moduleCode: '2',
    label: '2.5',
    name: 'Elevator Pitch',
    subtitle: 'Reflexión del alumno sobre su elevator pitch',
    path: '/modulo2/elevator-pitch',
  },
  {
    code: 'form2_7',
    moduleCode: '2',
    label: '2.7',
    name: 'Indeed',
    subtitle: 'Vacantes y compañías que el alumno investigó en Indeed',
    path: '/modulo2/indeed',
  },
  {
    code: 'formA_1',
    moduleCode: 'A',
    label: 'A.1',
    name: 'Carta Formal de Aceptación',
    subtitle: 'Empresa donde el alumno realizará sus prácticas profesionales',
    path: '/apendice-a/carta-de-aceptacion',
  },
  {
    code: 'formB_1',
    moduleCode: 'B',
    label: 'B.1',
    name: 'Formulario de Inicio',
    subtitle: 'Perfil de la empresa y condiciones de la práctica',
    path: '/apendice-b/formulario-de-inicio',
  },
]

/** Títulos de las secciones del sidebar, como en la plataforma anterior. */
export const MODULE_TITLES: Record<ModuleCode, string> = {
  '1': 'Módulo 1 · Conócete',
  '2': 'Módulo 2 · Actúa',
  A: 'Apéndice A · Cartas Requeridas',
  B: 'Apéndice B · Reportes',
  W: 'Bitácoras semanales',
}

export const formByCode = (code: FormCode): FormMeta =>
  FORMS.find((form) => form.code === code)!

// ---------------------------------------------------------------------------
// Bitácoras semanales — las tareas del portal del alumno
// ---------------------------------------------------------------------------

/**
 * Los dos reportes semanales.
 *
 * Van aparte de `FORMS` y con su propio tipo porque no son lo mismo: `FORMS`
 * son las pantallas del rail del profesor —una tabla de quién contestó qué— y
 * estas son tareas que el alumno entrega. No tienen pantalla en el rail; el
 * profesor las lee dentro del expediente del alumno.
 *
 * Mezclarlas en `FormCode` obligaría a que `formByCode()` y las trece consultas
 * del panel supieran de dos códigos que nunca les llegan.
 */
export type WeeklyFormCode = 'form_busqueda' | 'form_practicas'

/** Un campo del formulario, como lo ve el alumno. */
export interface WeeklyField {
  /** La propiedad del objeto de entrada. */
  key: string
  label: string
  /** La pregunta como venía en el Google Form. */
  help: string
  type: 'texto' | 'numero'
  required?: boolean
}

export interface WeeklyFormMeta {
  code: WeeklyFormCode
  name: string
  subtitle: string
  path: string
  /** Lo que el alumno lee antes de contestar, como en una tarea de Canvas. */
  instructions: string[]
  fields: WeeklyField[]
  /**
   * La versión en inglés, para el portal de los alumnos de un grupo de Inglés
   * (`src/lib/i18n.ts`). Los campos se traducen por su `key`. El profesor
   * siempre ve la versión en español.
   */
  en: {
    name: string
    subtitle: string
    instructions: string[]
    fields: Record<string, { label: string; help: string }>
  }
}

export const WEEKLY_FORMS: WeeklyFormMeta[] = [
  {
    code: 'form_busqueda',
    name: 'Reporte de Búsqueda',
    subtitle: 'Tu bitácora semanal de búsqueda de empleo',
    path: '/alumno/actividades/reporte-de-busqueda',
    instructions: [
      'Se entrega una vez por semana, mientras sigas en búsqueda de prácticas.',
      'Solo puedes reportar la semana en curso: el sistema no te deja elegir otra.',
      'Puedes corregirla las veces que quieras mientras siga siendo esta semana; en cuanto termine, ya no se puede editar.',
    ],
    fields: [
      {
        key: 'activities',
        label: 'Actividades',
        help: '¿Qué hiciste esta semana para buscar prácticas?',
        type: 'texto',
        required: true,
      },
      {
        key: 'applications',
        label: 'Aplicaciones',
        help: '¿A qué vacantes aplicaste? Escribe empresa y puesto.',
        type: 'texto',
        required: true,
      },
      {
        key: 'interviews',
        label: 'Entrevistas',
        help: '¿Tuviste entrevistas? ¿Con quién y cómo te fue?',
        type: 'texto',
        required: true,
      },
      {
        key: 'learnings',
        label: 'Aprendizajes',
        help: '¿Qué aprendiste de la búsqueda de esta semana?',
        type: 'texto',
        required: true,
      },
      {
        key: 'nextSteps',
        label: 'Siguientes pasos',
        help: '¿Qué vas a hacer la semana que entra?',
        type: 'texto',
        required: true,
      },
    ],
    en: {
      name: 'Job Search Report',
      subtitle: 'Your weekly internship search log',
      instructions: [
        'Submit it once a week, for as long as you are still looking for an internship.',
        'You can only report the current week: the system does not let you choose another one.',
        'You can edit it as many times as you want while it is still this week; once the week is over, it can no longer be edited.',
      ],
      fields: {
        activities: {
          label: 'Activities',
          help: 'What did you do this week to look for an internship?',
        },
        applications: {
          label: 'Applications',
          help: 'Which openings did you apply to? Write the company and the position.',
        },
        interviews: {
          label: 'Interviews',
          help: 'Did you have any interviews? With whom, and how did they go?',
        },
        learnings: {
          label: 'Learnings',
          help: 'What did you learn from this week’s search?',
        },
        nextSteps: {
          label: 'Next steps',
          help: 'What will you do next week?',
        },
      },
    },
  },
  {
    code: 'form_practicas',
    name: 'Reporte de Prácticas',
    subtitle: 'Tu bitácora semanal dentro de la empresa',
    path: '/alumno/actividades/reporte-de-practicas',
    instructions: [
      'Se entrega una vez por semana, desde que empiezas tus prácticas.',
      'Las horas son las de esa semana, no el acumulado: el total lo suma el sistema.',
      'Solo puedes reportar la semana en curso, y puedes corregirla mientras siga en curso; en cuanto termine, ya no se puede editar.',
    ],
    fields: [
      {
        key: 'activities',
        label: 'Actividades',
        help: '¿Qué actividades realizaste esta semana en la empresa?',
        type: 'texto',
        required: true,
      },
      {
        key: 'hoursWorked',
        label: 'Horas trabajadas',
        help: 'Horas de esta semana. Acepta decimales (por ejemplo, 31.5).',
        type: 'numero',
        required: true,
      },
      {
        key: 'skillsPracticed',
        label: 'Habilidades',
        help: '¿Qué habilidades pusiste en práctica?',
        type: 'texto',
        required: true,
      },
      {
        key: 'proposal',
        label: 'Propuesta',
        help: '¿Qué propondrías para mejorar el área donde trabajas?',
        type: 'texto',
        required: true,
      },
    ],
    en: {
      name: 'Internship Report',
      subtitle: 'Your weekly log at the company',
      instructions: [
        'Submit it once a week, starting when your internship begins.',
        'Hours are for that week only, not the running total: the system adds them up.',
        'You can only report the current week, and you can edit it while it is still in progress; once the week is over, it can no longer be edited.',
      ],
      fields: {
        activities: {
          label: 'Activities',
          help: 'What activities did you do at the company this week?',
        },
        hoursWorked: {
          label: 'Hours worked',
          help: 'Hours for this week. Decimals are accepted (for example, 31.5).',
        },
        skillsPracticed: {
          label: 'Skills',
          help: 'Which skills did you put into practice?',
        },
        proposal: {
          label: 'Proposal',
          help: 'What would you propose to improve the area where you work?',
        },
      },
    },
  },
]

export const weeklyFormByCode = (code: WeeklyFormCode): WeeklyFormMeta =>
  WEEKLY_FORMS.find((form) => form.code === code)!

/**
 * La bitácora en el idioma del portal: en inglés reemplaza nombre,
 * subtítulo, instrucciones y el texto de cada campo; todo lo demás (código,
 * ruta, claves y tipos de los campos) es el mismo.
 */
export function localizeWeeklyForm(form: WeeklyFormMeta, lang: 'es' | 'en'): WeeklyFormMeta {
  if (lang === 'es') return form
  return {
    ...form,
    name: form.en.name,
    subtitle: form.en.subtitle,
    instructions: form.en.instructions,
    fields: form.fields.map((field) => ({ ...field, ...form.en.fields[field.key] })),
  }
}

// ---------------------------------------------------------------------------
// 1.0 Datos Demográficos en el portal (0052)
// ---------------------------------------------------------------------------

/** Un campo del 1.0. Las opciones de los `opcion` las arma la página (catálogos y formatos). */
export interface DemographicsField {
  key: 'fullName' | 'personalEmail' | 'birthDate' | 'birthCountry' | 'gender' | 'degreeCode' | 'semester'
  label: string
  help: string
  type: 'texto' | 'correo' | 'fecha' | 'opcion'
  en: { label: string; help: string }
}

/**
 * El 1.0 como lo contesta el alumno en su portal. Son las preguntas del Google
 * Form menos periodo, frecuencia e idioma (las da el grupo) y matrícula y
 * correo institucional (las da el registro).
 */
export const DEMOGRAPHICS_FORM = {
  path: '/alumno/actividades/datos-demograficos',
  name: 'Datos Demográficos',
  subtitle: 'Tus datos generales para el periodo de prácticas',
  instructions: [
    'Contesta con tus datos actuales. Tu periodo, frecuencia, idioma y matrícula ya los tenemos por tu grupo.',
    'Si algo cambia, vuelve a entregarlo: tu profesor ve siempre la entrega más reciente.',
  ],
  en: {
    name: 'Demographic Information',
    subtitle: 'Your general information for the internship term',
    instructions: [
      'Answer with your current information. We already have your term, schedule, language and student ID from your group.',
      'If something changes, submit it again: your professor always sees your latest submission.',
    ],
  },
  fields: [
    {
      key: 'fullName',
      label: 'Nombre completo',
      help: 'Nombre(s) y apellidos, como aparecen en tu credencial.',
      type: 'texto',
      en: { label: 'Full name', help: 'First and last names, as on your student ID.' },
    },
    {
      key: 'personalEmail',
      label: 'Correo personal',
      help: 'Uno que no sea el institucional.',
      type: 'correo',
      en: { label: 'Personal email', help: 'Not your university email.' },
    },
    {
      key: 'birthDate',
      label: 'Fecha de nacimiento',
      help: '',
      type: 'fecha',
      en: { label: 'Date of birth', help: '' },
    },
    {
      key: 'birthCountry',
      label: 'País de nacimiento',
      help: '',
      type: 'texto',
      en: { label: 'Country of birth', help: '' },
    },
    {
      key: 'gender',
      label: 'Sexo',
      help: '',
      type: 'opcion',
      en: { label: 'Sex', help: '' },
    },
    {
      key: 'degreeCode',
      label: 'Carrera',
      help: '',
      type: 'opcion',
      en: { label: 'Degree program', help: '' },
    },
    {
      key: 'semester',
      label: 'Semestre',
      help: 'El que cursas este periodo.',
      type: 'opcion',
      en: { label: 'Semester', help: 'The one you are taking this term.' },
    },
  ] satisfies DemographicsField[],
}

/** Los cuatro formularios que comparten la tabla `reflections`. */
export const REFLECTION_FORMS = ['form2_1', 'form2_2', 'form2_4', 'form2_5'] as const

/**
 * Los formularios con fecha límite única (Estado de Entregas): los trece de
 * `FORMS`. Desde `0051` el 1.0 también es una actividad con fecha de entrega.
 * Las bitácoras vencen semana por semana y tienen su propia cuadrícula.
 */
export const DEADLINE_FORMS: FormMeta[] = FORMS

// ---------------------------------------------------------------------------
// Actividades (`activities`, 0051)
// ---------------------------------------------------------------------------

/** Una actividad es uno de los quince formularios de `forms`, asignado a un grupo. */
export type ActivityFormCode = FormCode | WeeklyFormCode

/**
 * Las actividades que el alumno contesta dentro del panel y ve en su portal.
 * Las demás se siguen contestando en Google Forms: en Actividades solo llevan
 * fecha de entrega, y el portal no las muestra.
 */
export const PANEL_ACTIVITY_FORMS: ActivityFormCode[] = ['form1_0', 'form_busqueda', 'form_practicas']

export const isPanelActivity = (code: ActivityFormCode): boolean =>
  PANEL_ACTIVITY_FORMS.includes(code)

export const isWeeklyActivity = (code: ActivityFormCode): code is WeeklyFormCode =>
  code === 'form_busqueda' || code === 'form_practicas'

export interface ActivityMeta {
  code: ActivityFormCode
  moduleCode: ModuleCode
  /** «1.0», «2.7»; vacío en las bitácoras. */
  label: string
  name: string
  subtitle: string
  /** Lo que el alumno lee si el profesor no escribió instrucciones propias. */
  defaultInstructions: string[]
}

/** Las quince actividades en el orden del rail: módulos, apéndices y bitácoras. */
export const ACTIVITIES: ActivityMeta[] = [
  ...FORMS.map((form) => ({
    code: form.code,
    moduleCode: form.moduleCode,
    label: form.label,
    name: form.name,
    subtitle: form.subtitle,
    defaultInstructions: form.code === 'form1_0' ? DEMOGRAPHICS_FORM.instructions : [],
  })),
  ...WEEKLY_FORMS.map((form) => ({
    code: form.code,
    moduleCode: 'W' as const,
    label: '',
    name: form.name,
    subtitle: form.subtitle,
    defaultInstructions: form.instructions,
  })),
]

export const activityByCode = (code: string): ActivityMeta | undefined =>
  ACTIVITIES.find((activity) => activity.code === code)

/** Secciones del proyecto que todavía no tienen pantalla. Ver regla «Alcance de las pantallas» de CLAUDE.md. */
export const UPCOMING_SECTIONS: string[] = [
  // Las bitácoras semanales salieron de esta lista: ya existen, pero dentro del
  // expediente del alumno, no como pantalla propia del rail. Estado de
  // Entregas salió con el Panel de Administrador, y Grupos con `0032`: ver
  // AppShell.tsx. Vacía, el rail no muestra la sección «Próximamente».
]

// ---------------------------------------------------------------------------
// Opciones de los filtros compartidos
// ---------------------------------------------------------------------------

export interface FilterOption {
  value: string
  label: string
}

export const LANGUAGE_OPTIONS: FilterOption[] = [
  { value: 'es', label: 'Español' },
  { value: 'en', label: 'Inglés' },
]

export const SESSION_DAY_OPTIONS: FilterOption[] = [
  { value: 'lunes', label: 'Lunes' },
  { value: 'martes', label: 'Martes' },
  { value: 'miercoles', label: 'Miércoles' },
  { value: 'jueves', label: 'Jueves' },
  { value: 'viernes', label: 'Viernes' },
]

/** Se leerán de `degree_programs` cuando exista la base de datos. */
export const DEGREE_OPTIONS: FilterOption[] = [
  { value: 'LMEC', label: 'LMEC' },
  { value: 'LMI', label: 'LMI' },
]

export const SEMESTER_OPTIONS: FilterOption[] = [
  { value: '6', label: '6to' },
  { value: '7', label: '7mo' },
  { value: '8', label: '8vo' },
  { value: '9', label: '9no' },
  { value: '10', label: '10mo' },
]

/** Se leerán de `periods` cuando exista la base de datos. */
export const PERIOD_OPTIONS: FilterOption[] = [
  { value: 'PR-26', label: 'PR-26' },
  { value: 'OT-26', label: 'OT-26' },
]

/**
 * Los periodos en los que se puede crear un grupo: el actual y el siguiente.
 * PR (primavera) corre de enero a julio y OT (otoño) de agosto a diciembre,
 * así que en octubre de 2026 son OT-26 y PR-27, y en febrero de 2027, PR-27 y OT-27.
 */
export function creatablePeriods(today: Date = new Date()): FilterOption[] {
  const yy = (offset: number) => String((today.getFullYear() + offset) % 100).padStart(2, '0')
  const codes =
    today.getMonth() <= 6 ? [`PR-${yy(0)}`, `OT-${yy(0)}`] : [`OT-${yy(0)}`, `PR-${yy(1)}`]
  return codes.map((code) => ({ value: code, label: code }))
}

// ---------------------------------------------------------------------------
// Etiquetas de dominio
// ---------------------------------------------------------------------------

/** Inventario Holland: la letra y su significado. */
export const HOLLAND_LABELS: Record<string, string> = {
  R: 'Realista',
  I: 'Investigadora',
  A: 'Artística',
  S: 'Social',
  E: 'Emprendedora',
  C: 'Convencional',
}

/** Los mismos tipos de Holland en inglés, para el portal de un grupo de Inglés. */
export const HOLLAND_LABELS_EN: Record<string, string> = {
  R: 'Realistic',
  I: 'Investigative',
  A: 'Artistic',
  S: 'Social',
  E: 'Enterprising',
  C: 'Conventional',
}

/** Escala del formulario 1.4, de menor a mayor dominio. Mismo orden que el enum. */
export const SKILL_LEVELS = [
  'novato',
  'principiante',
  'intermedio',
  'avanzado',
  'experto',
] as const

export type SkillLevel = (typeof SKILL_LEVELS)[number]

export const SKILL_LEVEL_LABELS: Record<SkillLevel, string> = {
  novato: 'Novato',
  principiante: 'Principiante',
  intermedio: 'Intermedio',
  avanzado: 'Avanzado',
  experto: 'Experto',
}

/**
 * Las 33 habilidades del formulario 1.4, agrupadas.
 *
 * No caben a lo ancho, así que la pantalla muestra un grupo a la vez.
 * `key` es el nombre de la columna en `skills_assessment`.
 */
export interface SkillGroup {
  id: string
  label: string
  skills: { key: string; label: string }[]
}

export const SKILL_GROUPS: SkillGroup[] = [
  {
    id: 'interpersonal',
    label: 'Comunicación e interpersonal',
    skills: [
      { key: 'written_communication', label: 'Comunicación escrita' },
      { key: 'verbal_communication', label: 'Comunicación verbal' },
      { key: 'nonverbal_communication', label: 'Comunicación no verbal' },
      { key: 'collaboration_teamwork', label: 'Colaboración y trabajo en equipo' },
      { key: 'leadership', label: 'Liderazgo' },
      { key: 'conflict_resolution', label: 'Resolución de conflictos' },
      { key: 'negotiation', label: 'Negociación' },
      { key: 'active_listening', label: 'Escucha activa' },
      { key: 'empathy', label: 'Empatía' },
      { key: 'customer_service', label: 'Servicio al cliente' },
    ],
  },
  {
    id: 'digital',
    label: 'Herramientas digitales',
    skills: [
      { key: 'excel', label: 'Excel' },
      { key: 'sheets', label: 'Sheets' },
      { key: 'word', label: 'Word' },
      { key: 'docs', label: 'Docs' },
      { key: 'powerpoint', label: 'PowerPoint' },
      { key: 'slides', label: 'Slides' },
      { key: 'chatgpt', label: 'ChatGPT' },
      { key: 'gemini', label: 'Gemini' },
      { key: 'programming', label: 'Programación' },
    ],
  },
  {
    id: 'management',
    label: 'Pensamiento y gestión',
    skills: [
      { key: 'critical_thinking', label: 'Pensamiento crítico' },
      { key: 'decision_making', label: 'Toma de decisiones' },
      { key: 'time_management', label: 'Administración del tiempo' },
      { key: 'planning_organization', label: 'Planeación y organización' },
      { key: 'research_analysis', label: 'Análisis e investigación' },
      { key: 'project_management', label: 'Administración de proyectos' },
    ],
  },
  {
    id: 'personal',
    label: 'Desarrollo personal',
    skills: [
      { key: 'creativity_innovation', label: 'Creatividad e innovación' },
      { key: 'flexibility_adaptability', label: 'Flexibilidad y adaptabilidad' },
      { key: 'work_ethic', label: 'Ética de trabajo' },
      { key: 'financial_literacy', label: 'Educación financiera' },
      { key: 'learning_ability', label: 'Capacidad de aprender' },
      { key: 'emotional_intelligence', label: 'Inteligencia emocional' },
      { key: 'networking', label: 'Networking' },
      { key: 'sales', label: 'Ventas' },
    ],
  },
]
