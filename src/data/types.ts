/**
 * Tipos de las filas que consumen las pantallas.
 *
 * Corresponden a las vistas y tablas de `docs/DATABASE_SCHEMA.md`. Cada tipo de
 * fila es el resultado de unir `v_students_directory` con la tabla de respuestas
 * del formulario, a través de `latest_submissions`.
 */

import type { FormCode, SkillLevel } from '../lib/catalog'

export type Language = 'es' | 'en'
export type SessionDay = 'lunes' | 'miercoles'
export type Gender = 'femenino' | 'masculino' | 'otro' | 'no_especificado'
export type SubmissionState = 'a_tiempo' | 'tarde' | 'pendiente' | 'sin_fecha'
/** Los roles de `roles` (`0035`). Una persona puede tener varios, salvo el alumno. */
export type RoleCode = 'admin' | 'coordinador' | 'maestro' | 'alumno'

/** Columnas del alumno presentes en todas las pantallas. */
export interface StudentColumns {
  studentId: string
  institutionalEmail: string
  fullName: string | null
  language: Language | null
  sessionDay: SessionDay | null
  degreeCode: string | null
  semester: number | null
  periodCode: string | null
}

/** Metadatos de la entrega, comunes a todas las pantallas. */
export interface SubmissionColumns {
  submissionId: string
  submittedAt: string | null
  submissionState: SubmissionState
}

export type BaseRow = StudentColumns & SubmissionColumns

/** 1.0 Datos Demográficos — `demographics` */
export interface DemographicsRow extends BaseRow {
  studentNumber: string | null
  personalEmail: string | null
  birthDate: string | null
  birthCountry: string | null
  gender: Gender | null
}

/** 1.1 Intereses Profesionales — `holland_results` */
export interface HollandRow extends BaseRow {
  hollandCode: string | null
  firstType: string | null
  firstScore: number | null
  secondType: string | null
  secondScore: number | null
  thirdType: string | null
  thirdScore: number | null
}

/** 1.2 Personalidad — `mbti_results` */
export interface MbtiRow extends BaseRow {
  mbtiType: string | null
  identity: string | null
  energy: string | null
  energyPct: number | null
  mind: string | null
  mindPct: number | null
  nature: string | null
  naturePct: number | null
  tactics: string | null
  tacticsPct: number | null
  reportUrl: string | null
}

/** 1.3 Estilos de Comportamiento — `disc_results` */
export interface DiscRow extends BaseRow {
  discStyle: string | null
  discCategory: string | null
  explanation: string | null
  /** Respuesta que llegó contaminada desde el formulario y el profesor debe revisar. */
  needsReview: boolean
}

/** 1.4 Formulario de Habilidades — `skills_assessment` */
export interface SkillsRow extends BaseRow {
  isPefistaGraduating: boolean | null
  /** Nivel por habilidad, indexado por el nombre de columna de `skills_assessment`. */
  skills: Partial<Record<string, SkillLevel | null>>
}

/** 1.5 Valores — `values_results` */
export interface ValuesRow extends BaseRow {
  topValues: string[]
  score: number | null
  reportUrl: string | null
}

/** 2.1, 2.2, 2.4, 2.5 — `reflections` */
export interface ReflectionRow extends BaseRow {
  wasUseful: boolean | null
  reason: string | null
}

/** 2.7 Indeed — `indeed_research` */
export interface IndeedRow extends BaseRow {
  positions: string | null
  positionUrls: (string | null)[]
  companies: string | null
  companyUrls: (string | null)[]
}

/** A.1 Carta Formal de Aceptación — `internship_applications` */
export interface InternshipRow extends BaseRow {
  companyName: string | null
  companyWebsite: string | null
  companyTaxId: string | null
  companyFoundedYear: number | null
  requiredHours: number | null
  internshipOption: string | null
  restrictions: string | null
  department: string | null
  supervisorName: string | null
  supervisorRole: string | null
  supervisorEmail: string | null
  supervisorPhone: string | null
  schedule: string | null
  isPaid: boolean | null
  description: string | null
  careerRelation: string | null
  professionalRelation: string | null
  companyValidation: string | null
}

/** B.1 Formulario de Inicio — `company_profiles` */
export interface CompanyRow extends BaseRow {
  companyName: string | null
  companyWebsite: string | null
  industry: string | null
  mission: string | null
  vision: string | null
  companyValues: string | null
  address: string | null
  workSchedule: string | null
  department: string | null
  supervisorInfo: string | null
  supervisorEmail: string | null
  supervisorPhone: string | null
  activities: string | null
  hasContract: boolean | null
  salary: number | null
  hasLinkedinProfile: boolean | null
  linkedinConnections: number | null
  linkedinUrl: string | null
}

/**
 * Expediente del alumno: lo que se sabe de él en todos los formularios.
 *
 * Las filas `*Row` responden «¿quiénes contestaron este formulario?». Esta
 * responde la contraria, y es lo que se abre al hacer clic en un nombre.
 * Todo es opcional salvo la identidad: un alumno que solo contestó el 1.0
 * aparece igual, con el resto vacío.
 */
export interface StudentDossier extends StudentColumns {
  studentNumber: string | null
  personalEmail: string | null
  birthDate: string | null
  birthCountry: string | null
  gender: Gender | null

  /** 1.1 Intereses Profesionales */
  hollandCode: string | null
  hollandTypes: { type: string; score: number | null }[]

  /** 1.2 Personalidad */
  mbtiType: string | null
  mbtiIdentity: string | null
  mbtiReportUrl: string | null

  /** 1.3 Estilos de Comportamiento */
  discStyle: string | null
  discCategory: string | null
  discNeedsReview: boolean

  /** 1.5 Valores */
  topValues: string[]
  valuesScore: number | null
  valuesReportUrl: string | null

  /** Su grupo vigente (`0032`); `null` si todavía no tiene. */
  groupId: string | null

  /** B.1: los datos de la práctica en curso */
  companyName: string | null
  industry: string | null
  address: string | null
  department: string | null
  supervisorInfo: string | null
  supervisorEmail: string | null
  supervisorPhone: string | null
  companyWebsite: string | null
  hasContract: boolean | null
  salary: number | null
  linkedinUrl: string | null
}

/** Campos comunes a las dos bitácoras semanales. */
interface WeeklyLogBase {
  submissionId: string
  submittedAt: string | null
  /** Cuándo se corrigió la entrega, si se corrigió. Ver 0026. */
  updatedAt: string | null
  weekStart: string | null
  weekEnd: string | null
  /** Número de semana resuelto contra `semester_weeks`, por mejor esfuerzo. Ver 0026. */
  weekNumber: number | null
  activities: string | null
}

/** Una semana de la bitácora de búsqueda de empleo (`form_busqueda`). */
export interface JobSearchLogRow extends WeeklyLogBase {
  applications: string | null
  interviews: string | null
  learnings: string | null
  nextSteps: string | null
}

/** Una semana de la bitácora de prácticas (`form_practicas`). */
export interface InternshipLogRow extends WeeklyLogBase {
  hoursWorked: number | null
  skillsPracticed: string | null
  proposal: string | null
  /** Horas acumuladas hasta esta semana, inclusive. La calcula la vista. */
  cumulativeHours: number | null
  /** Total del alumno. Igual en todas sus filas. */
  totalHours: number | null
}

/**
 * Una semana del semestre (`semester_weeks`), definida por el admin.
 *
 * El alumno elige `weekNumber` de una lista de estas; el profesor las genera
 * desde el Panel de Administrador. Cada periodo tiene las suyas.
 */
export interface SemesterWeek {
  periodCode: string
  weekNumber: number
  weekStart: string
  weekEnd: string
}

// ---------------------------------------------------------------------------
// Lo que el alumno entrega
// ---------------------------------------------------------------------------
// Las `*Row` son lo que se lee; estas son lo que se escribe. Van separadas
// porque no son la misma forma: la entrega no trae `submissionId` (lo genera la
// base), ni horas acumuladas (las calcula la vista).

/** La semana que reporta cualquiera de las dos bitácoras: su número, no sus fechas. */
export interface WeeklyLogInput {
  weekNumber: number
}

export interface JobSearchLogInput extends WeeklyLogInput {
  activities: string
  applications: string
  interviews: string
  learnings: string
  nextSteps: string
}

export interface InternshipLogInput extends WeeklyLogInput {
  activities: string
  hoursWorked: number | null
  skillsPracticed: string
  proposal: string
}

/**
 * Lo que identifica la entrega que se está corrigiendo: su id, no su semana
 * -la semana no se puede cambiar al corregir, solo el contenido-.
 */
export interface WeeklyLogUpdateInput {
  submissionId: string
}

export interface JobSearchLogUpdateInput extends WeeklyLogUpdateInput {
  activities: string
  applications: string
  interviews: string
  learnings: string
  nextSteps: string
}

export interface InternshipLogUpdateInput extends WeeklyLogUpdateInput {
  activities: string
  hoursWorked: number | null
  skillsPracticed: string
  proposal: string
}

/** Una entrada del historial de respuestas de un alumno a un formulario. */
export interface SubmissionHistoryEntry {
  submissionId: string
  formCode: FormCode
  submittedAt: string
  language: Language | null
  weekStart: string | null
  weekEnd: string | null
  isLatest: boolean
}

/** Filtros compartidos por todas las pantallas. */
export interface PanelFilters {
  search: string
  language: string
  sessionDay: string
  degree: string
  semester: string
  period: string
  /**
   * El grupo elegido en el selector del encabezado (`groups.id`). No es un
   * filtro de la barra: es global a todas las pantallas y «Limpiar» no lo
   * toca. Ver `GroupProvider`.
   */
  group: string
  /**
   * Los grupos que la vista activa puede ver, cuando no se eligió uno
   * («Todos mis grupos»). `null` = sin restricción (vista de administrador).
   * RLS deja leer la unión de los roles de la cuenta; esto acota a la vista
   * elegida en «Ver como». Ver `GroupProvider`.
   */
  scopeGroups: string[] | null
}

export const EMPTY_FILTERS: PanelFilters = {
  search: '',
  language: '',
  sessionDay: '',
  degree: '',
  semester: '',
  period: '',
  group: '',
  scopeGroups: null,
}

/**
 * Una regla de fecha límite (`form_deadlines`).
 *
 * `language`/`sessionDay`/`periodCode` en `null` significan "todos": el mismo
 * significado que un select vacío en los filtros compartidos.
 */
export interface FormDeadline {
  id: string
  formCode: FormCode
  language: Language | null
  sessionDay: SessionDay | null
  periodCode: string | null
  dueAt: string
  createdAt: string
}

/** Lo que el admin manda al crear una regla. `id`/`createdAt` los pone la base. */
export interface FormDeadlineInput {
  formCode: FormCode
  language: Language | null
  sessionDay: SessionDay | null
  periodCode: string | null
  dueAt: string
}

/** Una celda de la matriz de "Estado de Entregas": un alumno, un formulario. */
export interface SubmissionStatusCell {
  state: SubmissionState
  submittedAt: string | null
  /** `null` cuando el formulario no tiene fecha límite configurada. */
  dueAt: string | null
}

/**
 * Una celda de la misma matriz, pero por semana configurada en vez de por
 * formulario: ¿reportó el alumno alguna de las dos bitácoras esa semana? Ver
 * `v_weekly_submission_status` (`0027`).
 */
export interface WeeklyLogStatusCell extends SubmissionStatusCell {
  weekNumber: number
}

/**
 * Una fila de la matriz: un alumno con su estado en cada uno de los
 * formularios que pueden llevar fecha límite. Un formulario ausente del mapa
 * es un formulario sin fila en `v_submission_status` para este alumno — no
 * debería pasar, pero la pantalla lo trata como `sin_fecha`.
 */
export interface SubmissionStatusRow {
  studentId: string
  institutionalEmail: string
  fullName: string | null
  degreeCode: string | null
  semester: number | null
  periodCode: string | null
  sessionDay: SessionDay | null
  statuses: Partial<Record<FormCode, SubmissionStatusCell>>
}

/** Contadores del encabezado de cada pantalla. */
export interface FormSummary {
  responses: number
  pending: number
  /**
   * `null` cuando no se puede saber: sin fechas de entrega configuradas no hay
   * contra qué comparar. Se muestra como "—", no como 0, para no hacer creer
   * que se comprobó y no hubo ninguna.
   */
  late: number | null
}

/**
 * La última corrida de la sincronización con el Google Sheets.
 *
 * Existe para que el profesor sepa qué tan frescos son los datos que está
 * viendo. Sin esto, una sincronización muerta no se nota: el panel se queda
 * quieto y parece que los alumnos dejaron de entregar.
 */
export interface SyncStatus {
  startedAt: string
  /** `null` mientras la corrida sigue, o si se cayó a la mitad. */
  finishedAt: string | null
}

/**
 * Lo que devuelve una corrida manual de la sincronización ("Procesar datos").
 *
 * Se deriva del `jsonb` que regresa `import_sheet_rows()`: `recordsSynced` es
 * la suma de las entregas escritas en los 15 formularios, y `accountsCreated`
 * es `cuentas_creadas` (0021) — las cuentas de alumno que se dieron de alta en
 * esta corrida, no las que ya existían.
 */
export interface SyncRunResult {
  recordsSynced: number
  accountsCreated: number
}

/**
 * Una fila para registrar a un alumno (`admin_register_students()`, `0031`).
 * Son los textos tal como los capturó el profesor o venían en el Excel: la
 * función de la base los normaliza y valida, y es la autoridad.
 */
export interface StudentRegistrationInput {
  email: string
  studentNumber: string
  periodCode: string
  sessionDay: string
  language: string
}

/** Lo que pasó con una fila. La matrícula no se devuelve: es la contraseña inicial. */
export interface RegistrationResult {
  /** Posición de la fila en lo que se mandó, desde 1. */
  row: number
  email: string
  /** `creado`, `actualizado`, `sin cambios` o `error: motivo`. */
  outcome: string
  /** Qué pasó con la cuenta de acceso; `null` si la fila falló. */
  account: string | null
}

/** Un alumno del directorio, con lo que se sabe de su inscripción. */
export interface RegisteredStudent {
  studentId: string
  email: string
  fullName: string | null
  studentNumber: string | null
  periodCode: string | null
  sessionDay: SessionDay | null
  language: Language | null
  /** Su grupo vigente; `null` si todavía no tiene. Ver `0032`. */
  groupId: string | null
}

/**
 * Un grupo (`v_groups`, `0032`): una clase concreta de un maestro. El nombre
 * no se guarda en la base; se arma con `formatGroupLabel()`.
 */
export interface Group {
  id: string
  periodCode: string
  sessionDay: SessionDay
  language: Language
  teacherId: string
  teacherName: string | null
  teacherEmail: string
  studentCount: number
}

/** Lo que el admin manda al crear un grupo. */
export interface GroupInput {
  periodCode: string
  sessionDay: SessionDay
  language: Language
  teacherId: string
}

/**
 * Quien puede impartir un grupo. Mientras no existan los roles de maestro
 * (fase 2), es cualquier perfil admin activo.
 */
export interface Teacher {
  id: string
  name: string | null
  email: string
}

/**
 * Una cuenta, para Configuración → Usuarios (`v_users`, `0035`). Nombre y
 * apellido por separado (`0034`); los roles se arman al leer.
 */
export interface UserAccount {
  id: string
  email: string
  firstName: string | null
  lastName: string | null
  isActive: boolean
  roles: RoleCode[]
}

/** Lo que el admin captura al crear la cuenta de un maestro, coordinador o admin (`0037`). */
export interface StaffAccountInput {
  email: string
  firstName: string
  lastName: string
  /** Contraseña inicial; el usuario la cambia en Mi perfil. */
  password: string
  roles: RoleCode[]
}

/** Una celda de la matriz de permisos por rol (`role_screen_access`, `0038`). */
export interface RoleScreenAccess {
  roleCode: RoleCode
  screenCode: string
  access: 'lectura' | 'edicion'
}
