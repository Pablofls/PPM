# Autenticación, roles y permisos

Cómo entra la gente al panel y qué puede ver cada quien.

- **Proveedor:** Supabase Auth, **correo + contraseña**
- **Implementación:** `supabase/migrations/0001_auth.sql`
- **Implementación del rol `alumno`:** `supabase/migrations/0013_role_alumno.sql`
  y `0014_student_accounts.sql`
- **Estado:** ✅ `0001` ejecutado el 2026-09-11; `0013` y `0014`, el 2026-09-18.
  Falta correr `create_student_accounts()` para dar de alta a los alumnos

## Principio

> Estar autenticado **no** da acceso a nada.

El panel muestra nombres, matrículas, fechas de nacimiento y correos personales de
alumnos. Por eso todas las políticas exigen `is_admin()` y no `authenticated`. Un
usuario recién registrado puede iniciar sesión y no ve ni una fila.

## Roles

| Rol | Qué puede hacer |
|---|---|
| `pendiente` | Iniciar sesión y ver su propio perfil. **Nada más.** Es el rol con el que nace todo usuario |
| `alumno` | Iniciar sesión, entregar sus dos bitácoras semanales, leer **sus propias** entregas y su propio expediente (ADN Profesional). Nada de ningún otro alumno, nada de los otros trece formularios |
| `admin` | Leer todas las pantallas del panel y administrar los roles de los demás |

Todas las pantallas **del panel** son admin-only. El alumno tiene su propio
árbol de rutas bajo `/alumno`, con su propia guardia (`StudentRoute`).

### Lo que el alumno puede hacer

> Migraciones `0016_student_weekly_logs.sql` y `0019_student_dossier_read.sql`.

| Tabla | Lectura | Escritura |
|---|---|---|
| `profiles` | el suyo | no |
| `submissions` | las suyas | `INSERT`, solo `form_busqueda` y `form_practicas` |
| `job_search_logs` | las suyas | `INSERT`, solo las de sus propias entregas |
| `internship_logs` | las suyas | `INSERT`, solo las de sus propias entregas |
| `students` | la suya | no |
| `demographics`, `holland_results`, `mbti_results`, `disc_results`, `values_results`, `company_profiles` | las suyas | no |
| todo lo demás | **no** | **no** |

La condición de «mío» es siempre la misma, `student_id =
public.current_student_id()`, nunca `authenticated`. Para las tablas de
respuestas, que cuelgan de `submission_id`, se resuelve con un `EXISTS` contra
`submissions`, que vuelve a pasar por esa misma condición: una sola definición,
en un solo lugar.

Las políticas del alumno son **permisivas y se suman** a las de `is_admin()`: el
profesor sigue viendo todo.

No hay política de `UPDATE` ni de `DELETE` para nadie. Una entrega no se edita
ni se borra: corregir una semana es volver a entregarla, y las dos quedan en el
expediente. Es también lo que hacía Google Forms, donde el alumno nunca pudo
volver sobre lo enviado.

> Hasta aquí el alumno no leía su expediente —sus resultados de Holland,
> MBTI, DISC— y no era un pendiente olvidado: la información se abre una
> pantalla a la vez, cada una con su política. `0019` abre esa lectura porque
> el profesor pidió mostrar la tarjeta ADN Profesional (secciones I a V, sin
> las bitácoras ni el historial de respuestas) dentro del portal del alumno:
> `students_select_own`, `demographics_select_own` y la misma condición para
> `holland_results`, `mbti_results`, `disc_results`, `values_results` y
> `company_profiles`, todas acotadas por `EXISTS` contra `submissions` igual
> que `job_search_logs_select_own`.

## Cómo se crean las cuentas de los alumnos

El alumno **no se registra**: la cuenta se la crea el profesor.

- **Usuario:** su correo institucional.
- **Contraseña:** su matrícula.
- **Quiénes:** los alumnos que contestaron el formulario **1.0 Datos
  Demográficos**, porque es de ahí de donde sale la matrícula. Un alumno sin 1.0
  no tiene contraseña posible y la función lo reporta como omitido.

En el **SQL Editor de Supabase**, después de pegar `0013` y `0014` (en ese orden
y en dos ejecuciones distintas):

```sql
select * from public.create_student_accounts();
```

Devuelve una fila por alumno: `creado`, `ya existía: perfil enlazado` u
`omitido: sin matrícula en el 1.0`. Es **idempotente**: volver a correrla da de
alta a los alumnos nuevos y no le cambia la contraseña a nadie.

`profiles.student_id` es lo que une la cuenta con el alumno. Se enlaza por
correo una sola vez, al crear la cuenta; de ahí en adelante manda el id, para que
corregirle el correo a alguien no lo desconecte de sus propias entregas.

### Lo que hay que saber de este esquema de contraseñas

La matrícula **no es un secreto**: aparece en las listas del grupo y en el panel
del profesor. Cualquiera que conozca la matrícula de un compañero y su correo
institucional puede entrar a su cuenta.

Hoy eso no expone nada —el rol `alumno` no lee ninguna tabla—, pero deja de ser
aceptable **el día que la vista del alumno muestre sus datos**. Antes de ese
paso hace falta decidir una de dos:

- obligar a cambiar la contraseña en el primer inicio de sesión, o
- mandar un enlace mágico al correo institucional en vez de usar contraseña.

Nota práctica: Supabase exige 10 caracteres mínimo al cambiar o restablecer una
contraseña por la API. Una matrícula de 6 dígitos funciona para entrar, porque el
alta se hace en la base y esa política solo la aplica la API, pero el alumno no
podrá *ponerse* una contraseña corta.

### Por qué el alta se hace en SQL y no con la API

Crear usuarios por la API de Supabase necesita la llave `service_role`, que este
proyecto no tiene y no debe tener: viajaría en el bundle del navegador. El SQL
Editor ya es un contexto administrativo, así que `create_student_accounts()`
escribe directo en `auth.users` y `auth.identities`, con el mismo hash bcrypt
que usa Supabase Auth. La contraseña en claro no se guarda en ninguna columna, y
la función no es ejecutable por nadie con sesión en el navegador.

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
| Escribir en las tablas de datos desde el navegador | denegado, salvo el `INSERT` del alumno en sus dos bitácoras |
| Un alumno entrega una bitácora a nombre de otro | denegado: el `student_id` no se recibe, sale de `current_student_id()` |
| Un alumno entrega un formulario que no es bitácora | denegado por el `WITH CHECK` de `submissions_insert_own` |
| Un alumno inventa un `source_row_key` para estorbar a la sincronización | denegado: la política exige `source_row_key is null` |
| Un alumno edita o borra una entrega | denegado: no existe política de `UPDATE` ni de `DELETE` |
| Un alumno lee el expediente de otro alumno | denegado: `students_select_own` y las políticas gemelas de `demographics`, `holland_results`, `mbti_results`, `disc_results`, `values_results` y `company_profiles` filtran por `current_student_id()`, no por `authenticated` |

> **Verificado en Supabase el 2026-09-20.** Suplantando a un alumno real desde
> el SQL Editor —`set local role authenticated` más sus claims en
> `request.jwt.claims`, todo dentro de una transacción con `rollback`, para no
> dejar una entrega de prueba en el expediente de nadie:
>
> - `submit_job_search_log()` creó la entrega y el alumno la leyó de vuelta en
>   `v_student_job_search_logs`;
> - `new_weekly_submission('form1_0', …)` falló con
>   `42501: new row violates row-level security policy for table "submissions"`.
>
> La segunda es la que importa: el acotamiento por código de formulario lo
> impone la política, no la interfaz.

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

✅ Implementado.

| Archivo | Responsabilidad |
|---|---|
| `src/data/supabaseClient.ts` | cliente; avisa si faltan las variables de entorno |
| `src/auth/AuthProvider.tsx` | sesión y rol en un contexto |
| `src/auth/LoginPage.tsx` | correo + contraseña, con errores en español |
| `src/auth/PendingPage.tsx` | cuenta sin autorizar o desactivada |
| `src/auth/ProtectedRoute.tsx` | sin sesión → login; rol alumno → `/alumno`; sin rol admin → pendiente |
| `src/auth/StudentRoute.tsx` | la guardia gemela de la vista del alumno |
| `src/layouts/StudentShell.tsx` | el marco de la vista del alumno, gemelo del `AppShell` |
| `src/pages/alumno/StudentHome.tsx` | índice de tareas del alumno, con su ADN Profesional (`DossierProfile`, secciones I a V) |
| `src/pages/alumno/WeeklyLogPage.tsx` | entrega de una bitácora y sus entregas anteriores |

Todo el panel cuelga de `ProtectedRoute` en `App.tsx`: no hay una sola ruta
accesible sin sesión y sin rol `admin`. Entrar directo a `/modulo1/habilidades`
muestra el login.

### Un detalle de implementación que importa

El callback de `onAuthStateChange` se mantiene **síncrono**: hacer `await` de una
consulta ahí adentro puede bloquear al cliente de Supabase. El perfil se carga en
un efecto aparte, disparado por el id del usuario.

El rol se lee de `profiles`, **nunca** de algo que el cliente pueda manipular. Y
aunque alguien falsee el frontend, RLS es lo que realmente protege los datos: el
navegador no puede leer lo que la base no le deja.
