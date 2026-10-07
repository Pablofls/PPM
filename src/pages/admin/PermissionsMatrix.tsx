import { useMemo, useState } from 'react'

import { ROLE_LABELS, type RoleCode } from '../../auth/AuthProvider'
import { usePermissions } from '../../auth/PermissionsProvider'
import { repository } from '../../data/repository'
import {
  ACCESS_LABELS,
  ACCESS_RANK,
  SCREENS,
  type AccessLevel,
  type ScreenMeta,
} from '../../lib/screens'

/** Las columnas de la matriz. El admin va aparte: siempre puede todo. */
const MATRIX_ROLES: RoleCode[] = ['coordinador', 'maestro', 'alumno']

/** El color de una celda dice el nivel sin tener que leerlo. */
export const ACCESS_TONES: Record<AccessLevel, string> = {
  ninguno: 'border-ink-200 bg-white text-ink-500',
  lectura: 'border-sky-200 bg-sky-50 font-medium text-sky-800',
  edicion: 'border-emerald-200 bg-emerald-50 font-medium text-emerald-800',
}

/** Los niveles que admite una pantalla, de menos a más. */
export function levelsFor(screen: ScreenMeta): AccessLevel[] {
  return (['ninguno', 'lectura', 'edicion'] as AccessLevel[]).filter(
    (level) => ACCESS_RANK[level] <= ACCESS_RANK[screen.maxAccess],
  )
}

/** ¿Se le puede dar esta pantalla a este rol? El portal es solo del alumno. */
export function appliesTo(screen: ScreenMeta, role: RoleCode): boolean {
  if (screen.audience === 'ambos') return true
  return role === 'alumno' ? screen.audience === 'portal' : screen.audience === 'panel'
}

/** Las pantallas agrupadas por sección, en el orden del catálogo. */
export function sectionsOf(screens: ScreenMeta[]): { section: string; screens: ScreenMeta[] }[] {
  const sections: { section: string; screens: ScreenMeta[] }[] = []
  for (const screen of screens) {
    const last = sections[sections.length - 1]
    if (last?.section === screen.section) last.screens.push(screen)
    else sections.push({ section: screen.section, screens: [screen] })
  }
  return sections
}

/**
 * Permisos por rol (`0038`): qué ve y qué edita cada rol en cada pantalla.
 *
 * Cada cambio se guarda en cuanto se elige —no hay botón de guardar— y se
 * aplica en la base de inmediato: lectura de respuestas, entregas del alumno
 * y escrituras del staff. Las excepciones de una persona se hacen en
 * «Editar» de la pestaña Usuarios.
 */
export function PermissionsMatrix() {
  const { matrix, refetch, loading } = usePermissions()
  const [pending, setPending] = useState<Record<string, AccessLevel>>({})
  const [saving, setSaving] = useState<string | null>(null)
  const [message, setMessage] = useState<{ tone: 'red' | 'green'; text: string } | null>(null)

  const sections = useMemo(() => sectionsOf(SCREENS), [])

  function current(role: RoleCode, screen: string): AccessLevel {
    const key = `${role}:${screen}`
    if (key in pending) return pending[key]
    return matrix.find((cell) => cell.roleCode === role && cell.screenCode === screen)?.access ?? 'ninguno'
  }

  async function change(role: RoleCode, screen: ScreenMeta, access: AccessLevel) {
    const key = `${role}:${screen.code}`
    setPending((state) => ({ ...state, [key]: access }))
    setSaving(key)
    setMessage(null)
    try {
      await repository.setRoleScreenAccess(role, screen.code, access)
      setMessage({
        tone: 'green',
        text: `${ROLE_LABELS[role]} · ${screen.name}: ${ACCESS_LABELS[access]}.`,
      })
      refetch()
    } catch (cause) {
      setMessage({ tone: 'red', text: cause instanceof Error ? cause.message : 'No se pudo guardar.' })
    } finally {
      // Se suelta el valor optimista: manda lo que la base devuelva.
      setPending((state) => {
        const next = { ...state }
        delete next[key]
        return next
      })
      setSaving(null)
    }
  }

  return (
    <section className="rounded-xl border border-ink-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-200 px-5 py-3">
        <div>
          <h2 className="text-sm font-semibold text-ink-900">Accesos por rol</h2>
          <p className="mt-0.5 text-xs text-ink-500">
            Qué ve y qué edita cada rol. Los cambios se guardan solos y aplican de inmediato.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          {(['ninguno', 'lectura', 'edicion'] as AccessLevel[]).map((level) => (
            <span key={level} className={`rounded-md border px-2 py-0.5 ${ACCESS_TONES[level]}`}>
              {ACCESS_LABELS[level]}
            </span>
          ))}
        </div>
      </div>

      {message && (
        <p
          role="status"
          className={`mx-5 mt-4 rounded-lg px-3 py-2 text-sm ${
            message.tone === 'red' ? 'bg-red-50 text-red-800' : 'bg-emerald-50 text-emerald-800'
          }`}
        >
          {message.text}
        </p>
      )}

      <div className="overflow-x-auto p-5">
        <table className="w-full min-w-[44rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-ink-200 bg-ink-50 text-left text-[11px] font-semibold tracking-wider text-ink-500 uppercase">
              <th className="px-4 py-2.5">Pantalla</th>
              <th className="w-32 px-4 py-2.5 text-center">{ROLE_LABELS.admin}</th>
              {MATRIX_ROLES.map((role) => (
                <th key={role} className="w-44 px-3 py-2.5">
                  {ROLE_LABELS[role]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sections.map(({ section, screens }) => [
              <tr key={section} className="border-b border-ink-200 bg-ink-50/60">
                <td
                  colSpan={2 + MATRIX_ROLES.length}
                  className="px-4 py-2 text-[11px] font-semibold tracking-widest text-ink-500 uppercase"
                >
                  {section}
                </td>
              </tr>,
              ...screens.map((screen) => (
                <tr key={screen.code} className="border-b border-ink-100 last:border-0">
                  <td className="px-4 py-2.5">
                    <p className="font-medium text-ink-900">{screen.name}</p>
                    {screen.editHint && (
                      <p className="mt-0.5 text-xs text-ink-500">Editar: {screen.editHint}</p>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    {screen.audience === 'portal' ? (
                      <span className="text-ink-300">—</span>
                    ) : (
                      <span className="text-xs font-medium text-ink-500" title="El administrador siempre puede todo">
                        ✓ Total
                      </span>
                    )}
                  </td>
                  {MATRIX_ROLES.map((role) => {
                    if (!appliesTo(screen, role)) {
                      return (
                        <td key={role} className="px-3 py-2.5 text-ink-300">
                          —
                        </td>
                      )
                    }
                    const value = current(role, screen.code)
                    const key = `${role}:${screen.code}`
                    return (
                      <td key={role} className="px-3 py-2">
                        <select
                          aria-label={`${ROLE_LABELS[role]} · ${screen.name}`}
                          value={value}
                          disabled={loading || saving === key}
                          onChange={(event) =>
                            void change(role, screen, event.target.value as AccessLevel)
                          }
                          className={`w-full rounded-lg border px-2.5 py-1.5 text-sm shadow-sm focus:ring-2 focus:ring-ink-900/5 focus:outline-none ${ACCESS_TONES[value]}`}
                        >
                          {levelsFor(screen).map((level) => (
                            <option key={level} value={level}>
                              {ACCESS_LABELS[level]}
                            </option>
                          ))}
                        </select>
                      </td>
                    )
                  })}
                </tr>
              )),
            ])}
          </tbody>
        </table>
      </div>

      <p className="border-t border-ink-100 px-5 py-3 text-xs leading-relaxed text-ink-500">
        «Puede editar» de un maestro o coordinador vale solo dentro de sus propios grupos y
        alumnos. Fechas de entrega es la excepción: sus reglas son por periodo, frecuencia e
        idioma, así que se cambian para todos. Usuarios y permisos y Procesar datos son siempre
        solo del administrador.
      </p>
    </section>
  )
}
