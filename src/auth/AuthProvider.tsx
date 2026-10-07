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

/** Los roles de `roles` (`0035`). Una persona puede tener varios, salvo el alumno. */
export type RoleCode = 'admin' | 'coordinador' | 'maestro' | 'alumno'

/** Los roles del panel, del de más alcance al de menos. */
export const STAFF_ROLES: RoleCode[] = ['admin', 'coordinador', 'maestro']

/** Dónde se recuerda con qué rol está viendo el panel quien tiene varios. */
const ACTIVE_ROLE_KEY = 'ppm.rol'

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
   * Con qué rol está viendo el panel («Ver como»). Decide qué grupos ve y qué
   * secciones aparecen. Quien tiene un solo rol, siempre ese. RLS deja leer la
   * unión de sus roles; esto solo acota lo que la interfaz muestra.
   */
  activeRole: RoleCode | null
  setActiveRole: (role: RoleCode) => void
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
  const [storedRole, setStoredRole] = useState<string>(() => {
    try {
      return localStorage.getItem(ACTIVE_ROLE_KEY) ?? ''
    } catch {
      return ''
    }
  })

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

  const setActiveRole = useCallback((role: RoleCode) => {
    setStoredRole(role)
    try {
      localStorage.setItem(ACTIVE_ROLE_KEY, role)
    } catch {
      // Sin almacenamiento, la vista dura lo que dure la página.
    }
  }, [])

  const value = useMemo<AuthState>(() => {
    const active = profile?.is_active ? (profile.roles ?? []) : []
    const staffRoles = STAFF_ROLES.filter((role) => active.includes(role))
    // El rol guardado solo vale si la cuenta lo sigue teniendo; si no, el de
    // más alcance.
    const activeRole = staffRoles.includes(storedRole as RoleCode)
      ? (storedRole as RoleCode)
      : (staffRoles[0] ?? (active.includes('alumno') ? 'alumno' : null))
    return {
      session,
      profile,
      loading: loadingSession || loadingProfile,
      profileError,
      isAdmin: active.includes('admin'),
      isStudent: active.includes('alumno'),
      isStaff: staffRoles.length > 0,
      staffRoles,
      activeRole,
      setActiveRole,
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
    storedRole,
    setActiveRole,
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
