# Autenticación, roles y permisos

Cómo entra la gente al panel y qué puede ver cada quien.

- **Proveedor:** Supabase Auth, **correo + contraseña**
- **Implementación:** `supabase/migrations/0001_auth.sql`
- **Estado:** ✅ ejecutado en Supabase el 2026-09-11; falta crear el primer admin

## Principio

> Estar autenticado **no** da acceso a nada.

El panel muestra nombres, matrículas, fechas de nacimiento y correos personales de
alumnos. Por eso todas las políticas exigen `is_admin()` y no `authenticated`. Un
usuario recién registrado puede iniciar sesión y no ve ni una fila.

## Roles

| Rol | Qué puede hacer |
|---|---|
| `pendiente` | Iniciar sesión y ver su propio perfil. **Nada más.** Es el rol con el que nace todo usuario |
| `admin` | Leer todas las pantallas del panel y administrar los roles de los demás |

Todas las pantallas de este primer despliegue son **admin-only**. Cuando existan
roles con menos permisos se agregan con:

```sql
alter type app_role add value 'alumno';
```

…y las políticas de las tablas que ese rol pueda leer.

## Las contraseñas

Las administra **Supabase Auth**: viven hasheadas en `auth.users`, un esquema que
este proyecto no toca. La aplicación nunca ve, guarda ni transmite una contraseña
en claro; solo llama a `signInWithPassword()` y recibe una sesión.

Tampoco se guarda nada de contraseñas en `profiles`.

## Cómo se crea el primer admin

Es el problema del huevo y la gallina: para promover a alguien a `admin` hay que
ser `admin`, y al principio no hay ninguno. Se resuelve **una sola vez**:

1. Entras a la app y te registras con tu correo y una contraseña.
2. El trigger `handle_new_user()` te crea el perfil con rol `pendiente`.
   Al entrar verás la pantalla de *cuenta pendiente de autorización*.
3. En el **SQL Editor de Supabase**, corres:

   ```sql
   update profiles set role = 'admin' where email = 'tu-correo@udem.edu';
   ```

4. Recargas la app y ya entras como administrador.

De ahí en adelante, los admins se promueven entre sí.

### Por qué esto funciona desde el SQL Editor y no desde la app

El trigger `guard_profile_role()` bloquea cualquier cambio de `role` hecho por
alguien que no sea admin. Pero en el SQL Editor **no hay sesión de usuario**, así
que `auth.uid()` devuelve `NULL` y el trigger permite el cambio.

Eso no es un agujero: un usuario autenticado **siempre** tiene `auth.uid()`, así
que esa rama no le sirve a nadie para escalar privilegios desde el navegador. El
único camino a `NULL` es el SQL Editor o `service_role`, que ya son contextos
administrativos con acceso total a la base.

> Este detalle costó encontrarlo: la primera versión del trigger bloqueaba
> también el bootstrap, y no habría habido forma de crear el primer admin.

## Protecciones implementadas

| Intento | Resultado |
|---|---|
| Un `pendiente` lee las tablas de datos | 0 filas |
| Un `pendiente` lee perfiles ajenos | solo ve el suyo |
| Un `pendiente` se asciende a `admin` | error: *Solo un administrador puede cambiar roles* |
| Un `admin` cambia **su propio** rol | error: *Un administrador no puede cambiar su propio rol* |
| Un `admin` promueve a otro usuario | permitido |
| Un usuario sin sesión (`anon`) | permiso denegado |
| Escribir en las tablas de datos desde el navegador | denegado (no hay política de escritura) |

La tercera y la cuarta las impone el trigger `guard_profile_role()`, no RLS: **RLS
controla qué filas se pueden modificar, no qué columnas**. Sin el trigger,
cualquiera con permiso de editar su propio perfil podría ascenderse.

La cuarta existe para que un admin no se degrade por error y deje el panel sin
administradores. Si hace falta quitarle el rol a alguien, lo hace **otro** admin.

## `is_admin()`

```sql
create function public.is_admin() returns boolean
language sql stable
security definer            -- indispensable
set search_path = ''        -- evita suplantación de esquema
```

`SECURITY DEFINER` no es opcional. La política de `profiles` llama a esta función,
y la función consulta `profiles`. Con los permisos de quien llama, esa consulta
volvería a disparar la política → **recursión infinita**. `SECURITY DEFINER`
ejecuta con los permisos del dueño, se salta RLS y corta el ciclo.

`set search_path = ''` impide que alguien cree un esquema propio con una tabla
`profiles` falsa y la anteponga en el `search_path`.

## Configuración del dashboard

En **Authentication → Providers**:

- Habilitar **Email**, con *Confirm email* según se decida.
- Longitud mínima de contraseña: **10 caracteres**.
- El registro queda abierto mientras se crean los admins. Después se puede cerrar
  desde **Authentication → Sign In / Providers**, y dar de alta usuarios a mano.

## En el frontend

| Archivo | Responsabilidad |
|---|---|
| `src/auth/AuthProvider.tsx` | sesión y rol en un contexto |
| `src/auth/LoginPage.tsx` | correo + contraseña |
| `src/auth/ProtectedRoute.tsx` | sin sesión → login; rol `pendiente` → cuenta pendiente |

El rol se lee de `profiles`, **nunca** de algo que el cliente pueda manipular. Y
aunque alguien falsee el frontend, RLS es lo que realmente protege los datos: el
navegador no puede leer lo que la base no le deja.
