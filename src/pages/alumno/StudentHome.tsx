import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'

import { useAuth } from '../../auth/AuthProvider'
import { Badge } from '../../components/Badge'
import { DossierProfile, useStudentDossier } from '../../components/StudentDossier'
import { Toast } from '../../components/Toast'
import { repository } from '../../data/repository'
import { WEEKLY_FORMS, type WeeklyFormMeta } from '../../lib/catalog'
import { formatRelativeTime, formatWeekRange } from '../../lib/format'

/**
 * Índice del portal del alumno: su ADN Profesional y sus tareas.
 *
 * Las tareas son la lista de tareas de un curso, no un panel de resultados.
 * Hoy son las dos bitácoras semanales, que son los únicos formularios que el
 * alumno contesta aquí; los otros trece se siguen contestando en Google Forms.
 */
export function StudentHome() {
  const { profile, session } = useAuth()
  const nombre = profile?.full_name?.trim()
  const correo = profile?.email ?? session?.user?.email
  const [toast, dismissToast] = useHandoffToast()
  const { dossier } = useStudentDossier(profile?.student_id ?? null)

  return (
    <>
      {toast && <Toast message={toast} onDismiss={dismissToast} />}

      <section className="rounded-xl border border-ink-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-ink-900">ADN Profesional</h2>
        <div className="mt-4 space-y-7">
          <DossierProfile
            dossier={dossier}
            fallback={{ fullName: nombre ?? null, institutionalEmail: correo ?? null }}
          />
        </div>
      </section>

      <section className="mt-8">
        <h2 className="px-1 text-[11px] font-semibold tracking-widest text-ink-500 uppercase">
          Tareas
        </h2>
        <ul className="mt-2 space-y-3">
          {WEEKLY_FORMS.map((form) => (
            <li key={form.code}>
              <AssignmentCard form={form} />
            </li>
          ))}
        </ul>
      </section>
    </>
  )
}

/**
 * La tarjeta de una tarea, con su última entrega.
 *
 * El resumen es lo que convierte la lista en algo útil: sin él, el alumno tiene
 * que entrar a cada tarea para saber si ya entregó la semana.
 */
function AssignmentCard({ form }: { form: WeeklyFormMeta }) {
  const { entregas, ultima, loading } = useLastEntry(form)

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
        <Badge tone="violet">Semanal</Badge>
      </div>

      <p className="mt-3 border-t border-ink-100 pt-3 text-xs text-ink-500">
        {loading
          ? 'Cargando tus entregas…'
          : entregas === 0
            ? 'Sin entregas todavía'
            : `${entregas} ${entregas === 1 ? 'entrega' : 'entregas'} · última: ${
                formatWeekRange(ultima?.weekStart ?? null, ultima?.weekEnd ?? null) ||
                'semana sin fecha'
              }${
                ultima?.submittedAt ? ` (${formatRelativeTime(ultima.submittedAt)})` : ''
              }`}
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
  const { profile } = useAuth()
  const studentId = profile?.student_id ?? null

  const [entregas, setEntregas] = useState(0)
  const [ultima, setUltima] = useState<LastEntry | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!studentId) return

    let cancelled = false
    setLoading(true)

    const query =
      form.code === 'form_busqueda'
        ? repository.getJobSearchLogs(studentId)
        : repository.getInternshipLogs(studentId)

    query
      .then((rows) => {
        if (cancelled) return
        setEntregas(rows.length)
        setUltima(rows[0] ?? null)
        setLoading(false)
      })
      // Un error aquí deja la tarjeta sin resumen, no sin tarea: el alumno
      // todavía puede entrar y entregar, que es lo que vino a hacer.
      .catch(() => {
        if (cancelled) return
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [form.code, studentId])

  return { entregas, ultima, loading }
}

/**
 * El aviso que dejó la pantalla de la que venimos.
 *
 * Viaja en el `state` de la navegación y no en la URL: es un mensaje de una
 * sola vez, y en la URL quedaría en el historial y en cualquier enlace que el
 * alumno copiara.
 *
 * Se limpia del historial en cuanto se lee. Sin eso, recargar la página
 * volvería a anunciar una entrega que se hizo hace rato.
 */
function useHandoffToast(): [string | null, () => void] {
  const location = useLocation()
  const navigate = useNavigate()
  const entrante = (location.state as { toast?: string } | null)?.toast ?? null

  const [toast, setToast] = useState<string | null>(entrante)

  useEffect(() => {
    if (!entrante) return
    setToast(entrante)
    navigate(location.pathname, { replace: true, state: null })
  }, [entrante, location.pathname, navigate])

  const dismiss = useCallback(() => setToast(null), [])

  return [toast, dismiss]
}
