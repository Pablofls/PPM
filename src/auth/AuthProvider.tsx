import type { Session } from '@supabase/supabase-js'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

import { supabase } from '../data/supabaseClient'

import type { RoleCode } from '../data/types'

export type { RoleCode }

/** Los roles del panel, del de más alcance al de menos. */
export const STAFF_ROLES: RoleCode[] = ['admin', 'coordinador', 'maestro']

/** Todos los roles, en el orden del selector «Ver como». */
export const ALL_ROLES: RoleCode[] = ['admin', 'coordinador', 'maestro', 'alumno']

/** Dónde se recuerda la vista elegida en «Ver como»: `{ role, id }`. */
const VIEW_KEY = 'ppm.vista'

interface StoredView {
  role: string
  /** La persona que se está viendo (admin): un `profiles.id`, o un `students.id` en la vista de alumno. */
  id: string | null
}

function readStoredView(): StoredView {
  try {
    const parsed = JSON.parse(localStorage.getItem(VIEW_KEY) ?? 'null') as StoredView | null
    return parsed && typeof parsed.role === 'string' ? parsed : { role: '', id: null }
  } catch {
    return { role: '', id: null }
  }
}

export interface Profile {
  id: string
  email: string
  /** Desde `0034`. En los alumnos va vacío: su nombre vive en `demographics`. */
  first_name: string | null
  last_name: string | null
  /** De `user_roles`, vía `v_users`. Vacío = cuenta pendiente de autorización. */
  roles: RoleCode[]
  is_active: boolean
  /** El alumno al que corresponde la cuenta. `null` en el profesor. */
  student_id: string | null
}

interface AuthState {
  session: Session | null
  profile: Profile | null
  /** `true` mientras se resuelve la sesión o el perfil. */
  loading: boolean
  /**
   * Por qué no se pudo leer el perfil, si falló la consulta. Sin esto, un
   * error (red, o una versión vieja de la app pidiendo una columna que ya no
   * existe) se veía igual que una cuenta pendiente de autorización.
   */
  profileError: string | null
  /** Tiene el rol admin (sin importar con qué rol está viendo). */
  isAdmin: boolean
  /** Único criterio de acceso a la vista del alumno. */
  isStudent: boolean
  /** Tiene algún rol del panel: admin, coordinador o maestro. Criterio de acceso al panel. */
  isStaff: boolean
  /** Sus roles del panel, del de más alcance al de menos. */
  staffRoles: RoleCode[]
  /**
   * Los roles que puede elegir en «Ver como». El admin, los cuatro —para ver
   * la plataforma como cualquier tipo de usuario, sin tener ese rol—; los
   * demás, solo los suyos (un coordinador que también es maestro, esos dos).
   */
  viewRoles: RoleCode[]
  /**
   * Con qué rol está viendo («Ver como»). Decide qué grupos ve y qué
   * secciones aparecen. No da permisos: RLS deja leer lo que la cuenta tiene;
   * esto solo acota lo que la interfaz muestra.
   */
  activeRole: RoleCode | null
  /**
   * La persona que se está viendo. En las vistas de maestro y coordinador es
   * un `profiles.id` (el propio, salvo que un admin elija a otra persona); en
   * la de alumno, ver `portalStudentId`. `null` si el admin no ha elegido.
   */
  viewUserId: string | null
  /** El alumno cuyo portal se muestra: el propio, o el que eligió el admin. */
  portalStudentId: string | null
  /** El admin está viendo el portal de un alumno: solo lectura, sin entregar ni corregir. */
  portalReadOnly: boolean
  /** Cambia la vista. `id` es la persona (solo el admin elige a otra). */
  setView: (role: RoleCode, id?: string | null) => void
  /** Atajo: la vista activa es la de administrador. */
  viewingAsAdmin: boolean
  signIn: (email: string, password: string) => Promise<string | null>
  signOut: () => Promise<void>
  /**
   * Guarda nombre y apellido de la cuenta de la sesión. Es lo único del
   * perfil que se escribe desde el navegador (permiso por columna, `0034`).
   * Devuelve el mensaje de error, o `null` si se guardó.
   */
  updateName: (firstName: string, lastName: string) => Promise<string | null>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loadingSession, setLoadingSession] = useState(true)
  const [loadingProfile, setLoadingProfile] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [storedView, setStoredView] = useState<StoredView>(readStoredView)

  // Sesión. El callback de onAuthStateChange se mantiene síncrono a propósito:
  // hacer await de una consulta aquí adentro puede bloquear al cliente de
  // Supabase. El perfil se carga en el efecto de abajo.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoadingSession(false)
    })

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setLoadingSession(false)
    })

    return () => data.subscription.unsubscribe()
  }, [])

  // Perfil y rol. Se leen de la tabla `profiles`, nunca de algo que el cliente
  // pueda manipular. Aunque alguien falsee esto en el navegador, RLS es lo que
  // de verdad protege los datos.
  const userId = session?.user?.id

  useEffect(() => {
    if (!userId) {
      setProfile(null)
      setProfileError(null)
      return
    }

    let cancelled = false
    setLoadingProfile(true)
    setProfileError(null)

    supabase
      .from('v_users')
      .select('id, email, first_name, last_name, roles, is_active, student_id')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return
        setProfile((data as Profile | null) ?? null)
        setProfileError(error ? error.message : null)
        setLoadingProfile(false)
      })

    return () => {
      cancelled = true
    }
  }, [userId])

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    return error ? translateAuthError(error.message) : null
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setProfile(null)
  }, [])

  const updateName = useCallback(
    async (firstName: string, lastName: string) => {
      if (!userId) return 'No hay sesión. Vuelve a iniciar sesión.'
      const names = { first_name: firstName.trim() || null, last_name: lastName.trim() || null }
      const { error } = await supabase.from('profiles').update(names).eq('id', userId)
      if (error) return `No se pudo guardar: ${error.message}`
      // Se actualiza en memoria en vez de volver a leer el perfil: releerlo
      // pondría `loading` en true y ProtectedRoute desmontaría la pantalla.
      setProfile((current) => (current ? { ...current, ...names } : current))
      return null
    },
    [userId],
  )

  const setView = useCallback((role: RoleCode, id: string | null = null) => {
    const next = { role, id }
    setStoredView(next)
    try {
      localStorage.setItem(VIEW_KEY, JSON.stringify(next))
    } catch {
      // Sin almacenamiento, la vista dura lo que dure la página.
    }
  }, [])

  const value = useMemo<AuthState>(() => {
    const active = profile?.is_active ? (profile.roles ?? []) : []
    const isAdmin = active.includes('admin')
    const isStudent = active.includes('alumno')
    const staffRoles = STAFF_ROLES.filter((role) => active.includes(role))
    const viewRoles = isAdmin ? ALL_ROLES : isStudent ? (['alumno'] as RoleCode[]) : staffRoles

    // La vista guardada solo vale si la cuenta todavía la puede elegir; si no,
    // la de más alcance.
    const activeRole = viewRoles.includes(storedView.role as RoleCode)
      ? (storedView.role as RoleCode)
      : (viewRoles[0] ?? null)

    const selfId = profile?.id ?? null
    // Solo el admin ve como otra persona. Sin elegir a nadie, se ve a sí mismo
    // si tiene ese rol (René, admin y maestro, en la vista de maestro).
    const viewUserId =
      activeRole === 'maestro' || activeRole === 'coordinador'
        ? isAdmin
          ? (storedView.id ?? (active.includes(activeRole) ? selfId : null))
          : selfId
        : selfId

    const portalStudentId = isStudent
      ? (profile?.student_id ?? null)
      : isAdmin && activeRole === 'alumno'
        ? storedView.id
        : null

    return {
      session,
      profile,
      loading: loadingSession || loadingProfile,
      profileError,
      isAdmin,
      isStudent,
      isStaff: staffRoles.length > 0,
      staffRoles,
      viewRoles,
      activeRole,
      viewUserId,
      portalStudentId,
      portalReadOnly: !isStudent && activeRole === 'alumno',
      setView,
      viewingAsAdmin: activeRole === 'admin',
      signIn,
      signOut,
      updateName,
    }
  }, [
    session,
    profile,
    loadingSession,
    loadingProfile,
    profileError,
    storedView,
    setView,
    signIn,
    signOut,
    updateName,
  ])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth debe usarse dentro de <AuthProvider>')
  }
  return context
}

/** «René Heredia», o `null` si la cuenta todavía no tiene nombre. */
export function profileDisplayName(
  profile: Pick<Profile, 'first_name' | 'last_name'> | null,
): string | null {
  if (!profile) return null
  return [profile.first_name, profile.last_name].filter(Boolean).join(' ') || null
}

/** Cómo se llama cada rol en la interfaz. */
export const ROLE_LABELS: Record<RoleCode, string> = {
  admin: 'Administrador',
  coordinador: 'Coordinador',
  maestro: 'Maestro',
  alumno: 'Alumno',
}

/**
 * Los mensajes de Supabase vienen en inglés; la interfaz está en español.
 *
 * Sirve tanto para `signInWithPassword()` como para `updateUser()` (cambio de
 * contraseña desde `ProfilePage`): los dos devuelven el mismo tipo de error y
 * varios casos —red, rate limit— son idénticos en ambos flujos.
 */
export function translateAuthError(message: string): string {
  const normalized = message.toLowerCase()

  if (normalized.includes('invalid login credentials')) {
    return 'Correo o contraseña incorrectos.'
  }
  if (normalized.includes('email not confirmed')) {
    return 'Tu cuenta todavía no está confirmada. Revisa tu correo.'
  }
  // El número lo saca del mensaje de Supabase en vez de tenerlo fijo: es la
  // longitud mínima que de verdad tiene configurada el dashboard
  // (Authentication → Providers), y ese valor puede cambiar sin que este
  // archivo se entere.
  const longitudMinima = message.match(/at least (\d+) characters?/i)?.[1]
  if (longitudMinima) {
    return `La contraseña debe tener al menos ${longitudMinima} caracteres.`
  }
  if (normalized.includes('should be different from the old password')) {
    return 'La nueva contraseña debe ser diferente a la actual.'
  }
  if (normalized.includes('too many requests') || normalized.includes('rate limit')) {
    return 'Demasiados intentos. Espera un momento y vuelve a intentarlo.'
  }
  if (normalized.includes('failed to fetch') || normalized.includes('network')) {
    return 'No se pudo conectar con el servidor. Revisa tu conexión.'
  }
  return `No se pudo completar la operación: ${message}`
}
