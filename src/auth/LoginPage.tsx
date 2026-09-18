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
    <div className="flex min-h-full items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <h1 className="font-serif text-3xl leading-tight text-ink-950">
            Prácticas Profesionales
          </h1>
          <p className="mt-2 text-sm text-ink-500">
            Panel del profesor · acceso para personal autorizado
          </p>
        </div>

        {!isSupabaseConfigured && (
          <p className="mb-4 border-l-2 border-accent-400 bg-accent-100 px-4 py-3 text-sm text-ink-700">
            Faltan las variables de entorno <code>VITE_SUPABASE_URL</code> y{' '}
            <code>VITE_SUPABASE_ANON_KEY</code>. Sin ellas no se puede iniciar
            sesión.
          </p>
        )}

        <form
          onSubmit={handleSubmit}
          className="rounded border border-ink-200 bg-white p-6"
        >
          <label className="block">
            <span className="text-sm text-ink-700">
              Correo institucional
            </span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              autoComplete="email"
              autoFocus
              className="mt-1.5 w-full rounded border border-ink-200 px-3 py-2 text-sm focus:border-ink-400 focus:outline-none"
            />
          </label>

          <label className="mt-4 block">
            <span className="text-sm text-ink-700">Contraseña</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              autoComplete="current-password"
              className="mt-1.5 w-full rounded border border-ink-200 px-3 py-2 text-sm focus:border-ink-400 focus:outline-none"
            />
          </label>

          {error && (
            <p role="alert" className="mt-4 border-l-2 border-red-400 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting || !isSupabaseConfigured}
            className="mt-6 w-full rounded bg-accent-400 px-4 py-2.5 text-sm font-medium text-ink-900 transition-colors hover:bg-accent-500 focus:outline-2 focus:outline-offset-2 focus:outline-ink-900 disabled:cursor-not-allowed disabled:bg-ink-100 disabled:text-ink-400"
          >
            {submitting ? 'Entrando…' : 'Entrar'}
          </button>
        </form>

        <p className="mt-4 text-xs text-ink-400">
          El acceso lo autoriza un administrador.
        </p>
      </div>
    </div>
  )
}
