import { Link } from 'react-router-dom'

import { useAuth } from '../../auth/AuthProvider'
import { usePermissions } from '../../auth/PermissionsProvider'
import { Badge } from '../../components/Badge'
import { useWeeklyLogRows } from '../../data/hooks'
import { localizeWeeklyForm, WEEKLY_FORMS, type WeeklyFormMeta } from '../../lib/catalog'
import { useLang, useT } from '../../lib/i18n'
import { formatRelativeTime, formatWeekRange } from '../../lib/format'

/**
 * Actividades del alumno: la lista de tareas de un curso, como en Canvas.
 *
 * Hoy son las dos bitácoras semanales, que son los únicos formularios que el
 * alumno contesta aquí; los otros trece se siguen contestando en Google Forms.
 * Cada tarjeta lleva a su reporte, que vive debajo de esta ruta para que el
 * rail siga marcando «Actividades» mientras el alumno está dentro.
 */
export function StudentActivitiesPage() {
  // Lo que el rol alumno puede ver (0038): cada bitácora es una pantalla con permiso.
  const { can, loading } = usePermissions()
  const t = useT()
  const lang = useLang()
  const forms = WEEKLY_FORMS.filter((form) => can(form.code)).map((form) =>
    localizeWeeklyForm(form, lang),
  )

  return (
    <>
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-ink-950">
          {t('Actividades', 'Assignments')}
        </h1>
        <p className="mt-1 text-sm text-ink-600">
          {t(
            'Tus reportes semanales: entra a cada uno para entregar la semana y ver lo que ya entregaste.',
            'Your weekly reports: open each one to submit this week and see what you have already submitted.',
          )}
        </p>
      </header>

      {forms.length > 0 ? (
        <ul className="mt-6 grid gap-3 sm:grid-cols-2">
          {forms.map((form) => (
            <li key={form.code}>
              <AssignmentCard form={form} />
            </li>
          ))}
        </ul>
      ) : (
        !loading && (
          <p className="mt-6 rounded-xl border border-dashed border-ink-200 bg-white px-5 py-8 text-center text-sm text-ink-500">
            {t('Todavía no tienes actividades asignadas.', 'You have no assignments yet.')}
          </p>
        )
      )}
    </>
  )
}

/**
 * La tarjeta de una actividad, con su última entrega.
 *
 * El resumen es lo que convierte la lista en algo útil: sin él, el alumno tiene
 * que entrar a cada actividad para saber si ya entregó la semana.
 */
function AssignmentCard({ form }: { form: WeeklyFormMeta }) {
  const { entregas, ultima, loading } = useLastEntry(form)
  const t = useT()
  const lang = useLang()
  const lastWeek =
    formatWeekRange(ultima?.weekStart ?? null, ultima?.weekEnd ?? null, lang) ||
    t('semana sin fecha', 'undated week')
  const lastWhen = ultima?.submittedAt ? ` (${formatRelativeTime(ultima.submittedAt, lang)})` : ''

  return (
    <Link
      to={form.path}
      className="block rounded-xl border border-ink-200 bg-white px-5 py-4 shadow-sm transition-colors hover:border-ink-300 hover:bg-ink-50/50"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink-900">{form.name}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-ink-500">{form.subtitle}</p>
        </div>
        <Badge tone="violet">{t('Semanal', 'Weekly')}</Badge>
      </div>

      <p className="mt-3 border-t border-ink-100 pt-3 text-xs text-ink-500">
        {loading
          ? t('Cargando tus entregas…', 'Loading your submissions…')
          : entregas === 0
            ? t('Sin entregas todavía', 'No submissions yet')
            : t(
                `${entregas} ${entregas === 1 ? 'entrega' : 'entregas'} · última: ${lastWeek}${lastWhen}`,
                `${entregas} ${entregas === 1 ? 'submission' : 'submissions'} · latest: ${lastWeek}${lastWhen}`,
              )}
      </p>
    </Link>
  )
}

interface LastEntry {
  weekStart: string | null
  weekEnd: string | null
  submittedAt: string | null
}

/**
 * Cuántas entregas lleva el alumno en una bitácora y cuál fue la última.
 *
 * Trae la bitácora completa y se queda con la primera fila: son como mucho diez
 * entregas por alumno, y el repositorio ya las devuelve ordenadas de la más
 * reciente a la más antigua.
 */
function useLastEntry(form: WeeklyFormMeta) {
  const { portalStudentId: studentId } = useAuth()
  // Un error aquí deja la tarjeta sin resumen, no sin actividad: el alumno
  // todavía puede entrar y entregar, que es lo que vino a hacer.
  const { data: rows, loading } = useWeeklyLogRows(form.code, studentId)

  return { entregas: rows.length, ultima: (rows[0] ?? null) as LastEntry | null, loading }
}
