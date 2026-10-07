/**
 * Las pantallas a las que se les da acceso por rol y por persona (`0038`).
 *
 * Es el espejo de `app_screens`: la base guarda el código, el máximo y a qué
 * lado aplica; aquí viven el nombre visible, la sección de la matriz y la
 * ruta. Agregar una pantalla con permiso es una fila en las dos partes.
 */
import { FORMS, MODULE_TITLES, WEEKLY_FORMS } from './catalog'

export type AccessLevel = 'ninguno' | 'lectura' | 'edicion'

/** Orden de los niveles: para comparar «al menos lectura». */
export const ACCESS_RANK: Record<AccessLevel, number> = { ninguno: 0, lectura: 1, edicion: 2 }

export const ACCESS_LABELS: Record<AccessLevel, string> = {
  ninguno: 'Sin acceso',
  lectura: 'Solo lectura',
  edicion: 'Puede editar',
}

export interface ScreenMeta {
  code: string
  name: string
  section: string
  /** Lo más que se puede dar: las pantallas de consulta no tienen qué editar. */
  maxAccess: Exclude<AccessLevel, 'ninguno'>
  /** `panel` = maestro y coordinador; `portal` = alumno; `ambos`. */
  audience: 'panel' | 'portal' | 'ambos'
  /** Ruta de la pantalla, para saber cuál se está abriendo. */
  path?: string
  /** Qué significa «Puede editar» aquí, para la matriz. */
  editHint?: string
}

const weekly = (code: 'form_busqueda' | 'form_practicas') =>
  WEEKLY_FORMS.find((form) => form.code === code)!

export const SCREENS: ScreenMeta[] = [
  ...FORMS.map<ScreenMeta>((form) => ({
    code: form.code,
    name: `${form.label} ${form.name}`,
    section: MODULE_TITLES[form.moduleCode],
    maxAccess: 'lectura',
    audience: 'panel',
    path: form.path,
  })),
  {
    code: 'form_busqueda',
    name: weekly('form_busqueda').name,
    section: 'Bitácoras semanales',
    maxAccess: 'edicion',
    audience: 'ambos',
    editHint: 'Maestro: corregir la semana · Alumno: entregar',
  },
  {
    code: 'form_practicas',
    name: weekly('form_practicas').name,
    section: 'Bitácoras semanales',
    maxAccess: 'edicion',
    audience: 'ambos',
    editHint: 'Maestro: corregir la semana · Alumno: entregar',
  },
  {
    code: 'estado_entregas',
    name: 'Estado de Entregas',
    section: 'Entregas',
    maxAccess: 'lectura',
    audience: 'panel',
    path: '/entregas/estado-de-entregas',
  },
  {
    code: 'fechas_entrega',
    name: 'Fechas de entrega',
    section: 'Entregas',
    maxAccess: 'edicion',
    audience: 'panel',
    path: '/entregas/fechas-de-entrega',
    editHint: 'Asignar fechas y semanas (para todos los grupos)',
  },
  {
    code: 'alumnos_registrados',
    name: 'Alumnos registrados',
    section: 'Configuración',
    maxAccess: 'edicion',
    audience: 'panel',
    path: '/configuracion/alumnos-registrados',
    editHint: 'Registrar alumnos en sus grupos',
  },
  {
    code: 'grupos',
    name: 'Administrar grupos',
    section: 'Configuración',
    maxAccess: 'edicion',
    audience: 'panel',
    path: '/configuracion/grupos',
    editHint: 'Crear, mover y reasignar sus grupos',
  },
  {
    code: 'alumno_adn',
    name: 'ADN Profesional',
    section: 'Portal del alumno',
    maxAccess: 'lectura',
    audience: 'portal',
  },
  {
    code: 'alumno_estado',
    name: 'Estado de Entregas',
    section: 'Portal del alumno',
    maxAccess: 'lectura',
    audience: 'portal',
  },
]

export const screenByPath = (path: string): ScreenMeta | undefined =>
  SCREENS.find((screen) => screen.path === path)

/** ¿`access` alcanza para `needed`? */
export function hasAccess(access: AccessLevel, needed: AccessLevel = 'lectura'): boolean {
  return ACCESS_RANK[access] >= ACCESS_RANK[needed]
}
