import { useState } from 'react'

import { Select } from '../../components/FilterBar'
import { useRepositoryQuery } from '../../data/hooks'
import { repository } from '../../data/repository'
import type { FormDeadline, SemesterWeek } from '../../data/types'
import {
  DEADLINE_FORMS,
  formByCode,
  LANGUAGE_OPTIONS,
  PERIOD_OPTIONS,
  SESSION_DAY_OPTIONS,
  type FormCode,
  type FilterOption,
} from '../../lib/catalog'
import { formatDate, formatWeekRange } from '../../lib/format'

const FIELD_INPUT =
  'rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm text-ink-900 shadow-sm focus:border-ink-400 focus:ring-2 focus:ring-ink-900/5 focus:outline-none'

/**
 * Panel de Administrador: asignar fechas límite y definir las semanas del
 * semestre. Dos herramientas, una pantalla — ambas son configuración que el
 * profesor hace unas pocas veces por periodo, no algo que consulte seguido.
 */
export function DeadlinesPage() {
  const [language, setLanguage] = useState('')
  const [sessionDay, setSessionDay] = useState('')
  const [period, setPeriod] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [selected, setSelected] = useState<Set<FormCode>>(new Set())
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const {
    data: deadlines,
    loading,
    error,
  } = useRepositoryQuery(() => repository.getFormDeadlines(), [] as FormDeadline[], [refreshKey])

  function toggleForm(code: FormCode) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(code)) next.delete(code)
      else next.add(code)
      return next
    })
  }

  async function handleSave() {
    if (!dueDate || selected.size === 0) return
    setSaving(true)
    setMessage(null)

    // 23:59:59 hora de Monterrey: el profesor piensa "hasta el final de ese
    // día". El input de fecha no trae zona horaria, así que se fija a mano —
    // la misma que ya usa el resto de la base para el Sheets (`0015`).
    const dueAt = `${dueDate}T23:59:59-06:00`

    try {
      for (const formCode of selected) {
        await repository.createFormDeadline({
          formCode,
          language: (language || null) as FormDeadline['language'],
          sessionDay: (sessionDay || null) as FormDeadline['sessionDay'],
          periodCode: period || null,
          dueAt,
        })
      }
      setSelected(new Set())
      setRefreshKey((key) => key + 1)
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'No se pudieron guardar las fechas.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    try {
      await repository.deleteFormDeadline(id)
      setRefreshKey((key) => key + 1)
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'No se pudo borrar la fecha.')
    }
  }

  return (
    <>
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight text-ink-950">
          Panel de Administrador
        </h1>
        <p className="mt-1.5 text-sm text-ink-500">
          Fechas límite y semanas del semestre
        </p>
      </header>

      <SemesterWeeksSection />

      <section className="mb-6 rounded-xl border border-ink-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-ink-900">Asignar fecha de entrega</h2>

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <Select label="Idioma" value={language} options={LANGUAGE_OPTIONS} onChange={setLanguage} />
          <Select
            label="Frecuencia"
            value={sessionDay}
            options={SESSION_DAY_OPTIONS}
            onChange={setSessionDay}
          />
          <Select label="Período" value={period} options={PERIOD_OPTIONS} onChange={setPeriod} />

          <div>
            <label htmlFor="fecha-limite" className="mb-1 block text-xs font-medium text-ink-500">
              Fecha límite
            </label>
            <input
              id="fecha-limite"
              type="date"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
              className={FIELD_INPUT}
            />
          </div>
        </div>

        <div className="mt-5">
          <p className="mb-2 text-xs font-medium text-ink-500">Formularios</p>
          <div className="flex flex-wrap gap-2">
            {DEADLINE_FORMS.map((form) => (
              <label
                key={form.code}
                className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                  selected.has(form.code)
                    ? 'border-ink-900 bg-ink-900 font-medium text-white'
                    : 'border-ink-200 bg-white text-ink-700 hover:bg-ink-50'
                }`}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={selected.has(form.code)}
                  onChange={() => toggleForm(form.code)}
                />
                {form.label} {form.name}
              </label>
            ))}
          </div>
          <div className="mt-2 flex gap-4 text-sm">
            <button
              type="button"
              className="font-medium text-ink-600 hover:text-ink-900"
              onClick={() => setSelected(new Set(DEADLINE_FORMS.map((form) => form.code)))}
            >
              Seleccionar todos
            </button>
            <button
              type="button"
              className="font-medium text-ink-600 hover:text-ink-900"
              onClick={() => setSelected(new Set())}
            >
              Limpiar
            </button>
          </div>
        </div>

        {message && <p className="mt-4 text-sm text-red-700">{message}</p>}

        <button
          type="button"
          disabled={!dueDate || selected.size === 0 || saving}
          onClick={handleSave}
          className="mt-5 rounded-lg bg-ink-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-ink-800 disabled:cursor-not-allowed disabled:bg-ink-200 disabled:text-ink-400"
        >
          {saving ? 'Guardando…' : 'Guardar fechas'}
        </button>
      </section>

      <section className="rounded-xl border border-ink-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-ink-200 px-5 py-3">
          <h2 className="text-sm font-semibold text-ink-900">Fechas asignadas</h2>
          <p className="text-xs text-ink-500">{deadlines.length} reglas</p>
        </div>

        {loading && <p className="px-5 py-6 text-sm text-ink-500">Cargando…</p>}
        {error && <p className="px-5 py-6 text-sm text-red-700">{error}</p>}
        {!loading && !error && deadlines.length === 0 && (
          <p className="px-5 py-6 text-sm text-ink-500">Todavía no hay fechas asignadas.</p>
        )}

        {!loading && deadlines.length > 0 && (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-ink-200 bg-ink-50 text-left text-[11px] font-semibold tracking-wider text-ink-500 uppercase">
                <th className="px-4 py-2.5">Formulario</th>
                <th className="px-4 py-2.5">Idioma</th>
                <th className="px-4 py-2.5">Frecuencia</th>
                <th className="px-4 py-2.5">Período</th>
                <th className="px-4 py-2.5">Fecha límite</th>
                <th className="px-4 py-2.5">Creado</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {deadlines.map((deadline) => {
                const form = formByCode(deadline.formCode)
                return (
                  <tr key={deadline.id} className="border-b border-ink-100 last:border-0">
                    <td className="px-4 py-3 font-medium text-ink-900">
                      {form.label} {form.name}
                    </td>
                    <td className="px-4 py-3 text-ink-500">
                      {optionLabel(LANGUAGE_OPTIONS, deadline.language) ?? 'Todos'}
                    </td>
                    <td className="px-4 py-3 text-ink-500">
                      {optionLabel(SESSION_DAY_OPTIONS, deadline.sessionDay) ?? 'Todas'}
                    </td>
                    <td className="px-4 py-3 text-ink-700">{deadline.periodCode ?? 'Todos'}</td>
                    <td className="px-4 py-3 font-medium text-ink-900">
                      {formatDate(deadline.dueAt)}
                    </td>
                    <td className="px-4 py-3 text-ink-500">{formatDate(deadline.createdAt)}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        title="Borrar esta fecha"
                        onClick={() => handleDelete(deadline.id)}
                        className="rounded-lg px-2 py-1 text-ink-400 hover:bg-red-50 hover:text-red-700"
                      >
                        Borrar
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </section>
    </>
  )
}

function optionLabel(options: FilterOption[], value: string | null): string | null {
  if (!value) return null
  return options.find((option) => option.value === value)?.label ?? value
}

/**
 * Semanas del semestre: el profesor da la semana 1 y cuántas hay, y el resto
 * sale de sumar 7 días (lo calcula `createSemesterWeeks`, no esta pantalla).
 *
 * El periodo es texto libre y no el `Select` de `PERIOD_OPTIONS`: ese
 * catálogo es una lista fija de periodos que ya existen, y aquí el profesor
 * necesita poder escribir uno nuevo (`PR-27`) antes de que exista en ningún
 * otro lado.
 */
function SemesterWeeksSection() {
  const [periodCode, setPeriodCode] = useState('')
  const [firstWeekStart, setFirstWeekStart] = useState('')
  const [weekCount, setWeekCount] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const {
    data: weeks,
    loading,
    error,
  } = useRepositoryQuery(() => repository.getSemesterWeeks(), [] as SemesterWeek[], [refreshKey])

  const periods = groupByPeriod(weeks)
  const parsedCount = Number(weekCount)
  const isMonday =
    firstWeekStart !== '' && new Date(`${firstWeekStart}T00:00:00`).getDay() === 1
  const puedeGenerar =
    !saving &&
    periodCode.trim() !== '' &&
    isMonday &&
    Number.isInteger(parsedCount) &&
    parsedCount >= 1 &&
    parsedCount <= 53

  async function handleGenerate() {
    if (!puedeGenerar) return
    setSaving(true)
    setMessage(null)

    try {
      await repository.createSemesterWeeks(periodCode.trim(), firstWeekStart, parsedCount)
      setPeriodCode('')
      setFirstWeekStart('')
      setWeekCount('')
      setRefreshKey((key) => key + 1)
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'No se pudieron generar las semanas.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDeletePeriod(period: string) {
    try {
      await repository.deleteSemesterWeeksForPeriod(period)
      setRefreshKey((key) => key + 1)
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'No se pudieron borrar las semanas.')
    }
  }

  return (
    <section className="mb-6 rounded-xl border border-ink-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-ink-900">Semanas del semestre</h2>
      <p className="mt-1 text-xs text-ink-500">
        La semana 1 empieza en lunes; las siguientes salen solas, sumando 7 días.
      </p>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="periodo-semanas" className="mb-1 block text-xs font-medium text-ink-500">
            Periodo
          </label>
          <input
            id="periodo-semanas"
            type="text"
            placeholder="OT-26"
            value={periodCode}
            onChange={(event) => setPeriodCode(event.target.value)}
            className={`${FIELD_INPUT} w-28`}
          />
        </div>
        <div>
          <label htmlFor="semana-1" className="mb-1 block text-xs font-medium text-ink-500">
            Semana 1 empieza (lunes)
          </label>
          <input
            id="semana-1"
            type="date"
            value={firstWeekStart}
            onChange={(event) => setFirstWeekStart(event.target.value)}
            className={FIELD_INPUT}
          />
        </div>
        <div>
          <label htmlFor="num-semanas" className="mb-1 block text-xs font-medium text-ink-500">
            Número de semanas
          </label>
          <input
            id="num-semanas"
            type="number"
            min={1}
            max={53}
            value={weekCount}
            onChange={(event) => setWeekCount(event.target.value)}
            className={`${FIELD_INPUT} tnum w-24`}
          />
        </div>
      </div>

      {firstWeekStart !== '' && !isMonday && (
        <p className="mt-2 text-xs text-red-700">La semana 1 tiene que empezar en lunes.</p>
      )}

      {message && <p className="mt-4 text-sm text-red-700">{message}</p>}

      <button
        type="button"
        disabled={!puedeGenerar}
        onClick={handleGenerate}
        className="mt-5 rounded-lg bg-ink-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-ink-800 disabled:cursor-not-allowed disabled:bg-ink-200 disabled:text-ink-400"
      >
        {saving ? 'Generando…' : 'Generar semanas'}
      </button>

      <div className="mt-6 border-t border-ink-100 pt-5">
        <p className="mb-2 text-xs font-medium text-ink-500">Periodos configurados</p>

        {loading && <p className="text-sm text-ink-500">Cargando…</p>}
        {error && <p className="text-sm text-red-700">{error}</p>}
        {!loading && !error && periods.length === 0 && (
          <p className="text-sm text-ink-500">Todavía no hay semanas configuradas.</p>
        )}

        {!loading && periods.length > 0 && (
          <ul className="space-y-2">
            {periods.map((periodo) => (
              <li
                key={periodo.periodCode}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-ink-200 px-3 py-2 text-sm"
              >
                <span>
                  <span className="font-medium text-ink-900">{periodo.periodCode}</span>
                  <span className="ml-2 text-ink-500">
                    {periodo.weekCount} semanas · {formatWeekRange(periodo.firstStart, periodo.lastEnd)}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => handleDeletePeriod(periodo.periodCode)}
                  className="rounded-lg px-2 py-1 text-ink-400 hover:bg-red-50 hover:text-red-700"
                >
                  Borrar
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

interface PeriodSummary {
  periodCode: string
  weekCount: number
  firstStart: string
  lastEnd: string
}

function groupByPeriod(weeks: SemesterWeek[]): PeriodSummary[] {
  const map = new Map<string, PeriodSummary>()

  for (const week of weeks) {
    const existing = map.get(week.periodCode)
    if (!existing) {
      map.set(week.periodCode, {
        periodCode: week.periodCode,
        weekCount: 1,
        firstStart: week.weekStart,
        lastEnd: week.weekEnd,
      })
      continue
    }
    existing.weekCount += 1
    if (week.weekStart < existing.firstStart) existing.firstStart = week.weekStart
    if (week.weekEnd > existing.lastEnd) existing.lastEnd = week.weekEnd
  }

  return [...map.values()].sort((a, b) => b.periodCode.localeCompare(a.periodCode))
}
