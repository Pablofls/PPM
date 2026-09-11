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
}
