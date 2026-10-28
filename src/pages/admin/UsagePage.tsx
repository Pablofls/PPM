import { useState } from 'react'

import { useRepositoryQuery } from '../../data/hooks'
import { repository } from '../../data/repository'
import type { UsageStats } from '../../data/types'

const SECONDARY_BUTTON =
  'rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm font-medium text-ink-700 shadow-sm hover:bg-ink-50 disabled:cursor-not-allowed disabled:text-ink-400'

const LABEL = 'text-[11px] font-semibold tracking-wider text-ink-500 uppercase'

const MB = 1024 * 1024
const GB = 1024 * MB

/**
 * Los límites del plan Free de Supabase (supabase.com/pricing, octubre 2026).
 * Si Supabase los cambia, se cambian aquí.
 */
const FREE_PLAN = {
  databaseBytes: 500 * MB,
  storageBytes: 1 * GB,
  monthlyActiveUsers: 50_000,
}

/** Lo que solo se ve en el panel de Supabase: la base no lo registra. */
const DASHBOARD_ONLY = [
  { label: 'Egress (tráfico de salida)', limit: '5 GB al mes' },
  { label: 'Invocaciones de Edge Functions', limit: '500 000 al mes' },
  { label: 'Mensajes de Realtime', limit: '2 millones al mes' },
]

const USAGE_URL = 'https://supabase.com/dashboard/org/_/usage'

function formatBytes(bytes: number): string {
  if (bytes >= GB) return `${(bytes / GB).toFixed(2)} GB`
  if (bytes >= MB) return `${(bytes / MB).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} kB`
}

const formatNumber = (value: number) => value.toLocaleString('es-MX')

/** Verde hasta 70 %, ámbar hasta 90 %, rojo después. */
function tone(ratio: number) {
  if (ratio >= 0.9) return { bar: 'bg-red-500', text: 'text-red-700' }
  if (ratio >= 0.7) return { bar: 'bg-amber-500', text: 'text-amber-700' }
  return { bar: 'bg-emerald-500', text: 'text-emerald-700' }
}

function Meter({
  label,
  used,
  limit,
  format,
  detail,
}: {
  label: string
  used: number
  limit: number
  format: (value: number) => string
  detail?: string
}) {
  const ratio = limit > 0 ? used / limit : 0
  const { bar, text } = tone(ratio)
  const percent = ratio * 100
  return (
    <div className="rounded-xl border border-ink-200 bg-white p-5 shadow-sm">
      <div className="flex items-baseline justify-between gap-3">
        <p className={LABEL}>{label}</p>
        <p className={`text-sm font-semibold tabular-nums ${text}`}>
          {percent < 0.1 && used > 0 ? '< 0.1' : percent.toFixed(1)} %
        </p>
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-ink-950 tabular-nums">
        {format(used)}
        <span className="ml-1.5 text-sm font-normal text-ink-500">de {format(limit)}</span>
      </p>
      <div
        className="mt-3 h-2 overflow-hidden rounded-full bg-ink-100"
        role="progressbar"
        aria-valuenow={Math.round(percent)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div className={`h-full rounded-full ${bar}`} style={{ width: `${Math.min(100, Math.max(percent, 1))}%` }} />
      </div>
      {detail && <p className="mt-2 text-xs text-ink-500">{detail}</p>}
    </div>
  )
}

/**
 * Cuánto falta para llenar la BD al ritmo de los últimos 30 días: cada
 * entrega pesa en promedio lo que ocupa `public` entre el total de entregas.
 * Es una aproximación; los índices y el historial de Postgres también crecen.
 */
function projection(stats: UsageStats): string {
  const left = FREE_PLAN.databaseBytes - stats.databaseBytes
  if (left <= 0) return 'La base ya llegó al límite del plan gratuito.'
  if (stats.submissions === 0 || stats.submissionsLast30Days === 0) {
    return 'No hubo entregas en los últimos 30 días: no hay ritmo para proyectar.'
  }
  const bytesPerSubmission = stats.publicBytes / stats.submissions
  const monthlyGrowth = bytesPerSubmission * stats.submissionsLast30Days
  const months = left / monthlyGrowth
  const rate = `${formatNumber(stats.submissionsLast30Days)} entregas en 30 días (≈ ${formatBytes(monthlyGrowth)} al mes)`
  if (months > 120) return `A este ritmo —${rate}— la base no se llenaría en más de 10 años.`
  const years = months / 12
  const when = months < 24 ? `${Math.round(months)} meses` : `${years.toFixed(1)} años`
  return `A este ritmo —${rate}— la base se llenaría en unos ${when}.`
}

/**
 * Configuración → Uso de Supabase (solo admin): lo que ocupa el proyecto
 * contra los límites del plan gratuito, para saber con tiempo cuándo habrá
 * que pagar. Los números vienen de `admin_usage_stats()` (`0048`), que
 * rechaza a quien no sea admin; egress y peticiones a la API solo están en el
 * panel de Supabase.
 */
export function UsagePage() {
  const [refreshKey, setRefreshKey] = useState(0)
  const { data: stats, loading, error } = useRepositoryQuery<UsageStats | null>(
    () => repository.getUsageStats(),
    null,
    [refreshKey],
    'usageStats',
  )

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink-950">Uso de Supabase</h1>
          <p className="mt-1.5 text-sm text-ink-500">
            Cuánto del plan gratuito ocupa el panel. Al pasar un límite, Supabase restringe el
            proyecto (con la base llena, queda en solo lectura) hasta cambiar al plan Pro.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setRefreshKey((key) => key + 1)}
          disabled={loading}
          className={SECONDARY_BUTTON}
        >
          {loading ? 'Actualizando…' : 'Actualizar'}
        </button>
      </header>

      {error && (
        <p className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      )}

      {!stats && loading && <p className="text-sm text-ink-500">Cargando…</p>}

      {stats && (
        <div className="space-y-8">
          <section>
            <div className="grid gap-4 md:grid-cols-3">
              <Meter
                label="Base de datos"
                used={stats.databaseBytes}
                limit={FREE_PLAN.databaseBytes}
                format={formatBytes}
                detail={`${formatBytes(stats.publicBytes)} son datos del panel; el resto, sistema y cuentas.`}
              />
              <Meter
                label="Archivos (Storage)"
                used={stats.storageBytes}
                limit={FREE_PLAN.storageBytes}
                format={formatBytes}
                detail={`${formatNumber(stats.storageObjects)} archivos.`}
              />
              <Meter
                label="Usuarios activos (30 días)"
                used={stats.monthlyActiveUsers}
                limit={FREE_PLAN.monthlyActiveUsers}
                format={formatNumber}
                detail={`${formatNumber(stats.authUsers)} cuentas en total.`}
              />
            </div>
            <p className="mt-4 rounded-lg border border-ink-200 bg-white px-4 py-3 text-sm text-ink-700 shadow-sm">
              {projection(stats)}
            </p>
          </section>

          <section className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-ink-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-ink-900">Tablas más pesadas</h2>
              <table className="mt-3 w-full text-sm">
                <thead>
                  <tr className="text-left text-ink-500">
                    <th className="pb-2 font-medium">Tabla</th>
                    <th className="pb-2 text-right font-medium">Filas</th>
                    <th className="pb-2 text-right font-medium">Tamaño</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {stats.tables.map((table) => (
                    <tr key={table.name}>
                      <td className="py-1.5 font-mono text-xs text-ink-800">{table.name}</td>
                      <td className="py-1.5 text-right text-ink-600 tabular-nums">{formatNumber(table.rows)}</td>
                      <td className="py-1.5 text-right text-ink-900 tabular-nums">{formatBytes(table.bytes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="space-y-4">
              <div className="rounded-xl border border-ink-200 bg-white p-5 shadow-sm">
                <h2 className="text-sm font-semibold text-ink-900">Base de datos ahora</h2>
                <dl className="mt-3 grid grid-cols-2 gap-y-2 text-sm">
                  <dt className="text-ink-500">Conexiones abiertas</dt>
                  <dd className="text-right text-ink-900 tabular-nums">
                    {stats.connections} de {stats.maxConnections}
                  </dd>
                  <dt className="text-ink-500">Entregas guardadas</dt>
                  <dd className="text-right text-ink-900 tabular-nums">{formatNumber(stats.submissions)}</dd>
                  <dt className="text-ink-500">Entregas en 30 días</dt>
                  <dd className="text-right text-ink-900 tabular-nums">
                    {formatNumber(stats.submissionsLast30Days)}
                  </dd>
                  <dt className="text-ink-500">Medido</dt>
                  <dd className="text-right text-ink-900">
                    {new Date(stats.generatedAt).toLocaleString('es-MX', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </dd>
                </dl>
              </div>

              <div className="rounded-xl border border-ink-200 bg-white p-5 shadow-sm">
                <h2 className="text-sm font-semibold text-ink-900">Solo en el panel de Supabase</h2>
                <p className="mt-1 text-xs text-ink-500">
                  La base no registra el tráfico; Supabase lo mide aparte.
                </p>
                <ul className="mt-3 space-y-1.5 text-sm">
                  {DASHBOARD_ONLY.map((item) => (
                    <li key={item.label} className="flex justify-between gap-3">
                      <span className="text-ink-700">{item.label}</span>
                      <span className="text-ink-500">{item.limit}</span>
                    </li>
                  ))}
                </ul>
                <a
                  href={USAGE_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 inline-block text-sm font-medium text-ink-900 underline underline-offset-2 hover:text-ink-700"
                >
                  Ver el uso en Supabase ↗
                </a>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
