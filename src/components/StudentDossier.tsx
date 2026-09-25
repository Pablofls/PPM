import { useEffect, useState, type ReactNode } from 'react'

import { repository } from '../data/repository'
import type {
  BaseRow,
  InternshipLogRow,
  JobSearchLogRow,
  SessionDay,
  StudentDossier as Dossier,
  SubmissionHistoryEntry,
} from '../data/types'
import type { FormCode, FormMeta } from '../lib/catalog'
import {
  formatDate,
  formatGender,
  formatSemester,
  formatSessionDay,
  formatWeekRange,
  toHref,
} from '../lib/format'
import { HOLLAND_LABELS } from '../lib/catalog'
import { Badge, Dash } from './Badge'
import { HollandRadar } from './HollandRadar'
import { SubmissionTimeline } from './SubmissionTimeline'

interface StudentDossierProps<T extends BaseRow> {
  row: T | null
  form: FormMeta
  onClose: () => void
  /** Detalle del formulario desde el que se abrió, debajo del expediente. */
  children?: (row: T) => ReactNode
}

/**
 * Expediente del alumno: todo lo que se sabe de él, sin importar desde qué
 * pantalla se abrió.
 *
 * Reemplaza al panel lateral por formulario. Aquel solo mostraba la pantalla en
 * la que estabas parado, y para responder «¿cómo va este alumno?» había que
 * recorrer las trece. Es la misma idea de la tarjeta ADN Profesional de la
 * plataforma anterior, que armaba esto leyendo ocho hojas del Sheets en cada
 * clic; aquí lo arma `v_student_dossier`.
 */
export function StudentDossier<T extends BaseRow>({
  row,
  form,
  onClose,
  children,
}: StudentDossierProps<T>) {
  const studentId = row?.studentId ?? null
  const { dossier, jobSearch, internship, error } = useDossier(studentId)
  const { history, error: historyError } = useSubmissionHistory(studentId, form.code)

  useEffect(() => {
    if (!row) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [row, onClose])

  if (!row) return null

  return (
    <div className="fixed inset-0 z-40 overflow-y-auto">
      <div
        className="fixed inset-0 bg-ink-950/40"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="relative mx-auto my-6 w-full max-w-7xl px-4">
        <article
          role="dialog"
          aria-label="Expediente del alumno"
          className="overflow-hidden rounded-xl border border-ink-200 bg-white shadow-2xl"
        >
          <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-ink-200 bg-white/95 px-6 py-4 backdrop-blur">
            <h2 className="text-lg font-semibold tracking-tight text-ink-950">
              ADN Profesional
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="shrink-0 rounded-lg p-1.5 text-ink-400 hover:bg-ink-100 hover:text-ink-900"
            >
              ✕
            </button>
          </header>

          <div className="space-y-7 px-6 py-6">
            {error ? (
              <p className="text-sm text-red-800">{error}</p>
            ) : (
              <>
                <DossierProfile dossier={dossier} fallback={row} />
                <JobSearchLogs rows={jobSearch} />
                <InternshipLogs rows={internship} />
              </>
            )}

            {children && (
              <Section title={`${form.label} ${form.name}`}>{children(row)}</Section>
            )}

            <Section title="Historial de respuestas">
              {historyError ? (
                <p className="text-sm text-red-800">{historyError}</p>
              ) : (
                <SubmissionTimeline
                  entries={history}
                  isConnected={repository.isConnected}
                />
              )}
            </Section>
          </div>
        </article>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Secciones
// ---------------------------------------------------------------------------

/** Datos que ya se conocen antes de que el expediente cargue, para pintarlos sin espera. */
interface IdentityFallback {
  fullName: string | null
  institutionalEmail: string | null
  degreeCode?: string | null
  semester?: number | null
  periodCode?: string | null
  sessionDay?: SessionDay | null
}

/**
 * Secciones I a V del expediente: identidad, intereses, personalidad,
 * comportamiento, valores y los datos de la práctica en curso.
 *
 * Es la misma tarjeta ADN Profesional de la plataforma anterior. Se usa tanto
 * en el expediente que abre el profesor como en el portal del alumno, sin las
 * bitácoras (VI y VII) ni el historial de respuestas: eso es contexto del
 * profesor, no algo que el alumno necesite ver de sí mismo.
 */
export function DossierProfile({
  dossier,
  fallback,
}: {
  dossier: Dossier | null
  fallback?: IdentityFallback
}) {
  return (
    <>
      {/*
        Dos columnas en pantalla ancha, como la tarjeta anterior: el perfil a
        la izquierda y el radar a la derecha. En móvil se apilan, que es lo
        que la versión de Apps Script no hacía.
      */}
      <div className="grid gap-7 lg:grid-cols-[1fr_auto]">
        <div className="min-w-0 space-y-6">
          <Identity dossier={dossier} fallback={fallback} />
          <Personality dossier={dossier} />
          <Values dossier={dossier} />
        </div>
        <Interests dossier={dossier} />
      </div>

      <Internship dossier={dossier} />
    </>
  )
}

function Identity({
  dossier,
  fallback,
}: {
  dossier: Dossier | null
  fallback?: IdentityFallback
}) {
  const linkedin = toHref(dossier?.linkedinUrl ?? null)
  const fullName = fallback?.fullName ?? dossier?.fullName ?? null
  const institutionalEmail = fallback?.institutionalEmail ?? dossier?.institutionalEmail ?? null
  const degreeCode = fallback?.degreeCode ?? dossier?.degreeCode ?? null
  const semester = fallback?.semester ?? dossier?.semester ?? null
  const periodCode = fallback?.periodCode ?? dossier?.periodCode ?? null
  const sessionDay = fallback?.sessionDay ?? dossier?.sessionDay ?? null

  return (
    <section>
      <h3 className="truncate text-2xl font-semibold tracking-tight text-ink-950">
        {fullName ?? institutionalEmail}
      </h3>

      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-600">
        {institutionalEmail && <span>{institutionalEmail}</span>}
        {dossier?.personalEmail && <span>{dossier.personalEmail}</span>}
        {dossier?.studentNumber && <span>Matrícula {dossier.studentNumber}</span>}
        {linkedin && (
          <a
            href={linkedin}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-ink-900 underline underline-offset-2 hover:text-ink-600"
          >
            LinkedIn
          </a>
        )}
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <InfoCard label="Fecha nac." value={formatDate(dossier?.birthDate ?? null)} />
        <InfoCard label="Edad" value={age(dossier?.birthDate ?? null)} />
        <InfoCard label="Carrera" value={degreeCode} />
        <InfoCard label="Semestre" value={formatSemester(semester)} />
        <InfoCard label="Período" value={periodCode} />
        <InfoCard label="País" value={dossier?.birthCountry ?? null} />
        <InfoCard label="Sexo" value={formatGender(dossier?.gender ?? null)} />
        <InfoCard label="Frecuencia" value={formatSessionDay(sessionDay)} />
      </dl>
    </section>
  )
}

/** I — Intereses Profesionales (Holland): radar y puntuaciones. */
function Interests({ dossier }: { dossier: Dossier | null }) {
  if (!dossier?.hollandTypes.length) return null

  // El formulario solo guarda los tres intereses más altos. Los otros tres ejes
  // del radar van en cero: es la información que existe, no un dato inventado.
  const scores: Record<string, number> = {}
  for (const interes of dossier.hollandTypes) {
    if (interes.score !== null) scores[interes.type] = interes.score
  }

  return (
    <Section
      title="I — Intereses Profesionales"
      hint="Holland Codes"
      badge={dossier.hollandCode}
    >
      <div className="lg:w-72">
        <HollandRadar scores={scores} />

        <div className="mt-3 flex flex-wrap justify-center gap-2">
          {dossier.hollandTypes.map((interes, index) => (
            <div
              key={`${interes.type}-${index}`}
              className="min-w-16 rounded-lg border border-ink-200 bg-ink-50 px-3 py-2 text-center"
            >
              <p className="text-lg leading-none font-bold text-ink-900">
                {interes.type}
              </p>
              <p className="tnum mt-1 text-sm font-semibold text-ink-700">
                {interes.score ?? '—'}
              </p>
              <p className="mt-0.5 text-[10px] text-ink-500">
                {HOLLAND_LABELS[interes.type] ?? interes.type}
              </p>
            </div>
          ))}
        </div>
      </div>
    </Section>
  )
}

/** II y III — Personalidad (MBTI) y Comportamiento (DISC), juntos. */
function Personality({ dossier }: { dossier: Dossier | null }) {
  const hasMbti = Boolean(dossier?.mbtiType)
  const hasDisc = Boolean(dossier?.discStyle || dossier?.discCategory)
  if (!dossier || (!hasMbti && !hasDisc)) return null

  const report = toHref(dossier.mbtiReportUrl)

  return (
    <div className="space-y-6">
      {hasMbti && (
        <Section title="II — Personalidad" hint="Myers-Briggs">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="violet">
              {dossier.mbtiType}
              {dossier.mbtiIdentity ? ` — ${dossier.mbtiIdentity}` : ''}
            </Badge>
            {report && <ExternalLink href={report}>Ver perfil</ExternalLink>}
          </div>
        </Section>
      )}

      {hasDisc && (
        <Section title="III — Comportamiento" hint="DISC">
          <div className="flex flex-wrap items-center gap-2">
            {dossier.discStyle && <Badge tone="amber">{dossier.discStyle}</Badge>}
            {dossier.discCategory && <Badge>{dossier.discCategory}</Badge>}
            {/*
              La respuesta llegó contaminada desde el formulario (traducciones
              automáticas, texto libre). Se marca en vez de esconderla: el dato
              existe, solo no es de fiar.
            */}
            {dossier.discNeedsReview && <Badge tone="red">Revisar</Badge>}
          </div>
        </Section>
      )}
    </div>
  )
}

/** IV — Valores. */
function Values({ dossier }: { dossier: Dossier | null }) {
  if (!dossier?.topValues.length) return null
  const report = toHref(dossier.valuesReportUrl)

  return (
    <Section title="IV — Valores">
      <div className="flex flex-wrap items-center gap-2">
        {dossier.topValues.map((valor) => (
          <Badge key={valor} tone="green">
            {valor}
          </Badge>
        ))}
        {report && <ExternalLink href={report}>Ver</ExternalLink>}
      </div>
    </Section>
  )
}

/** V — Datos de la práctica en curso, del formulario B.1. */
function Internship({ dossier }: { dossier: Dossier | null }) {
  if (!dossier) return null

  const campos: [string, string | null][] = [
    ['Empresa', dossier.companyName],
    ['Giro', dossier.industry],
    ['Dirección', dossier.address],
    ['Departamento', dossier.department],
    ['Jefe', dossier.supervisorInfo],
    ['Correo jefe', dossier.supervisorEmail],
    ['Tel. jefe', dossier.supervisorPhone],
    ['Página web', dossier.companyWebsite],
    ['Contrato', boolLabel(dossier.hasContract)],
    ['Sueldo', dossier.salary === null ? null : formatMoney(dossier.salary)],
  ]
  const presentes = campos.filter(([, valor]) => valor)
  if (!presentes.length) return null

  return (
    <Section title="V — Datos de Prácticas Profesionales">
      <div className="overflow-hidden rounded-lg border border-ink-200">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="w-40 border-b border-ink-200 bg-ink-50 px-3 py-2 text-left text-[11px] font-semibold tracking-wider text-ink-500 uppercase">
                Campo
              </th>
              <th className="border-b border-ink-200 bg-ink-50 px-3 py-2 text-left text-[11px] font-semibold tracking-wider text-ink-500 uppercase">
                Información
              </th>
            </tr>
          </thead>
          <tbody>
            {presentes.map(([etiqueta, valor]) => (
              <tr key={etiqueta} className="align-top">
                <td className="border-b border-ink-100 px-3 py-2 text-[11px] font-semibold tracking-wider whitespace-nowrap text-ink-500 uppercase">
                  {etiqueta}
                </td>
                <td className="border-b border-ink-100 px-3 py-2 break-words text-ink-800">
                  {valor}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  )
}

/** VI — Bitácora de búsqueda de empleo. */
function JobSearchLogs({ rows }: { rows: JobSearchLogRow[] }) {
  if (!rows.length) return null

  return (
    <Section title="VI — Reporte de Búsqueda" hint={entryCount(rows.length)}>
      <LogTable
        headers={[
          'Semana',
          'Actividades',
          'Aplicaciones',
          'Entrevistas',
          'Aprendizajes',
          'Siguientes pasos',
        ]}
        rows={rows.map((log) => ({
          key: log.submissionId,
          week: log,
          cells: [
            log.activities,
            log.applications,
            log.interviews,
            log.learnings,
            log.nextSteps,
          ],
        }))}
      />
    </Section>
  )
}

/** VII — Bitácora de prácticas, con las horas acumuladas. */
function InternshipLogs({ rows }: { rows: InternshipLogRow[] }) {
  if (!rows.length) return null

  // Igual en todas las filas: la vista lo calcula por alumno.
  const total = rows[0].totalHours

  return (
    <Section title="VII — Reporte de Prácticas" hint={entryCount(rows.length)}>
      <LogTable
        headers={['Semana', 'Actividades', 'Horas', 'Acumulado', 'Habilidades', 'Propuesta']}
        rows={rows.map((log) => ({
          key: log.submissionId,
          week: log,
          cells: [
            log.activities,
            log.hoursWorked === null ? null : String(log.hoursWorked),
            log.cumulativeHours === null ? null : `${log.cumulativeHours} hrs`,
            log.skillsPracticed,
            log.proposal,
          ],
          numeric: [1, 2],
        }))}
      />

      {total !== null && (
        <div className="flex items-center justify-end gap-2 border-t-2 border-ink-200 bg-ink-50 px-3 py-2">
          <span className="text-xs font-medium text-ink-500">Total de horas</span>
          <span className="tnum text-sm font-semibold text-ink-950">{total} hrs</span>
        </div>
      )}
    </Section>
  )
}

// ---------------------------------------------------------------------------
// Piezas compartidas
// ---------------------------------------------------------------------------

interface LogRow {
  key: string
  week: { weekStart: string | null; weekEnd: string | null }
  cells: (string | null)[]
  /** Índices de `cells` que se alinean a la derecha. */
  numeric?: number[]
}

/**
 * Tabla de una bitácora. Las celdas son texto libre que el alumno escribió, así
 * que se limitan de ancho y conservan sus saltos de línea.
 */
function LogTable({ headers, rows }: { headers: string[]; rows: LogRow[] }) {
  return (
    <div className="max-h-96 overflow-auto rounded-lg border border-ink-200">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            {headers.map((header) => (
              <th
                key={header}
                className="sticky top-0 z-10 border-b border-ink-200 bg-ink-50 px-3 py-2 text-left text-[11px] font-semibold tracking-wider whitespace-nowrap text-ink-500 uppercase"
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="align-top hover:bg-ink-50/60">
              <td className="tnum border-b border-ink-100 px-3 py-2.5 text-xs whitespace-nowrap text-ink-500">
                {formatWeekRange(row.week.weekStart, row.week.weekEnd) || <Dash />}
              </td>
              {row.cells.map((cell, index) => (
                <td
                  key={index}
                  className={`border-b border-ink-100 px-3 py-2.5 text-ink-700 ${
                    row.numeric?.includes(index)
                      ? 'tnum whitespace-nowrap text-right'
                      : 'min-w-40 max-w-56 whitespace-pre-line'
                  }`}
                >
                  {cell || <Dash />}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Section({
  title,
  hint,
  badge,
  children,
}: {
  title: string
  hint?: string
  badge?: string | null
  children: ReactNode
}) {
  return (
    <section>
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink-950">
        {title}
        {hint && <span className="font-normal text-ink-400">({hint})</span>}
        {badge && <Badge tone="blue">{badge}</Badge>}
      </h3>
      {children}
    </section>
  )
}

/** Dato del alumno en recuadro, como en la tarjeta de la plataforma anterior. */
function InfoCard({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="rounded-lg border border-ink-100 bg-ink-50 px-3 py-2">
      <dt className="text-[10px] font-semibold tracking-wider text-ink-400 uppercase">
        {label}
      </dt>
      <dd className="mt-0.5 truncate text-sm font-medium text-ink-900" title={value ?? ''}>
        {value || <Dash />}
      </dd>
    </div>
  )
}

function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-xs font-medium text-ink-600 underline underline-offset-2 hover:text-ink-900"
    >
      {children}
    </a>
  )
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

function entryCount(n: number): string {
  return n === 1 ? '1 entrada' : `${n} entradas`
}

function boolLabel(value: boolean | null): string | null {
  if (value === null) return null
  return value ? 'Sí' : 'No'
}

const MONEY = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 0,
})

function formatMoney(value: number): string {
  return MONEY.format(value)
}

function age(birthDate: string | null): string {
  if (!birthDate) return ''
  const nacimiento = new Date(birthDate)
  if (Number.isNaN(nacimiento.getTime())) return ''

  const hoy = new Date()
  let años = hoy.getFullYear() - nacimiento.getFullYear()
  const mes = hoy.getMonth() - nacimiento.getMonth()
  if (mes < 0 || (mes === 0 && hoy.getDate() < nacimiento.getDate())) años -= 1

  // Las fechas de nacimiento vienen del Sheets y algunas llegaron corruptas.
  // Una edad absurda dice más si se oculta que si se muestra como un hecho.
  return años > 0 && años < 120 ? `${años} años` : ''
}

// ---------------------------------------------------------------------------
// Consultas
// ---------------------------------------------------------------------------

/** Solo el expediente (secciones I a V), sin las bitácoras ni el historial. */
export function useStudentDossier(studentId: string | null) {
  const [dossier, setDossier] = useState<Dossier | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!studentId) {
      setDossier(null)
      setError(null)
      return
    }

    let cancelled = false
    repository
      .getStudentDossier(studentId)
      .then((expediente) => {
        if (cancelled) return
        setDossier(expediente)
        setError(null)
      })
      .catch((cause: unknown) => {
        if (cancelled) return
        setDossier(null)
        setError(cause instanceof Error ? cause.message : 'Error desconocido')
      })

    return () => {
      cancelled = true
    }
  }, [studentId])

  return { dossier, error }
}

function useDossier(studentId: string | null) {
  const [dossier, setDossier] = useState<Dossier | null>(null)
  const [jobSearch, setJobSearch] = useState<JobSearchLogRow[]>([])
  const [internship, setInternship] = useState<InternshipLogRow[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!studentId) {
      setDossier(null)
      setJobSearch([])
      setInternship([])
      setError(null)
      return
    }

    let cancelled = false

    Promise.all([
      repository.getStudentDossier(studentId),
      repository.getJobSearchLogs(studentId),
      repository.getInternshipLogs(studentId),
    ])
      .then(([expediente, busqueda, practicas]) => {
        if (cancelled) return
        setDossier(expediente)
        setJobSearch(busqueda)
        setInternship(practicas)
        setError(null)
      })
      .catch((cause: unknown) => {
        if (cancelled) return
        setDossier(null)
        setJobSearch([])
        setInternship([])
        setError(cause instanceof Error ? cause.message : 'Error desconocido')
      })

    return () => {
      cancelled = true
    }
  }, [studentId])

  return { dossier, jobSearch, internship, error }
}

function useSubmissionHistory(studentId: string | null, formCode: FormCode) {
  const [history, setHistory] = useState<SubmissionHistoryEntry[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!studentId) {
      setHistory([])
      setError(null)
      return
    }

    let cancelled = false
    repository
      .getSubmissionHistory(studentId, formCode)
      .then((entries) => {
        if (cancelled) return
        setHistory(entries)
        setError(null)
      })
      .catch((cause: unknown) => {
        if (cancelled) return
        setHistory([])
        setError(cause instanceof Error ? cause.message : 'Error desconocido')
      })

    return () => {
      cancelled = true
    }
  }, [studentId, formCode])

  return { history, error }
}
