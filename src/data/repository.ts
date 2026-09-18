/**
 * Capa de datos.
 *
 * Las pantallas consumen la interfaz `PanelRepository` y no saben de dónde
 * vienen los datos. La implementación activa es `supabaseRepository`, que
 * consulta las vistas `v_panel_*`.
 *
 * `emptyRepository` se conserva como respaldo: si faltan las variables de
 * entorno, las pantallas se muestran vacías en vez de tronar.
 *
 * Sigue sin haber demo data: las tablas están vacías porque la base lo está
 * (regla «Sin demo data en las pantallas» de CLAUDE.md).
 */

import type { FormCode } from '../lib/catalog'
import { isSupabaseConfigured } from './supabaseClient'
import { supabaseRepository } from './supabaseRepository'
import type {
  CompanyRow,
  DemographicsRow,
  DiscRow,
  FormSummary,
  HollandRow,
  IndeedRow,
  InternshipLogRow,
  InternshipRow,
  JobSearchLogRow,
  MbtiRow,
  PanelFilters,
  ReflectionRow,
  SkillsRow,
  StudentDossier,
  SubmissionHistoryEntry,
  ValuesRow,
} from './types'

export interface PanelRepository {
  /**
   * `false` mientras no haya base de datos conectada. Las pantallas lo usan para
   * distinguir "no hay datos" de "todavía no hay fuente de datos".
   */
  readonly isConnected: boolean

  getSummary(formCode: FormCode, filters: PanelFilters): Promise<FormSummary | null>

  getDemographics(filters: PanelFilters): Promise<DemographicsRow[]>
  getHolland(filters: PanelFilters): Promise<HollandRow[]>
  getMbti(filters: PanelFilters): Promise<MbtiRow[]>
  getDisc(filters: PanelFilters): Promise<DiscRow[]>
  getSkills(filters: PanelFilters): Promise<SkillsRow[]>
  getValues(filters: PanelFilters): Promise<ValuesRow[]>

  /** Sirve a 2.1, 2.2, 2.4 y 2.5: comparten la tabla `reflections`. */
  getReflections(formCode: FormCode, filters: PanelFilters): Promise<ReflectionRow[]>
  getIndeed(filters: PanelFilters): Promise<IndeedRow[]>

  /** Apéndices. Su búsqueda es por nombre de alumno o de empresa. */
  getInternships(filters: PanelFilters): Promise<InternshipRow[]>
  getCompanies(filters: PanelFilters): Promise<CompanyRow[]>

  /**
   * Historial completo de un alumno en un formulario, de la respuesta más
   * reciente a la más antigua.
   *
   * Las tablas muestran una fila por alumno (`latest_submissions`), pero el
   * historial siempre está disponible: las bitácoras semanales tienen hasta 10
   * respuestas por alumno y un reenvío nunca sobrescribe la respuesta anterior.
   */
  getSubmissionHistory(
    studentId: string,
    formCode: FormCode,
  ): Promise<SubmissionHistoryEntry[]>

  /**
   * Expediente del alumno: todo lo que se sabe de él, sin importar desde qué
   * pantalla se abrió. `null` si el alumno no existe.
   */
  getStudentDossier(studentId: string): Promise<StudentDossier | null>

  /**
   * Las dos bitácoras semanales, de la semana más reciente a la más antigua.
   *
   * No pasan por `latest_submissions`: el punto de una bitácora es verlas todas.
   */
  getJobSearchLogs(studentId: string): Promise<JobSearchLogRow[]>
  getInternshipLogs(studentId: string): Promise<InternshipLogRow[]>
}

/** Respaldo sin base de datos, para cuando faltan las variables de entorno. */
export const emptyRepository: PanelRepository = {
  isConnected: false,

  async getSummary() {
    return null
  },
  async getDemographics() {
    return []
  },
  async getHolland() {
    return []
  },
  async getMbti() {
    return []
  },
  async getDisc() {
    return []
  },
  async getSkills() {
    return []
  },
  async getValues() {
    return []
  },
  async getReflections() {
    return []
  },
  async getIndeed() {
    return []
  },
  async getInternships() {
    return []
  },
  async getCompanies() {
    return []
  },
  async getSubmissionHistory() {
    return []
  },
  async getStudentDossier() {
    return null
  },
  async getJobSearchLogs() {
    return []
  },
  async getInternshipLogs() {
    return []
  },
}

export const repository: PanelRepository = isSupabaseConfigured
  ? supabaseRepository
  : emptyRepository
