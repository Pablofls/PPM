import { createContext, useCallback, useContext } from 'react'

/**
 * Idioma del portal del alumno.
 *
 * El panel del profesor es siempre en español (regla «Nomenclatura» de
 * CLAUDE.md). El portal del alumno sigue el idioma de su grupo
 * (`groups.language`): un alumno de un grupo de Inglés ve su portal en inglés.
 * No hay selector manual; el idioma lo decide únicamente el grupo.
 *
 * Fuera del portal no hay proveedor y el contexto vale `es`, así que los
 * componentes compartidos (campanita, expediente, contraseña) siguen en
 * español en el panel sin que nadie tenga que pasarles nada.
 */
export type Lang = 'es' | 'en'

export const LangContext = createContext<Lang>('es')

export function useLang(): Lang {
  return useContext(LangContext)
}

/** `t('Entregar', 'Submit')`: cada texto lleva sus dos versiones, una junto a la otra. */
export type Translate = (es: string, en: string) => string

export function useT(): Translate {
  const lang = useLang()
  return useCallback((es: string, en: string) => (lang === 'en' ? en : es), [lang])
}

/** La configuración regional de `Intl` para cada idioma. */
export function localeOf(lang: Lang): string {
  return lang === 'en' ? 'en-US' : 'es-MX'
}

// ---------------------------------------------------------------------------
// Textos fijos que llegan de la base
// ---------------------------------------------------------------------------

/**
 * Los textos que genera la base para el alumno: los `raise exception` de las
 * funciones de entrega de bitácoras y el título de las notificaciones de
 * calificación (`0050`). Se traducen aquí, en la pantalla, para no tener que
 * migrar las funciones; lo que no se reconoce se devuelve tal cual (los avisos
 * que escribe el profesor, por ejemplo, van como él los escribió).
 */
const SERVER_TEXT: [RegExp, (match: RegExpMatchArray) => string][] = [
  [/^Reporte semana (\d+)$/, (m) => `Weekly report ${m[1]}`],
  [/^Primero entrega la semana (\d+)\.$/, (m) => `Submit week ${m[1]} first.`],
  [/^La semana (\d+) ya está entregada\.$/, (m) => `Week ${m[1]} has already been submitted.`],
  [/^Tu cuenta no está asociada a ningún alumno\.$/, () => 'Your account is not linked to any student.'],
  [/^Indica qué semana estás reportando\.$/, () => 'Indicate which week you are reporting.'],
  [
    /^Tu cuenta no tiene un (grupo|periodo) asignado\. Contacta a tu profesor\.$/,
    (m) => `Your account has no ${m[1] === 'grupo' ? 'group' : 'term'} assigned. Contact your professor.`,
  ],
  [
    /^Esa semana no está configurada para tu (grupo|periodo)\. Contacta a tu profesor\.$/,
    (m) =>
      `That week is not set up for your ${m[1] === 'grupo' ? 'group' : 'term'}. Contact your professor.`,
  ],
  [
    /^Hoy no cae dentro de ninguna semana configurada de tu (grupo|periodo)\. Contacta a tu profesor\.$/,
    (m) =>
      `Today does not fall within any week set up for your ${m[1] === 'grupo' ? 'group' : 'term'}. Contact your professor.`,
  ],
  [/^Solo puedes entregar la semana en curso\.$/, () => 'You can only submit the current week.'],
  [
    /^Ya no puedes corregir esa entrega: no es tuya, o su semana ya no es la actual\.$/,
    () => 'You can no longer edit that submission: it is not yours, or its week is no longer the current one.',
  ],
  [
    /^Las horas de la semana tienen que estar entre 0 y 168\.$/,
    () => 'Weekly hours must be between 0 and 168.',
  ],
  [
    /^No se pudo guardar tu entrega\. Verifica que tu cuenta sea la de un alumno y vuelve a intentarlo\.$/,
    () => 'Your submission could not be saved. Make sure you are signed in with a student account and try again.',
  ],
  // Los errores de carga del repositorio: «No se pudo … : <detalle técnico>».
  [/^No se pudieron? [^:]+: (.*)$/s, (m) => `Something went wrong: ${m[1]}`],
]

export function translateServerText(message: string, lang: Lang): string
export function translateServerText(message: string | null, lang: Lang): string | null
export function translateServerText(message: string | null, lang: Lang): string | null {
  if (message === null || lang === 'es') return message
  for (const [pattern, translate] of SERVER_TEXT) {
    const match = message.match(pattern)
    if (match) return translate(match)
  }
  return message
}
