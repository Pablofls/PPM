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
  full_name: string | null
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
      .select('id, email, full_name, role, is_active, student_id')
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

  const value = useMemo<AuthState>(
    () => ({
      session,
      profile,
      loading: loadingSession || loadingProfile,
      isAdmin: profile?.role === 'admin' && profile.is_active,
      isStudent: profile?.role === 'alumno' && profile.is_active,
      signIn,
      signOut,
    }),
    [session, profile, loadingSession, loadingProfile, signIn, signOut],
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

/** Los mensajes de Supabase vienen en inglés; la interfaz está en español. */
function translateAuthError(message: string): string {
  const normalized = message.toLowerCase()

  if (normalized.includes('invalid login credentials')) {
    return 'Correo o contraseña incorrectos.'
  }
  if (normalized.includes('email not confirmed')) {
    return 'Tu cuenta todavía no está confirmada. Revisa tu correo.'
  }
  if (normalized.includes('too many requests') || normalized.includes('rate limit')) {
    return 'Demasiados intentos. Espera un momento y vuelve a intentarlo.'
  }
  if (normalized.includes('failed to fetch') || normalized.includes('network')) {
    return 'No se pudo conectar con el servidor. Revisa tu conexión.'
  }
  return `No se pudo iniciar sesión: ${message}`
}
