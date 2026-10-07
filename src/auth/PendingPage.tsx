import { useAuth } from "./AuthProvider";

/**
 * Pantalla para una cuenta con rol `pendiente`, o desactivada.
 *
 * Que exista esta pantalla no es lo que protege los datos: aunque alguien la
 * saltara en el navegador, las políticas RLS no le devolverían ni una fila.
 */
export function PendingPage() {
  const { profile, profileError, session, signOut } = useAuth();
  const isDeactivated = profile?.is_active === false;

  // No es una cuenta pendiente: la consulta del perfil falló. Lo más común
  // es una pestaña abierta con la versión anterior de la app justo después
  // de un cambio en la base; recargar trae la nueva.
  if (profileError) {
    return (
      <div className="flex min-h-full items-center justify-center px-4 py-12">
        <div className="w-full max-w-md rounded-xl border border-ink-200 bg-white px-8 py-8 shadow-sm">
          <h1 className="text-xl font-semibold tracking-tight text-ink-950">
            No se pudo cargar tu cuenta
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-ink-600">
            Recarga la página. Si el problema sigue, avisa al administrador con este
            mensaje:
          </p>
          <p className="mt-3 rounded-lg bg-ink-50 px-3 py-2 font-mono text-xs text-ink-700">
            {profileError}
          </p>
          <div className="mt-6 flex gap-3">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-lg bg-ink-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-ink-800"
            >
              Recargar
            </button>
            <button
              type="button"
              onClick={signOut}
              className="rounded-lg border border-ink-200 px-4 py-2 text-sm font-medium text-ink-700 shadow-sm hover:bg-ink-50"
            >
              Cerrar sesión
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-full items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-xl border border-ink-200 bg-white shadow-sm">
        <div className="px-8 py-8">
          <h1 className="text-xl font-semibold tracking-tight text-ink-950">
            {isDeactivated
              ? "Cuenta desactivada"
              : "Cuenta pendiente de autorización"}
          </h1>

          <p className="mt-3 text-sm leading-relaxed text-ink-600">
            {isDeactivated
              ? "Tu cuenta existe pero está desactivada. Pide a un administrador que la reactive."
              : "Tu cuenta se creó correctamente, pero todavía no tiene permisos para ver el panel. Un administrador tiene que autorizarla."}
          </p>

          <p className="mt-4 text-sm text-ink-500">
            Entraste como{" "}
            <span className="font-medium">
              {profile?.email ?? session?.user?.email}
            </span>
          </p>

          <button
            type="button"
            onClick={signOut}
            className="mt-6 rounded-lg border border-ink-200 px-4 py-2 text-sm font-medium text-ink-700 shadow-sm hover:bg-ink-50"
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    </div>
  );
}
