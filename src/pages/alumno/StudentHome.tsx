import { useAuth } from '../../auth/AuthProvider'

/**
 * Pantalla de bienvenida del alumno: lo único que existe hoy de la vista de
 * alumno.
 *
 * Solo muestra lo que ya trae la sesión (su nombre y su correo). No consulta
 * ninguna tabla de datos a propósito: las políticas siguen exigiendo
 * `is_admin()`, así que un alumno no lee ni una fila, ni la suya. Abrirle sus
 * propias entregas es el siguiente paso, y lleva sus propias políticas
 * (`student_id = current_student_id()`).
 *
 * Las secciones de abajo se muestran deshabilitadas por la misma razón que el
 * rail del profesor: comunican a dónde va esto sin prometer que ya funciona
 * (regla «Alcance de las pantallas» de CLAUDE.md).
 */
export function StudentHome() {
  const { profile, session, signOut } = useAuth()
  const nombre = profile?.full_name?.trim()
  const correo = profile?.email ?? session?.user?.email

  return (
    <div className="flex min-h-full flex-col">
      <header className="flex items-center justify-between gap-6 border-b border-ink-200 bg-white px-6 py-3 sm:px-8">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold tracking-tight text-ink-900">
            Prácticas Profesionales
          </p>
          <p className="text-xs text-ink-500">Portal del alumno</p>
        </div>

        <div className="flex shrink-0 items-center gap-3 text-sm">
          <span className="hidden max-w-56 truncate text-ink-600 sm:inline" title={correo}>
            {correo}
          </span>
          <button
            type="button"
            onClick={signOut}
            className="rounded-lg px-2.5 py-1.5 font-medium text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900"
          >
            Cerrar sesión
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-6 py-10 sm:px-8">
        <h1 className="text-2xl font-semibold tracking-tight text-ink-950">
          {nombre ? `Hola, ${nombre}` : 'Hola'}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-600">
          Este es tu acceso a Prácticas Profesionales. Tus formularios se siguen
          contestando en Google Forms, como hasta ahora; aquí es donde vas a
          poder consultar lo que ya entregaste.
        </p>

        <section className="mt-8 rounded-xl border border-ink-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-ink-900">Tu cuenta</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="sm:flex sm:gap-4">
              <dt className="w-44 shrink-0 text-ink-500">Nombre</dt>
              <dd className="text-ink-800">{nombre || 'No registrado'}</dd>
            </div>
            <div className="sm:flex sm:gap-4">
              <dt className="w-44 shrink-0 text-ink-500">Correo institucional</dt>
              <dd className="break-all text-ink-800">{correo}</dd>
            </div>
            <div className="sm:flex sm:gap-4">
              <dt className="w-44 shrink-0 text-ink-500">Contraseña</dt>
              <dd className="text-ink-800">Tu matrícula</dd>
            </div>
          </dl>
          <p className="mt-4 border-t border-ink-100 pt-4 text-xs leading-relaxed text-ink-500">
            Si algo de tus datos no coincide, lo que manda es lo que registraste
            en el formulario 1.0 Datos Demográficos. Avísale a tu profesor para
            corregirlo.
          </p>
        </section>

        <section className="mt-6">
          <h2 className="px-1 text-[11px] font-semibold tracking-widest text-ink-500 uppercase">
            Próximamente
          </h2>
          <ul className="mt-2 space-y-2">
            {PROXIMAMENTE.map((seccion) => (
              <li
                key={seccion.titulo}
                title="Todavía no está disponible"
                className="cursor-not-allowed rounded-xl border border-dashed border-ink-200 bg-ink-50/50 px-5 py-4"
              >
                <p className="text-sm font-medium text-ink-600">{seccion.titulo}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-ink-500">
                  {seccion.descripcion}
                </p>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  )
}

/**
 * Lo que el alumno va a poder ver de sí mismo. No es demo data: es el índice de
 * la vista del alumno, igual que «Próximamente» en el rail del profesor.
 */
const PROXIMAMENTE = [
  {
    titulo: 'Mis entregas',
    descripcion:
      'Qué formularios ya entregaste y cuándo, de los Módulos 1 y 2 y los apéndices.',
  },
  {
    titulo: 'Mi expediente',
    descripcion:
      'Tus resultados de intereses, personalidad, comportamiento, habilidades y valores.',
  },
  {
    titulo: 'Mis bitácoras',
    descripcion:
      'Tus reportes semanales de búsqueda y de prácticas, con las horas acumuladas.',
  },
]
