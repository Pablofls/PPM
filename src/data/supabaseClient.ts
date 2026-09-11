import { createClient } from '@supabase/supabase-js'

/**
 * Cliente de Supabase.
 *
 * La llave `anon` es pública por diseño: viaja en el bundle del navegador. Lo que
 * protege los datos son las políticas RLS, que exigen `is_admin()`. La llave
 * secreta (`service_role`) NUNCA entra a este proyecto.
 */
const url = import.meta.env.VITE_SUPABASE_URL ?? ''
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''

/** `false` si faltan las variables de entorno. La app lo avisa en pantalla. */
export const isSupabaseConfigured = Boolean(url && anonKey)

// Los valores de relleno evitan que la app truene al importar cuando faltan las
// variables: en ese caso se muestra un aviso, que es más útil que una pantalla
// en blanco.
export const supabase = createClient(
  url || 'https://sin-configurar.supabase.co',
  anonKey || 'sin-configurar',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  },
)
