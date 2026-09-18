import { useState, type FormEvent } from 'react'

import { isSupabaseConfigured } from '../data/supabaseClient'
import { useAuth } from './AuthProvider'

export function LoginPage() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    const message = await signIn(email, password)
    if (message) {
      setError(message)
      setSubmitting(false)
    }
    // Si el inicio de sesión funciona, el cambio de sesión desmonta esta
    // pantalla; no hace falta apagar `submitting`.
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-brand-900 px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <span className="mx-auto flex size-14 items-center justify-center rounded-xl bg-accent-400 text-base font-bold text-brand-900">
            PPM
          </span>
          <h1 className="mt-4 text-2xl font-semibold text-white">
            Prácticas Profesionales
          </h1>
          <p className="mt-1 text-sm text-brand-300">Panel del profesor</p>
        </div>

        {!isSupabaseConfigured && (
          <p className="mb-4 rounded-lg border-l-4 border-accent-400 bg-accent-50 px-4 py-3 text-sm text-accent-800">
            Faltan las variables de entorno <code>VITE_SUPABASE_URL</code> y{' '}
            <code>VITE_SUPABASE_ANON_KEY</code>. Sin ellas no se puede iniciar
            sesión.
          </p>
        )}

        <form
          onSubmit={handleSubmit}
          className="overflow-hidden rounded-xl bg-white p-6 shadow-xl"
        >
          <div className="-mx-6 -mt-6 mb-6 h-1.5 bg-accent-400" />

          <label className="block">
            <span className="text-sm font-medium text-slate-700">
              Correo institucional
            </span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              autoComplete="email"
              autoFocus
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none"
            />
          </label>

          <label className="mt-4 block">
            <span className="text-sm font-medium text-slate-700">Contraseña</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              autoComplete="current-password"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none"
            />
          </label>

          {error && (
            <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting || !isSupabaseConfigured}
            className="mt-6 w-full rounded-lg bg-brand-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 focus:ring-2 focus:ring-accent-300 focus:outline-none disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {submitting ? 'Entrando…' : 'Entrar'}
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-brand-300">
          El acceso lo autoriza un administrador.
        </p>
      </div>
    </div>
  )
}
