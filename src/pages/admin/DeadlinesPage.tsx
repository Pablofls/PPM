import { useState } from 'react'

import { Select } from '../../components/FilterBar'
import { useRepositoryQuery } from '../../data/hooks'
import { repository } from '../../data/repository'
import type { FormDeadline } from '../../data/types'
import {
  DEADLINE_FORMS,
  formByCode,
  LANGUAGE_OPTIONS,
  PERIOD_OPTIONS,
  SESSION_DAY_OPTIONS,
  type FormCode,
  type FilterOption,
} from '../../lib/catalog'
import { formatDate } from '../../lib/format'

/**
 * Panel de Administrador — asignar fecha límite.
 *
 * Reemplaza editar a mano la hoja `fechas_entrega` del Sheets: el profesor
 * elige un grupo (idioma / frecuencia / periodo, o "todos" dejando el select
 * vacío), una fecha y uno o varios formularios, y cada combinación queda como
 * una regla en `form_deadlines`. "Estado de Entregas" es quien las usa para
 * comparar la marca temporal de cada entrega.
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
        <p className="mt-1.5 text-sm text-ink-500">Asigna fechas de entrega por grupo</p>
      </header>

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
              className="rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm text-ink-900 shadow-sm focus:border-ink-400 focus:ring-2 focus:ring-ink-900/5 focus:outline-none"
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
