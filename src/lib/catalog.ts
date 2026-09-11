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
 * Los 11 formularios con pantalla en esta iteración.
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
]

export const formByCode = (code: FormCode): FormMeta =>
  FORMS.find((form) => form.code === code)!

/** Los cuatro formularios que comparten la tabla `reflections`. */
export const REFLECTION_FORMS = ['form2_1', 'form2_2', 'form2_4', 'form2_5'] as const

/** Secciones del proyecto que todavía no tienen pantalla. Ver regla 8 de CLAUDE.md. */
export const UPCOMING_SECTIONS = [
  'Apéndice A: Cartas Requeridas',
  'Apéndice B: Reportes',
  'Bitácoras semanales',
  'Grupos',
  'Estado de Entregas',
  'Alumnos Registrados',
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
  { value: 'miercoles', label: 'Miércoles' },
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
