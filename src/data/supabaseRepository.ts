/**
 * Implementación del repositorio contra Supabase.
 *
 * Cada pantalla consulta su vista `v_panel_*` (ver `0008_views_panel.sql`), que
 * ya entrega una fila por alumno con su respuesta vigente. Aquí solo se aplican
 * los filtros y se traduce snake_case a camelCase.
 *
 * Si una consulta falla, el error se propaga: es preferible que la pantalla diga
 * que algo falló a que muestre una tabla vacía y parezca que no hay respuestas.
 */

import type { PostgrestFilterBuilder } from '@supabase/postgrest-js'

import type { FormCode, SkillLevel } from '../lib/catalog'
import { SKILL_GROUPS } from '../lib/catalog'
import type { PanelRepository } from './repository'
import { supabase } from './supabaseClient'
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
  InternshipRow,
  JobSearchLogInput,
  JobSearchLogRow,
  MbtiRow,
  PanelFilters,
  ReflectionRow,
  SkillsRow,
  StudentDossier,
  SubmissionHistoryEntry,
  SubmissionState,
  SubmissionStatusRow,
  SyncStatus,
  ValuesRow,
} from './types'

/** Fila cruda de una vista `v_panel_*`. */
type PanelRecord = Record<string, unknown>

/**
 * Aplica los filtros compartidos. Todas las vistas `v_panel_*` exponen estas
 * mismas columnas, así que el filtrado es idéntico en las 11 pantallas.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyFilters<T extends PostgrestFilterBuilder<any, any, any, any, any>>(
  query: T,
  filters: PanelFilters,
): T {
  let next = query
  if (filters.search) {
    next = next.ilike('institutional_email', `%${filters.search}%`) as T
  }
  if (filters.language) next = next.eq('language', filters.language) as T
  if (filters.sessionDay) next = next.eq('session_day', filters.sessionDay) as T
  if (filters.degree) next = next.eq('degree_code', filters.degree) as T
  if (filters.semester) next = next.eq('semester', Number(filters.semester)) as T
  if (filters.period) next = next.eq('period_code', filters.period) as T
  return next
}

/**
 * Filtrado de los apéndices.
 *
 * Su buscador es por **nombre de alumno o de empresa**, no por correo, igual que
 * en la plataforma anterior. El resto de los filtros compartidos no aplica: esas
 * pantallas no los tienen.
 */
async function fetchAppendix(view: string, filters: PanelFilters): Promise<PanelRecord[]> {
  let query = supabase.from(view).select('*')

  if (filters.search) {
    const patron = `%${filters.search}%`
    query = query.or(`full_name.ilike.${patron},company_name.ilike.${patron}`)
  }
  if (filters.period) query = query.eq('period_code', filters.period)

  const { data, error } = await query.order('full_name', {
    ascending: true,
    nullsFirst: false,
  })

  if (error) throw new Error(`No se pudieron cargar los datos: ${error.message}`)
  return (data ?? []) as PanelRecord[]
}

async function fetchRows(view: string, filters: PanelFilters): Promise<PanelRecord[]> {
  const { data, error } = await applyFilters(
    supabase.from(view).select('*'),
    filters,
  ).order('full_name', { ascending: true, nullsFirst: false })

  if (error) throw new Error(`No se pudieron cargar los datos: ${error.message}`)
  return (data ?? []) as PanelRecord[]
}

/** Campos comunes a todas las pantallas. */
function baseRow(record: PanelRecord) {
  return {
    studentId: str(record.student_id) ?? '',
    institutionalEmail: str(record.institutional_email) ?? '',
    fullName: str(record.full_name),
    language: (str(record.language) as 'es' | 'en' | null) ?? null,
    sessionDay: (str(record.session_day) as 'lunes' | 'miercoles' | null) ?? null,
    degreeCode: str(record.degree_code),
    semester: num(record.semester),
    periodCode: str(record.period_code),
    submissionId: str(record.submission_id) ?? '',
    submittedAt: str(record.submitted_at),
    // Sin `fechas_entrega` importadas no hay contra qué comparar. La columna
    // "Entrega" del Módulo 2 empieza a calcular sola en cuanto existan.
    submissionState: 'sin_fecha' as const,
  }
}

const str = (value: unknown): string | null =>
  typeof value === 'string' ? value : null

const num = (value: unknown): number | null =>
  typeof value === 'number' ? value : null

const bool = (value: unknown): boolean | null =>
  typeof value === 'boolean' ? value : null

/** Las claves de las 33 habilidades, en el orden en que se muestran. */
const SKILL_KEYS = SKILL_GROUPS.flatMap((group) => group.skills.map((s) => s.key))

export const supabaseRepository: PanelRepository = {
  isConnected: true,

  async getSummary(formCode: FormCode, filters: PanelFilters): Promise<FormSummary | null> {
    const view = VIEW_BY_FORM[formCode]

    let responses = applyFilters(
      supabase.from(view).select('*', { count: 'exact', head: true }),
      filters,
    )
    if (REFLECTION_VIEW === view) responses = responses.eq('form_code', formCode)

    const students = applyFilters(
      supabase.from('v_students_directory').select('*', { count: 'exact', head: true }),
      filters,
    )

    const [answered, total] = await Promise.all([responses, students])
    if (answered.error) {
      throw new Error(`No se pudo contar las respuestas: ${answered.error.message}`)
    }

    const responseCount = answered.count ?? 0
    const studentCount = total.count ?? 0

    return {
      responses: responseCount,
      pending: Math.max(0, studentCount - responseCount),
      // Sin fechas de entrega configuradas no hay forma de saber si algo llegó
      // tarde. `null` se muestra como "—", que es honesto; un 0 haría creer que
      // se comprobó y no hubo ninguna.
      late: null,
    }
  },

  async getDemographics(filters) {
    const rows = await fetchRows('v_panel_demographics', filters)
    return rows.map<DemographicsRow>((record) => ({
      ...baseRow(record),
      studentNumber: str(record.student_number),
      personalEmail: str(record.personal_email),
      birthDate: str(record.birth_date),
      birthCountry: str(record.birth_country),
      gender: str(record.gender) as DemographicsRow['gender'],
    }))
  },

  async getHolland(filters) {
    const rows = await fetchRows('v_panel_holland', filters)
    return rows.map<HollandRow>((record) => ({
      ...baseRow(record),
      hollandCode: str(record.holland_code),
      firstType: str(record.first_type),
      firstScore: num(record.first_score),
      secondType: str(record.second_type),
      secondScore: num(record.second_score),
      thirdType: str(record.third_type),
      thirdScore: num(record.third_score),
    }))
  },

  async getMbti(filters) {
    const rows = await fetchRows('v_panel_mbti', filters)
    return rows.map<MbtiRow>((record) => ({
      ...baseRow(record),
      mbtiType: str(record.mbti_type),
      identity: str(record.identity),
      energy: str(record.energy),
      energyPct: num(record.energy_pct),
      mind: str(record.mind),
      mindPct: num(record.mind_pct),
      nature: str(record.nature),
      naturePct: num(record.nature_pct),
      tactics: str(record.tactics),
      tacticsPct: num(record.tactics_pct),
      reportUrl: str(record.report_url),
    }))
  },

  async getDisc(filters) {
    const rows = await fetchRows('v_panel_disc', filters)
    return rows.map<DiscRow>((record) => ({
      ...baseRow(record),
      discStyle: str(record.disc_style),
      discCategory: str(record.disc_category),
      explanation: str(record.explanation),
      needsReview: bool(record.needs_review) ?? false,
    }))
  },

  async getSkills(filters) {
    const rows = await fetchRows('v_panel_skills', filters)
    return rows.map<SkillsRow>((record) => {
      const skills: Partial<Record<string, SkillLevel | null>> = {}
      for (const key of SKILL_KEYS) {
        skills[key] = (str(record[key]) as SkillLevel | null) ?? null
      }
      return {
        ...baseRow(record),
        isPefistaGraduating: bool(record.is_pefista_graduating),
        skills,
      }
    })
  },

  async getValues(filters) {
    const rows = await fetchRows('v_panel_values', filters)
    return rows.map<ValuesRow>((record) => ({
      ...baseRow(record),
      topValues: Array.isArray(record.top_values) ? (record.top_values as string[]) : [],
      score: num(record.score),
      reportUrl: str(record.report_url),
    }))
  },

  async getReflections(formCode, filters) {
    // Los cuatro formularios comparten vista; el form_code los distingue.
    const { data, error } = await applyFilters(
      supabase.from(REFLECTION_VIEW).select('*').eq('form_code', formCode),
      filters,
    ).order('full_name', { ascending: true, nullsFirst: false })

    if (error) throw new Error(`No se pudieron cargar los datos: ${error.message}`)

    return ((data ?? []) as PanelRecord[]).map<ReflectionRow>((record) => ({
      ...baseRow(record),
      wasUseful: bool(record.was_useful),
      reason: str(record.reason),
    }))
  },

  async getIndeed(filters) {
    const rows = await fetchRows('v_panel_indeed', filters)
    return rows.map<IndeedRow>((record) => ({
      ...baseRow(record),
      positions: str(record.positions),
      positionUrls: [
        str(record.position_url_1),
        str(record.position_url_2),
        str(record.position_url_3),
      ],
      companies: str(record.companies),
      companyUrls: [
        str(record.company_url_1),
        str(record.company_url_2),
        str(record.company_url_3),
      ],
    }))
  },

  async getInternships(filters) {
    const rows = await fetchAppendix('v_panel_internships', filters)
    return rows.map<InternshipRow>((record) => ({
      ...baseRow(record),
      companyName: str(record.company_name),
      companyWebsite: str(record.company_website),
      companyTaxId: str(record.company_tax_id),
      companyFoundedYear: num(record.company_founded_year),
      requiredHours: num(record.required_hours),
      internshipOption: str(record.internship_option),
      restrictions: str(record.restrictions),
      department: str(record.department),
      supervisorName: str(record.supervisor_name),
      supervisorRole: str(record.supervisor_role),
      supervisorEmail: str(record.supervisor_email),
      supervisorPhone: str(record.supervisor_phone),
      schedule: str(record.schedule),
      isPaid: bool(record.is_paid),
      description: str(record.description),
      careerRelation: str(record.career_relation),
      professionalRelation: str(record.professional_relation),
      companyValidation: str(record.company_validation),
    }))
  },

  async getCompanies(filters) {
    const rows = await fetchAppendix('v_panel_companies', filters)
    return rows.map<CompanyRow>((record) => ({
      ...baseRow(record),
      companyName: str(record.company_name),
      companyWebsite: str(record.company_website),
      industry: str(record.industry),
      mission: str(record.mission),
      vision: str(record.vision),
      companyValues: str(record.company_values),
      address: str(record.address),
      workSchedule: str(record.work_schedule),
      department: str(record.department),
      supervisorInfo: str(record.supervisor_info),
      supervisorEmail: str(record.supervisor_email),
      supervisorPhone: str(record.supervisor_phone),
      activities: str(record.activities),
      hasContract: bool(record.has_contract),
      salary: num(record.salary),
      hasLinkedinProfile: bool(record.has_linkedin_profile),
      linkedinConnections: num(record.linkedin_connections),
      linkedinUrl: str(record.linkedin_url),
    }))
  },

  async getSubmissionHistory(studentId, formCode): Promise<SubmissionHistoryEntry[]> {
    // Aquí sí se consulta `submissions` directamente: el panel del alumno
    // muestra TODAS sus respuestas, no solo la vigente.
    const { data, error } = await supabase
      .from('submissions')
      .select('id, form_code, submitted_at, language')
      .eq('student_id', studentId)
      .eq('form_code', formCode)
      .order('submitted_at', { ascending: false })

    if (error) {
      throw new Error(`No se pudo cargar el historial: ${error.message}`)
    }

    return (data ?? []).map((record, index) => ({
      submissionId: record.id as string,
      formCode: record.form_code as FormCode,
      submittedAt: record.submitted_at as string,
      language: (record.language as 'es' | 'en' | null) ?? null,
      weekStart: null,
      weekEnd: null,
      // Vienen ordenadas de más reciente a más antigua: la primera es la vigente.
      isLatest: index === 0,
    }))
  },

  async getStudentDossier(studentId): Promise<StudentDossier | null> {
    const { data, error } = await supabase
      .from('v_student_dossier')
      .select('*')
      .eq('student_id', studentId)
      .maybeSingle()

    if (error) throw new Error(`No se pudo cargar el expediente: ${error.message}`)
    if (!data) return null

    const record = data as PanelRecord

    // Los tres intereses llegan como columnas sueltas y se arman en una lista:
    // la pantalla los pinta en orden y un alumno puede tener solo uno o ninguno.
    const hollandTypes = (
      [
        ['holland_first_type', 'holland_first_score'],
        ['holland_second_type', 'holland_second_score'],
        ['holland_third_type', 'holland_third_score'],
      ] as const
    )
      .map(([tipo, puntaje]) => ({
        type: str(record[tipo]),
        score: num(record[puntaje]),
      }))
      .filter((interes): interes is { type: string; score: number | null } =>
        interes.type !== null,
      )

    return {
      studentId: str(record.student_id) ?? '',
      institutionalEmail: str(record.institutional_email) ?? '',
      fullName: str(record.full_name),
      language: null,
      sessionDay: (str(record.session_day) as 'lunes' | 'miercoles' | null) ?? null,
      degreeCode: str(record.degree_code),
      semester: num(record.semester),
      periodCode: str(record.period_code),

      studentNumber: str(record.student_number),
      personalEmail: str(record.personal_email),
      birthDate: str(record.birth_date),
      birthCountry: str(record.birth_country),
      gender: (str(record.gender) as StudentDossier['gender']) ?? null,

      hollandCode: str(record.holland_code),
      hollandTypes,

      mbtiType: str(record.mbti_type),
      mbtiIdentity: str(record.mbti_identity),
      mbtiReportUrl: str(record.mbti_report_url),

      discStyle: str(record.disc_style),
      discCategory: str(record.disc_category),
      discNeedsReview: bool(record.disc_needs_review) ?? false,

      topValues: Array.isArray(record.top_values)
        ? (record.top_values as string[])
        : [],
      valuesScore: num(record.values_score),
      valuesReportUrl: str(record.values_report_url),

      companyName: str(record.company_name),
      industry: str(record.industry),
      address: str(record.address),
      department: str(record.department),
      supervisorInfo: str(record.supervisor_info),
      supervisorEmail: str(record.supervisor_email),
      supervisorPhone: str(record.supervisor_phone),
      companyWebsite: str(record.company_website),
      hasContract: bool(record.has_contract),
      salary: num(record.salary),
      linkedinUrl: str(record.linkedin_url),
    }
  },

  async getJobSearchLogs(studentId): Promise<JobSearchLogRow[]> {
    const data = await fetchLogs('v_student_job_search_logs', studentId)
    return data.map((record) => ({
      ...weeklyLogBase(record),
      applications: str(record.applications),
      interviews: str(record.interviews),
      learnings: str(record.learnings),
      nextSteps: str(record.next_steps),
    }))
  },

  async getInternshipLogs(studentId): Promise<InternshipLogRow[]> {
    const data = await fetchLogs('v_student_internship_logs', studentId)
    return data.map((record) => ({
      ...weeklyLogBase(record),
      hoursWorked: num(record.hours_worked),
      skillsPracticed: str(record.skills_practiced),
      proposal: str(record.proposal),
      cumulativeHours: num(record.cumulative_hours),
      totalHours: num(record.total_hours),
    }))
  },

  /**
   * Las entregas del alumno.
   *
   * Pasan por una función de la base y no por dos `insert` encadenados porque
   * la entrega son dos filas —la de `submissions` y la de la bitácora— y el
   * cliente no tiene transacciones: si la segunda fallara, el expediente del
   * alumno quedaría con una semana reportada y vacía que nadie puede borrar.
   *
   * El alumno no se manda como parámetro. Lo resuelve `current_student_id()`
   * en la base, a partir de la sesión, y las políticas de RLS verifican que
   * coincida. Lo que se escriba aquí desde la consola del navegador no cambia
   * de quién es la entrega.
   */
  async submitJobSearchLog(input: JobSearchLogInput): Promise<void> {
    const { error } = await supabase.rpc('submit_job_search_log', {
      p_week_start: input.weekStart,
      p_week_end: input.weekEnd,
      p_activities: input.activities,
      p_applications: input.applications,
      p_interviews: input.interviews,
      p_learnings: input.learnings,
      p_next_steps: input.nextSteps,
    })

    if (error) throw new Error(submissionError(error.message))
  },

  async submitInternshipLog(input: InternshipLogInput): Promise<void> {
    const { error } = await supabase.rpc('submit_internship_log', {
      p_week_start: input.weekStart,
      p_week_end: input.weekEnd,
      p_activities: input.activities,
      p_hours_worked: input.hoursWorked,
      p_skills_practiced: input.skillsPracticed,
      p_proposal: input.proposal,
    })

    if (error) throw new Error(submissionError(error.message))
  },

  /**
   * La última corrida del Apps Script que sincroniza el Sheets.
   *
   * Se lee `sheet_sync_runs` directamente y no una vista: son dos columnas y no
   * hay nada que componer. La tabla tiene RLS con `is_admin()`, así que un
   * alumno no la ve (regla «Toda pantalla nace protegida y admin-only»).
   */
  async getLastSync(): Promise<SyncStatus | null> {
    const { data, error } = await supabase
      .from('sheet_sync_runs')
      .select('started_at, finished_at')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      throw new Error(`No se pudo leer la última sincronización: ${error.message}`)
    }
    if (!data) return null

    return {
      startedAt: data.started_at as string,
      finishedAt: (data.finished_at as string | null) ?? null,
    }
  },

  async getFormDeadlines(): Promise<FormDeadline[]> {
    const { data, error } = await supabase
      .from('form_deadlines')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) throw new Error(`No se pudieron cargar las fechas límite: ${error.message}`)

    return ((data ?? []) as PanelRecord[]).map((record) => ({
      id: str(record.id) ?? '',
      formCode: record.form_code as FormCode,
      language: (str(record.language) as 'es' | 'en' | null) ?? null,
      sessionDay: (str(record.session_day) as 'lunes' | 'miercoles' | null) ?? null,
      periodCode: str(record.period_code),
      dueAt: str(record.due_at) ?? '',
      createdAt: str(record.created_at) ?? '',
    }))
  },

  async createFormDeadline(input: FormDeadlineInput): Promise<void> {
    const { error } = await supabase.from('form_deadlines').insert({
      form_code: input.formCode,
      language: input.language,
      session_day: input.sessionDay,
      period_code: input.periodCode,
      due_at: input.dueAt,
    })

    if (error) throw new Error(`No se pudo guardar la fecha límite: ${error.message}`)
  },

  async deleteFormDeadline(id: string): Promise<void> {
    const { error } = await supabase.from('form_deadlines').delete().eq('id', id)
    if (error) throw new Error(`No se pudo borrar la fecha límite: ${error.message}`)
  },

  /**
   * `v_submission_status` es "un alumno, un formulario" por fila (como
   * `submissions` misma); aquí se pivotea a "un alumno" con un estado por
   * formulario, que es como la matriz de la pantalla la consume.
   */
  async getSubmissionStatus(filters: PanelFilters): Promise<SubmissionStatusRow[]> {
    const { data, error } = await applyFilters(
      supabase.from('v_submission_status').select('*'),
      filters,
    ).order('full_name', { ascending: true, nullsFirst: false })

    if (error) throw new Error(`No se pudieron cargar las entregas: ${error.message}`)

    const rows = new Map<string, SubmissionStatusRow>()
    for (const record of (data ?? []) as PanelRecord[]) {
      const studentId = str(record.student_id) ?? ''
      let row = rows.get(studentId)
      if (!row) {
        row = {
          studentId,
          institutionalEmail: str(record.institutional_email) ?? '',
          fullName: str(record.full_name),
          degreeCode: str(record.degree_code),
          semester: num(record.semester),
          periodCode: str(record.period_code),
          sessionDay: (str(record.session_day) as 'lunes' | 'miercoles' | null) ?? null,
          statuses: {},
        }
        rows.set(studentId, row)
      }
      row.statuses[record.form_code as FormCode] = {
        state: (str(record.state) as SubmissionState) ?? 'sin_fecha',
        submittedAt: str(record.submitted_at),
      }
    }
    return [...rows.values()]
  },
}

/**
 * Las dos bitácoras se consultan igual: todas las semanas de un alumno, de la
 * más reciente a la más antigua.
 *
 * Se ordena por `week_start` y no por `submitted_at` porque lo que el profesor
 * lee es la semana reportada, no cuándo se acordó de reportarla.
 */
async function fetchLogs(view: string, studentId: string): Promise<PanelRecord[]> {
  const { data, error } = await supabase
    .from(view)
    .select('*')
    .eq('student_id', studentId)
    .order('week_start', { ascending: false, nullsFirst: false })
    .order('submitted_at', { ascending: false })

  if (error) throw new Error(`No se pudo cargar la bitácora: ${error.message}`)
  return (data ?? []) as PanelRecord[]
}

/**
 * Mensaje de una entrega que no se guardó.
 *
 * Los `raise exception` de las funciones de la base ya vienen en español y
 * escritos para el alumno («Las horas de la semana tienen que estar entre 0 y
 * 168»): esos se muestran tal cual. Lo que no hay que enseñarle es el error de
 * una política de RLS o de un constraint, que habla de nombres de tablas.
 */
function submissionError(message: string): string {
  if (/row-level security|violates|constraint|permission denied/i.test(message)) {
    return 'No se pudo guardar tu entrega. Verifica que tu cuenta sea la de un alumno y vuelve a intentarlo.'
  }
  return message
}

function weeklyLogBase(record: PanelRecord) {
  return {
    submissionId: str(record.submission_id) ?? '',
    submittedAt: str(record.submitted_at),
    weekStart: str(record.week_start),
    weekEnd: str(record.week_end),
    activities: str(record.activities),
  }
}

const REFLECTION_VIEW = 'v_panel_reflections'

const VIEW_BY_FORM: Record<FormCode, string> = {
  form1_0: 'v_panel_demographics',
  form1_1: 'v_panel_holland',
  form1_2: 'v_panel_mbti',
  form1_3: 'v_panel_disc',
  form1_4: 'v_panel_skills',
  form1_5: 'v_panel_values',
  form2_1: REFLECTION_VIEW,
  form2_2: REFLECTION_VIEW,
  form2_4: REFLECTION_VIEW,
  form2_5: REFLECTION_VIEW,
  form2_7: 'v_panel_indeed',
  formA_1: 'v_panel_internships',
  formB_1: 'v_panel_companies',
}
