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

export interface Profile {
  id: string
  email: string
  /** Desde `0034`. En los alumnos va vacío: su nombre vive en `demographics`. */
  first_name: string | null
  last_name: string | null
  role: 'admin' | 'alumno' | 'pendiente'
  is_active: boolean
  /** El alumno al que corresponde la cuenta. `null` en el profesor. */
  student_id: string | null
}

interface AuthState {
  session: Session | null
  profile: Profile | null
  /** `true` mientras se resuelve la sesión o el perfil. */
  loading: boolean
  /** Único criterio de acceso al panel del profesor. */
  isAdmin: boolean
  /** Único criterio de acceso a la vista del alumno. */
  isStudent: boolean
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
      return
    }

    let cancelled = false
    setLoadingProfile(true)

    supabase
      .from('profiles')
      .select('id, email, first_name, last_name, role, is_active, student_id')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return
        setProfile((data as Profile | null) ?? null)
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

  const value = useMemo<AuthState>(
    () => ({
      session,
      profile,
      loading: loadingSession || loadingProfile,
      isAdmin: profile?.role === 'admin' && profile.is_active,
      isStudent: profile?.role === 'alumno' && profile.is_active,
      signIn,
      signOut,
      updateName,
    }),
    [session, profile, loadingSession, loadingProfile, signIn, signOut, updateName],
  )

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
export const ROLE_LABELS: Record<Profile['role'], string> = {
  admin: 'Administrador',
  alumno: 'Alumno',
  pendiente: 'Pendiente de autorización',
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
