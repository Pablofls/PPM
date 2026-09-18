import { useAuth } from "./AuthProvider";

/**
 * Pantalla para una cuenta con rol `pendiente`, o desactivada.
 *
 * Que exista esta pantalla no es lo que protege los datos: aunque alguien la
 * saltara en el navegador, las políticas RLS no le devolverían ni una fila.
 */
export function PendingPage() {
  const { profile, session, signOut } = useAuth();
  const isDeactivated = profile?.is_active === false;

  return (
    <div className="flex min-h-full items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded border border-ink-200 bg-white">
        <div className="px-8 py-8">
          <h1 className="font-serif text-2xl text-ink-950">
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
            className="mt-6 rounded border border-ink-200 px-4 py-2 text-sm text-ink-700 hover:bg-ink-50"
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    </div>
  );
}
