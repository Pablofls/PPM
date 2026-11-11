import { useEffect, type ReactNode } from 'react'

import { useAuth } from '../auth/AuthProvider'
import { useStudentDossier } from '../components/StudentDossier'
import { useRepositoryQuery } from '../data/hooks'
import { repository } from '../data/repository'
import type { Group } from '../data/types'
import { LangContext, type Lang } from '../lib/i18n'

/** Dónde se recuerda el último idioma de cada alumno, para no parpadear en español al recargar. */
const STORAGE_PREFIX = 'ppm.idioma.'

function readStored(studentId: string | null): Lang | null {
  if (!studentId) return null
  try {
    const value = localStorage.getItem(STORAGE_PREFIX + studentId)
    return value === 'en' || value === 'es' ? value : null
  } catch {
    return null
  }
}

function store(studentId: string, lang: Lang) {
  try {
    localStorage.setItem(STORAGE_PREFIX + studentId, lang)
  } catch {
    // Sin almacenamiento, solo se ve en español un instante al cargar.
  }
}

/**
 * El idioma del portal: el del grupo del alumno (`groups.language`).
 *
 * El alumno lee su propio grupo (política `groups_select_own`, `0032`) y su
 * expediente trae `group_id`; el admin en «Ver como Alumno» lee el del alumno
 * que está viendo. Sin grupo, español.
 */
export function StudentLanguageProvider({ children }: { children: ReactNode }) {
  const { portalStudentId } = useAuth()
  const { dossier } = useStudentDossier(portalStudentId)
  const groupId = dossier?.groupId ?? null
  // Directo de `groups`, no de `v_groups`: la vista une el perfil del maestro,
  // que el alumno no puede leer, y le regresaba vacía (el portal quedaba en
  // español aunque el grupo fuera de Inglés).
  const { data: groupLanguage, loading } = useRepositoryQuery(
    () => (groupId ? repository.getGroupLanguage(groupId) : Promise.resolve(null)),
    null as Group['language'] | null,
    [groupId],
    'studentLanguage',
  )

  const resolved: Lang | null = groupLanguage ? (groupLanguage === 'en' ? 'en' : 'es') : null
  // Mientras se resuelve, el último idioma conocido de este alumno.
  const known = dossier && !groupId ? 'es' : !loading ? resolved : null
  const lang: Lang = known ?? readStored(portalStudentId) ?? 'es'

  useEffect(() => {
    if (portalStudentId && known) store(portalStudentId, known)
  }, [portalStudentId, known])

  useEffect(() => {
    document.documentElement.lang = lang
    return () => {
      document.documentElement.lang = 'es'
    }
  }, [lang])

  return <LangContext.Provider value={lang}>{children}</LangContext.Provider>
}
