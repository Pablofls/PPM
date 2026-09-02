/**
 * Capa de datos.
 *
 * Este es el ÚNICO archivo que cambia cuando se conecte Supabase. Las pantallas
 * consumen la interfaz `PanelRepository` y no saben de dónde vienen los datos.
 *
 * En esta iteración la implementación activa es `emptyRepository`: devuelve
 * listas vacías a propósito. Las pantallas se muestran con sus encabezados y su
 * estado vacío, sin demo data (regla 3 de CLAUDE.md).
 *
 * Para conectar la base de datos, ver docs/DEPLOYMENT.md paso 3.
 */

import type { FormCode } from '../lib/catalog'
import type {
  DemographicsRow,
  DiscRow,
  FormSummary,
  HollandRow,
  IndeedRow,
  MbtiRow,
  PanelFilters,
  ReflectionRow,
  SkillsRow,
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
}

/** Implementación sin base de datos, la de esta iteración. */
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
  async getSubmissionHistory() {
    return []
  },
}

export const repository: PanelRepository = emptyRepository
