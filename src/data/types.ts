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
}

export const EMPTY_FILTERS: PanelFilters = {
  search: '',
  language: '',
  sessionDay: '',
  degree: '',
  semester: '',
  period: '',
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
