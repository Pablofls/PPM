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
  FormDeadline,
  FormDeadlineInput,
  FormSummary,
  HollandRow,
  IndeedRow,
  InternshipLogInput,
  InternshipLogRow,
  InternshipLogUpdateInput,
  InternshipRow,
  JobSearchLogInput,
  JobSearchLogRow,
  JobSearchLogUpdateInput,
  MbtiRow,
  PanelFilters,
  ReflectionRow,
  SemesterWeek,
  SkillsRow,
  StudentDossier,
  SubmissionHistoryEntry,
  SubmissionStatusRow,
  SyncRunResult,
  SyncStatus,
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

  /**
   * Entrega una bitácora del alumno de la sesión, para la semana en curso.
   *
   * No reciben `studentId`: el alumno sale de la sesión, en la base. Un
   * parámetro aquí sería un parámetro que alguien puede cambiar en el
   * navegador.
   *
   * Cada llamada crea una entrega nueva. El servidor rechaza cualquier semana
   * que no sea la de hoy -ya no hay forma de ponerse al corriente con una
   * semana atrasada, es la excepción acotada a «Historial completo» de
   * CLAUDE.md que abre `0020_weekly_log_current_week_only.sql`-.
   */
  submitJobSearchLog(input: JobSearchLogInput): Promise<void>
  submitInternshipLog(input: InternshipLogInput): Promise<void>

  /**
   * Corrige el contenido de una entrega ya hecha, mientras su semana siga
   * siendo la semana en curso. Pasado ese punto la fila vuelve a ser
   * inmutable para siempre: el servidor lo rechaza aunque la pantalla lo deje
   * intentar (RLS de `0020_weekly_log_current_week_only.sql`).
   */
  updateJobSearchLog(input: JobSearchLogUpdateInput): Promise<void>
  updateInternshipLog(input: InternshipLogUpdateInput): Promise<void>

  /**
   * La última corrida de la sincronización con el Sheets. `null` si todavía no
   * ha corrido ninguna.
   */
  getLastSync(): Promise<SyncStatus | null>

  /**
   * Corre la sincronización a mano, desde el botón "Procesar datos" del
   * panel: reprocesa lo que ya esté en el staging del Sheets y de paso da de
   * alta las cuentas de alumno que falten (`0021`), sin esperar el
   * disparador horario. Admin-only: la función del lado de la base
   * (`admin_run_sheet_sync()`, `0022`) rechaza a cualquiera que no sea admin.
   */
  runSheetSync(): Promise<SyncRunResult>

  /**
   * Reglas de fecha límite vigentes, de la más reciente a la más antigua.
   * Alimenta la tabla "Fechas asignadas" del Panel de Administrador.
   */
  getFormDeadlines(): Promise<FormDeadline[]>

  /** Crea una regla de fecha límite. Nunca sobrescribe una existente. */
  createFormDeadline(input: FormDeadlineInput): Promise<void>

  /** Borra una regla. Corregir una fecha es borrarla y crear otra. */
  deleteFormDeadline(id: string): Promise<void>

  /**
   * La matriz de "Estado de Entregas": un alumno por fila, con su estado en
   * cada formulario que puede llevar fecha límite.
   */
  getSubmissionStatus(filters: PanelFilters): Promise<SubmissionStatusRow[]>

  /**
   * Las semanas configuradas. RLS decide cuáles: el admin ve las de todos los
   * periodos, el alumno solo las del suyo — el mismo método sirve a las dos
   * pantallas.
   */
  getSemesterWeeks(): Promise<SemesterWeek[]>

  /**
   * Genera las semanas de un periodo: la 1 empieza en `firstWeekStart` y las
   * siguientes suman 7 días, `weekCount` veces. Falla si el periodo ya tiene
   * semanas — hay que borrarlas primero (`deleteSemesterWeeksForPeriod`).
   */
  createSemesterWeeks(
    periodCode: string,
    firstWeekStart: string,
    weekCount: number,
  ): Promise<void>

  /** Borra todas las semanas de un periodo, para volver a generarlas. */
  deleteSemesterWeeksForPeriod(periodCode: string): Promise<void>
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
  async submitJobSearchLog() {
    // Las lecturas devuelven vacío sin base de datos; una entrega no puede
    // fingir que se guardó. El alumno tiene que enterarse.
    throw new Error('No hay conexión con la base de datos. Tu entrega no se guardó.')
  },
  async submitInternshipLog() {
    throw new Error('No hay conexión con la base de datos. Tu entrega no se guardó.')
  },
  async updateJobSearchLog() {
    throw new Error('No hay conexión con la base de datos. Tu corrección no se guardó.')
  },
  async updateInternshipLog() {
    throw new Error('No hay conexión con la base de datos. Tu corrección no se guardó.')
  },
  async getLastSync() {
    return null
  },
  async runSheetSync() {
    throw new Error('No hay conexión con la base de datos. No se procesó nada.')
  },
  async getFormDeadlines() {
    return []
  },
  async createFormDeadline() {
    throw new Error('No hay conexión con la base de datos. La fecha no se guardó.')
  },
  async deleteFormDeadline() {
    throw new Error('No hay conexión con la base de datos. La fecha no se borró.')
  },
  async getSubmissionStatus() {
    return []
  },
  async getSemesterWeeks() {
    return []
  },
  async createSemesterWeeks() {
    throw new Error('No hay conexión con la base de datos. Las semanas no se guardaron.')
  },
  async deleteSemesterWeeksForPeriod() {
    throw new Error('No hay conexión con la base de datos. Las semanas no se borraron.')
  },
}

export const repository: PanelRepository = isSupabaseConfigured
  ? supabaseRepository
  : emptyRepository
