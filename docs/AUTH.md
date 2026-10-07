# Autenticación, roles y permisos

Cómo entra la gente al panel y qué puede ver cada quien.

- **Proveedor:** Supabase Auth, **correo + contraseña**
- **Implementación:** `supabase/migrations/0001_auth.sql`
- **Implementación del rol `alumno`:** `supabase/migrations/0013_role_alumno.sql`
  y `0014_student_accounts.sql`
- **Estado:** ✅ `0001` ejecutado el 2026-09-11; `0013` y `0014`, el 2026-09-18.
  El alta masiva se corrió el 2026-09-20. `0021_sync_creates_student_accounts.sql`
  se ejecutó el 2026-09-25: ya no hace falta volver a correrla a mano, la
  sincronización horaria del Sheets la llama sola

## Principio

> Estar autenticado **no** da acceso a nada.

El panel muestra nombres, matrículas, fechas de nacimiento y correos personales de
alumnos. Por eso todas las políticas exigen `is_admin()` y no `authenticated`. Un
usuario recién registrado puede iniciar sesión y no ve ni una fila.

## Roles

Desde `0035` una cuenta puede tener **varios roles** (`user_roles`); René es
`admin` y `maestro`. Sin ningún rol, la cuenta está pendiente de autorización.

| Rol | Qué puede hacer |
|---|---|
| (sin roles) | Iniciar sesión y ver su propio perfil. **Nada más.** Así nace todo usuario |
| `alumno` | Iniciar sesión, entregar sus dos bitácoras semanales, leer **sus propias** entregas, su propio expediente (ADN Profesional) y su propio estado de entregas. Nada de ningún otro alumno, nada de los otros trece formularios. **No se combina con otro rol** |
| `maestro` | Leer el panel **de sus grupos**: sus alumnos y sus entregas. Sin escritura (`0036`) |
| `coordinador` | Leer el panel de los grupos **de los maestros que tiene asignados** (`coordinator_teachers`). Sin escritura (`0036`) |
| `admin` | Leer todo, escribir lo que el panel escribe (fechas, semanas, alumnos, grupos, sincronización) y administrar roles |

### «Ver como»

Selector **Ver como** (abajo del rail, en la barra de Mis grupos y en la
franja del portal del alumno):

- El **administrador** elige cualquiera de los cuatro roles **sin tenerlos
  asignados**, para ver la plataforma como la ve cada tipo de usuario. En
  maestro y coordinador elige además **a quién**: ve los grupos y alumnos de
  esa persona, exactamente como ella. En alumno elige un alumno y ve su portal
  en **solo lectura** (no puede entregar ni corregir en su nombre, y no ve su
  «Mi perfil» ni «Cerrar sesión»).
- Quien tiene varios roles sin ser admin (un coordinador que también es
  maestro) cambia solo entre **los suyos**, y siempre se ve a sí mismo.
- Con un solo rol, el selector no aparece.

Desde la fase 5, la vista de un alumno también aplica **sus** excepciones de
permisos (las de su cuenta), no solo la matriz del rol alumno.

**No da ni quita permisos**: RLS deja leer lo que la cuenta tiene (el admin,
todo); la vista solo acota lo que la interfaz muestra. Se recuerda en el
navegador (`ppm.vista`).

Las pantallas **del panel** son para el staff (`ProtectedRoute` exige un rol
de admin, coordinador o maestro); Configuración y Fechas de entrega además van
dentro de `AdminRoute`. El alumno tiene su propio
árbol de rutas bajo `/alumno`, con su propia guardia (`StudentRoute`).

### Lo que el alumno puede hacer

> Migraciones `0016_student_weekly_logs.sql`, `0018_semester_weeks.sql`,
> `0019_student_dossier_read.sql`, `0023_student_form_deadlines_read.sql` y
> `0025_student_forms_read.sql`.

| Tabla | Lectura | Escritura |
|---|---|---|
| `profiles` | el suyo | no |
| `submissions` | las suyas | `INSERT`, solo `form_busqueda` y `form_practicas` |
| `job_search_logs` | las suyas | `INSERT`, solo las de sus propias entregas |
| `internship_logs` | las suyas | `INSERT`, solo las de sus propias entregas |
| `semester_weeks` | las de su propio periodo | no |
| `students` | la suya | no |
| `demographics`, `holland_results`, `mbti_results`, `disc_results`, `values_results`, `company_profiles` | las suyas | no |
| `form_deadlines`, `forms` | todas — ninguna de las dos tiene datos personales, son catálogos y reglas iguales para todos | no |
| todo lo demás | **no** | **no** |

La condición de «mío» es siempre la misma para `submissions` y las tablas de
respuestas: `student_id = public.current_student_id()`, nunca `authenticated`.
Para las que cuelgan de `submission_id` se resuelve con un `EXISTS` contra
`submissions`, que vuelve a pasar por esa misma condición: una sola definición,
en un solo lugar. `semester_weeks` no tiene `student_id` —no es una entrega,
es un calendario— así que su condición es la equivalente del lado del
periodo: `period_code = public.current_student_period()`, la misma idea con
una función hermana de `current_student_id()` (ver
`docs/DATABASE_SCHEMA.md#semanas-del-semestre`).

Las políticas del alumno son **permisivas y se suman** a las de `is_admin()`: el
profesor sigue viendo todo.

No hay política de `UPDATE` ni de `DELETE` para nadie. Una entrega no se edita
ni se borra: corregir una semana es volver a entregarla, y las dos quedan en el
expediente. Es también lo que hacía Google Forms, donde el alumno nunca pudo
volver sobre lo enviado.

> Hasta `0018` el alumno no leía su expediente —sus resultados de Holland,
> MBTI, DISC— y no era un pendiente olvidado: la información se abre una
> pantalla a la vez, cada una con su política. `0019` abre esa lectura porque
> el profesor pidió mostrar la tarjeta ADN Profesional (secciones I a V, sin
> las bitácoras ni el historial de respuestas) dentro del portal del alumno:
> `students_select_own`, `demographics_select_own` y la misma condición para
> `holland_results`, `mbti_results`, `disc_results`, `values_results` y
> `company_profiles`, todas acotadas por `EXISTS` contra `submissions` igual
> que `job_search_logs_select_own`.
>
> `0023` abre una lectura más, con el mismo criterio: el profesor pidió
> mostrar, tanto en el expediente que él abre como en el portal del alumno,
> una fila con el estado de sus entregas por formulario (`v_submission_status`,
> `docs/DATABASE_SCHEMA.md#fechas-de-entrega-y-estado-de-las-entregas`). Esa
> vista ya resolvía «solo lo mío» del lado del alumno gracias a `0019`, pero
> `resolve_form_deadline()` consulta `form_deadlines`, que hasta entonces solo
> leía `is_admin()` — sin esa lectura el alumno veía `due_at` siempre `NULL` y
> por lo tanto todo en `sin_fecha`. `form_deadlines_select_alumno` abre
> `form_deadlines` completa, no solo «lo mío», porque la tabla no tiene datos
> personales de ningún alumno: son reglas de fecha por
> formulario/idioma/frecuencia/periodo, iguales para todos.
>
> `0025` corrige un permiso que se quedó fuera de `0023` por descuido:
> `v_submission_status` también hace `cross join` contra `forms` (el catálogo
> de los 15 formularios), que tiene RLS admin-only desde `0006` — agregada en
> el mismo bloque que `students`/`submissions`, aunque `forms` no tiene ni un
> dato personal. Sin `forms_select_alumno`, ese `cross join` le devolvía
> **cero filas** al alumno (no una fila por formulario en `sin_fecha`: ninguna
> fila), así que su fila de "Estado de Entregas" salía completamente vacía
> aunque `form_deadlines` y sus propias `submissions` ya fueran legibles. Se
> detectó comparando la respuesta real de la API para el alumno contra la del
> SQL Editor como admin.

## Cómo se crean las cuentas de los alumnos

El alumno **no se registra**: la cuenta se la crea el sistema, sola.

- **Usuario:** su correo institucional.
- **Contraseña:** su matrícula.
- **Quiénes:** los alumnos que contestaron el formulario **1.0 Datos
  Demográficos**, porque es de ahí de donde sale la matrícula. Un alumno sin 1.0
  no tiene contraseña posible y la función lo reporta como omitido.

### También las puede dar de alta el profesor, sin 1.0

Desde `0031`, la pantalla **Alumnos Registrados** (a mano o con un Excel) llama
a `admin_register_students()`, que guarda correo, matrícula, periodo,
frecuencia e idioma y ejecuta `create_student_accounts()`. Mismo esquema:
usuario = correo, contraseña inicial = matrícula. Si el alumno después
contesta el 1.0, su matrícula del 1.0 manda y la contraseña de una cuenta ya
creada no se toca.

### Se crean solas, en la sincronización horaria

Desde `0021_sync_creates_student_accounts.sql`, `import_sheet_rows()` —la
misma función que trae las 15 hojas cada hora (ver
[docs/SHEETS_SYNC.md](SHEETS_SYNC.md))— llama a `create_student_accounts()`
justo después de escribir `demographics` de `form1_0`. Un alumno que acaba de
contestar el 1.0 tiene cuenta en la siguiente corrida del disparador horario,
sin que nadie tenga que acordarse de nada.

Se llama en **cada** corrida, haya o no alumnos nuevos ese día: la función ya
era idempotente (ver abajo), así que una corrida sin novedades solo reporta
`'ya existía'` u `'omitido'` para cada alumno y no cambia nada. El resumen de
cada corrida (`sheet_sync_runs.detail`) incluye `cuentas_creadas` con el
conteo de altas nuevas de esa hora.

### Correrla a mano sigue funcionando

En el **SQL Editor de Supabase**:

```sql
select * from public.create_student_accounts();
```

Devuelve una fila por alumno: `creado`, `ya existía: perfil enlazado` u
`omitido: sin matrícula en el 1.0`. Es **idempotente**: volver a correrla da de
alta a los alumnos nuevos y no le cambia la contraseña a nadie. Sigue siendo
la única forma de dar de alta a alguien fuera del horario de la
sincronización, o de confirmar de un vistazo qué pasó con un alumno en
particular.

`profiles.student_id` es lo que une la cuenta con el alumno. Se enlaza por
correo una sola vez, al crear la cuenta; de ahí en adelante manda el id, para que
corregirle el correo a alguien no lo desconecte de sus propias entregas.

### Lo que hay que saber de este esquema de contraseñas

La matrícula **no es un secreto**: aparece en las listas del grupo y en el panel
del profesor. Cualquiera que conozca la matrícula de un compañero y su correo
institucional puede entrar a su cuenta.

Hoy eso no expone nada —el rol `alumno` no lee ninguna tabla—, pero deja de ser
aceptable **el día que la vista del alumno muestre sus datos**, que ya pasó
(`0019`, ADN Profesional). `ProfilePage` (`/alumno/perfil`) le da al alumno
la opción de cambiar su contraseña desde el portal, para que dejar de depender
de la matrícula no dependa de un admin. Sigue pendiente, porque nadie la pidió
todavía, obligar el cambio en el primer inicio de sesión o mandar un enlace
mágico en su lugar.

`ProfilePage` pide la contraseña actual antes de dejar poner una nueva:
`updateUser()` por sí solo cambia la contraseña de cualquier sesión ya
abierta sin volver a pedirla, y la pantalla existe justo para que entrar con
la matrícula deje de bastar. La verificación es un `signInWithPassword()`
extra contra la contraseña actual — la misma llamada que usa el login — y
solo si esa llamada funciona se manda el `updateUser()` con la nueva.

Nota práctica: `ProfilePage` valida en el cliente un mínimo de **8 caracteres**
antes de llamar a `updateUser()`. Una matrícula de 6 dígitos funciona para
entrar, porque el alta se hace en la base y la longitud mínima solo la aplica
la API al *cambiar* la contraseña, no al iniciar sesión.

> ⚠️ **Pendiente en el dashboard:** Authentication → Providers todavía tiene
> configurados **10 caracteres** como mínimo (ver «Configuración del
> dashboard» abajo). Mientras no se baje a 8 ahí, una contraseña de 8 o 9
> caracteres pasa la validación de `ProfilePage` pero la API de Supabase la
> rechaza igual. `translateAuthError()` no tiene el número fijo — lo saca del
> mensaje de error de Supabase — así que el aviso que ve el alumno siempre
> dice la longitud real que exige el dashboard, aunque no coincida todavía
> con el mínimo del formulario.

### Por qué el alta se hace en SQL y no con la API

Crear usuarios por la API de Supabase necesita la llave `service_role`, que este
proyecto no tiene y no debe tener en el panel: viajaría en el bundle del
navegador. El SQL Editor ya es un contexto administrativo, así que
`create_student_accounts()` escribe directo en `auth.users` y
`auth.identities`, con el mismo hash bcrypt que usa Supabase Auth. La
contraseña en claro no se guarda en ninguna columna, y la función no es
ejecutable por nadie con sesión en el navegador.

El Apps Script **sí** tiene la llave `service_role` —la necesita para mandar
las 15 hojas (ver [SHEETS_SYNC.md](SHEETS_SYNC.md))— pero eso no es lo que le
da permiso a `import_sheet_rows()` de llamar a `create_student_accounts()`:
`import_sheet_rows()` es `SECURITY DEFINER`, así que dentro de su cuerpo corre
con los permisos de quien la creó, no con los de `service_role`. Es el mismo
contexto administrativo del SQL Editor visto desde otra puerta.

## Las contraseñas

Las administra **Supabase Auth**: viven hasheadas en `auth.users`, un esquema que
este proyecto no toca. La aplicación nunca ve, guarda ni transmite una contraseña
en claro; solo llama a `signInWithPassword()` y recibe una sesión.

Tampoco se guarda nada de contraseñas en `profiles`.

### Permisos (`0038`)

Lo que ve cada rol ya no está fijo en el código. En **Configuración → Usuarios
y permisos → Permisos por rol** el admin decide, por pantalla, el acceso de
Coordinador, Maestro y Alumno: Sin acceso, Solo lectura o Puede editar. En
**Editar** de una persona hay excepciones que reemplazan lo de su rol (por
ejemplo, quitarle «Personalidad» a un maestro concreto). El administrador
siempre tiene acceso total, y «Usuarios y permisos» y «Procesar datos» no se
delegan.

Se aplica en la base, no solo en la interfaz: sin lectura de un formulario,
RLS no devuelve sus respuestas; sin «Puede editar» en una bitácora, el alumno
no puede entregarla; con «Puede editar», un maestro o coordinador escribe
(registrar alumnos, grupos, corregir semanas) **solo dentro de sus grupos**.
Fechas de entrega es la excepción: sus reglas son globales. La interfaz usa
los permisos del rol elegido en «Ver como»; la base, la unión de los roles de
la persona.

### Cuentas de maestros, coordinadores y administradores (`0037`)

Las crea un administrador en **Configuración → Usuarios**: nombre, apellido,
correo, contraseña inicial y roles. `admin_create_staff_account()` escribe en
`auth.users` igual que el alta de alumnos (bcrypt, sin la llave
`service_role`). Ahí mismo se cambian roles, se asignan maestros a un
coordinador, se pone una contraseña nueva a quien olvidó la suya y se
desactiva una cuenta (no se borra). Ninguna de esas tablas acepta escrituras
directas desde el navegador: todo pasa por funciones que exigen `is_admin()`.

### Mi perfil (`0034`)

Quien usa el panel tiene **Mi perfil** (`/mi-perfil`, desde el engrane de la
barra): edita su **nombre** y **apellido**, ve su **correo** y su **rol** (de
solo lectura) y cambia su contraseña. El cambio de contraseña es el mismo
componente que el del alumno (`PasswordChangeForm`): pide la contraseña actual
antes de aceptar la nueva.

Desde el navegador, de `profiles` solo se pueden escribir `first_name` y
`last_name` (permiso por columna). El correo es el usuario de la cuenta y el
rol lo asigna un administrador; ninguno de los dos se cambia desde esta
pantalla.

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
- Longitud mínima de contraseña: **10 caracteres** hoy — pendiente bajarla a
  **8** a mano en el dashboard, para que coincida con lo que valida
  `ProfilePage` (ver «Lo que hay que saber de este esquema de contraseñas»
  arriba).
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
| `src/pages/alumno/ProfilePage.tsx` | `/alumno/perfil`: cambio de contraseña, verificando la actual con `signInWithPassword()` antes de `updateUser()` |
| `src/components/PasswordInput.tsx` | campo de contraseña con el ojo para mostrarla u ocultarla, compartido por el login y el perfil |

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
