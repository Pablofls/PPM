# PPM — Panel de Prácticas Profesionales

Panel web para que el profesor visualice las entregas que sus alumnos hacen en
formularios de Google. Reemplaza la implementación actual en Google Apps Script.

## Estado del proyecto

**Iteración 2 (actual): autenticación y primer esquema de base de datos.**
El profesor autorizó el proyecto el 10 de septiembre de 2026.

- Supabase configurado (ref `sovinakodrmgxytgapry`) y Vercel desplegado.
- Las migraciones `0001`–`0014` **ya se ejecutaron**. Un archivo ejecutado no se
  vuelve a editar: el siguiente cambio es `0015_…`.
- Alcance del esquema: **autenticación + los 11 formularios de Módulo 1 y 2 +
  los dos apéndices + las dos bitácoras semanales**. Las hojas `alumnos` y
  `fechas_entrega` quedan para después.
- Login con correo y contraseña **funcionando**; el panel completo está detrás
  de `ProtectedRoute` y exige rol `admin`.
- Las 11 pantallas **ya consultan la base** a través de las vistas `v_panel_*`.
- Los datos del Sheets **están importados**: 46 alumnos y 580 entregas, las 15
  hojas de formulario. El SQL se genera con
  `scripts/generar_import.py` y **nunca se commitea**: `import_sql/` está en
  `.gitignore` porque lleva datos personales.
- Los apéndices ya tienen tabla y pantalla. Su estructura es distinta a la del
  Módulo 1 y 2 (buscador por empresa, paginación, sin filtros académicos), como
  en la plataforma anterior.
- El **rol `alumno`** existe: las cuentas se crean desde `demographics` (usuario =
  correo institucional, contraseña = matrícula) con
  `create_student_accounts()`, y el alumno entra a `/alumno`, hoy solo una
  pantalla de bienvenida. **No lee ninguna tabla todavía**; ver `docs/AUTH.md`.
  Falta correr `create_student_accounts()` para dar de alta a los alumnos.
- Las **bitácoras semanales** (`form_busqueda`, `form_practicas`) no son una
  pantalla del rail: se leen dentro del **expediente del alumno**, que reemplaza
  al panel lateral por formulario. Es como funcionaba la tarjeta *ADN
  Profesional* de la plataforma anterior.

Ver [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) para el estado detallado y los pasos.

**Iteración 1 (terminada):** pantallas del Módulo 1 y 2, esquema y documentación.

## Reglas del proyecto

> Las reglas se referencian **por nombre**, no por número: insertar una regla
> nueva renumera el resto y deja las referencias del código apuntando al lugar
> equivocado.

### 1. El esquema de la BD vive en un MD y se actualiza siempre

[docs/DATABASE_SCHEMA.md](docs/DATABASE_SCHEMA.md) es la **fuente única de verdad**
del modelo de datos, e incluye el diagrama entidad-relación.

> **Obligatorio:** cualquier cambio al esquema (nueva tabla, columna, enum, índice,
> vista o constraint) se refleja en `docs/DATABASE_SCHEMA.md` **en el mismo commit**
> que la migración SQL. Un cambio de esquema sin actualizar el MD es un cambio
> incompleto. Si el diagrama ER se ve afectado, también se actualiza.

### 2. Nunca datos sensibles en el repositorio

Prohibido commitear: correos reales de alumnos, nombres, matrículas, fechas de
nacimiento, teléfonos, RFC, sueldos, llaves de Supabase, tokens o el archivo
`.xlsx`/CSV exportado del Sheets.

- Los ejemplos en la documentación usan valores ficticios (`alumno.ejemplo@udem.edu`).
- `.env*` está en `.gitignore`. Solo se versiona `.env.example` con valores vacíos.

### 3. Sin demo data en las pantallas

Las pantallas se alimentan exclusivamente de la capa `src/data/`. Hoy esa capa
devuelve listas vacías; mañana consulta Supabase. **No** se hardcodean filas de
ejemplo en los componentes: el estado vacío es intencional y es lo que se le
enseña al profesor.

### 4. Nomenclatura

| Ámbito | Convención | Ejemplo |
|---|---|---|
| Tablas y columnas SQL | inglés, `snake_case` | `students.institutional_email` |
| Tipos y componentes React | inglés, `PascalCase` | `SubmissionTimeline` |
| Variables y funciones | inglés, `camelCase` | `getLatestSubmissions` |
| **Texto visible al usuario** | **español** | `"Datos Demográficos"` |
| Códigos de formulario | los del Sheets | `form1_0`, `form2_7` |

El mapeo entre los encabezados en español del Sheets y las columnas en inglés está
en [docs/DATA_MAPPING.md](docs/DATA_MAPPING.md).

### 5. Modelo de entregas: historial completo

`submissions` es la tabla central y admite **varias filas por alumno por formulario**.
Las tablas de respuestas cuelgan de `submission_id`, nunca de `student_id`.

Esto es obligatorio porque varios formularios son **bitácoras semanales**: el alumno
responde cada semana y el profesor necesita ver todas las respuestas, no solo la
última. Las pantallas de tabla usan la vista `latest_submissions` para mostrar una
fila por alumno; el perfil del alumno muestra el historial completo.

> Al agregar un formulario nuevo, nunca poner un `UNIQUE (student_id, form_code)`.

### 6. Habilidades (formulario 1.4): columnas anchas

`skills_assessment` tiene una columna por habilidad, réplica de la hoja de cálculo.
Agregar o quitar una habilidad requiere una migración `ALTER TABLE` **y** actualizar
`docs/DATABASE_SCHEMA.md`. Decisión tomada a propósito por fidelidad con el Sheets.

### 7. Los cambios de base de datos se hacen en la interfaz de Supabase

**Todo cambio de base de datos se ejecuta pegando SQL en el SQL Editor de
Supabase, en el navegador.** No se usa `supabase db push` ni el CLI para aplicar
cambios, y no hay que sugerirlo.

El riesgo de este flujo es que la base de datos cambie sin que el repositorio se
entere. Por eso cada cambio son **tres cosas en el mismo commit**:

1. El SQL, en `supabase/migrations/`, con el siguiente número de la serie.
2. `docs/DATABASE_SCHEMA.md` actualizado (regla «El esquema de la BD vive en un MD»).
3. En el mensaje del commit, si ese SQL **ya se ejecutó** en Supabase o todavía no.

Los archivos de `supabase/migrations/` son el historial y la fuente de lo que se
pega en el editor. **Nunca se edita un archivo ya ejecutado**: un cambio posterior
es un archivo nuevo.

### 8. Toda pantalla nace protegida y admin-only

El panel muestra datos personales de alumnos. **Estar autenticado no da acceso a
nada**: las políticas exigen `is_admin()`, no `authenticated`, y un usuario recién
registrado tiene rol `pendiente` y no ve ni una fila.

Al agregar una tabla o una pantalla:

- La tabla lleva `alter table ... enable row level security` y una política
  `using (public.is_admin())`. Una tabla sin política es una tabla que nadie lee,
  lo cual es el lado seguro del error.
- La ruta va dentro de `ProtectedRoute`. Nunca colgarla fuera del `AppShell`.
- Las vistas llevan `security_invoker = on`, si no se saltan RLS.

Ver [docs/AUTH.md](docs/AUTH.md). Cualquier pantalla para un rol distinto de
`admin` se diseña y se pide explícitamente; no se asume.

La vista del alumno sigue la misma regla desde el otro lado: su guardia es
`StudentRoute` y su condición de lectura, cuando tenga datos que leer, siempre
será `student_id = public.current_student_id()`. Nunca `authenticated`.

### 9. Alcance de las pantallas

Ya están construidos **Módulo 1, Módulo 2 y los Apéndices A/B**, y las bitácoras
semanales viven dentro del expediente del alumno.

**Fuera de alcance mientras no se pida:** Grupos, Estado de Entregas, Alumnos
Registrados, Panel de Administrador y la hoja `fechas_entrega`. Aparecen
deshabilitados en el rail a propósito: comunican el alcance completo sin
prometer que funcionan. No construirlos sin pedirlo.

## Stack

- **Vite** + **React 19** + **TypeScript**
- **Tailwind CSS v4** (plugin de Vite, sin `tailwind.config.js`)
- **React Router** para navegación
- Tabla de datos propia (`src/components/DataTable.tsx`), sin librería externa
- **Supabase** (Postgres) — proyecto `sovinakodrmgxytgapry`, esquema ejecutado
- **Vercel** — desplegado en https://ppd-zeta.vercel.app

> No hay dependencia del CLI de Supabase: los cambios de base de datos se hacen
> en la interfaz (regla «Los cambios de BD se hacen en la interfaz»).

> No se usa TanStack Table: su versión 9 tiene una API reescrita y la tabla que
> necesita este panel —encabezados fijos, scroll horizontal y estado vacío— son
> unas 60 líneas. Si más adelante hacen falta ordenamiento o paginación, el tipo
> `Column<T>` está modelado sobre el de TanStack para facilitar la migración.

## Estructura

```
docs/                     Documentación (esquema, mapeo, catálogos, despliegue)
scripts/                  Generador del SQL de importación
supabase/migrations/      SQL numerado; ver DATABASE_SCHEMA.md para qué se ejecutó
import_sql/               SQL de importación generado — NO se versiona
src/
  data/                   Capa de datos: tipos + repositorio contra Supabase
  components/             Componentes compartidos (DataTable, FilterBar, …)
  layouts/                AppShell con el sidebar
  pages/modulo1/          Pantallas 1.0 – 1.5
  pages/modulo2/          Pantallas 2.1, 2.2, 2.4, 2.5, 2.7
  pages/apendices/        Pantallas A.1 y B.1
  auth/                   Sesión, login y protección de rutas
  lib/                    Utilidades y catálogos de la UI
```

## Comandos

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # tsc -b && vite build
npm run lint
```

## Documentación

| Documento | Para qué sirve |
|---|---|
| [docs/DATABASE_SCHEMA.md](docs/DATABASE_SCHEMA.md) | Esquema y diagrama ER. Fuente de verdad |
| [docs/DATA_MAPPING.md](docs/DATA_MAPPING.md) | Mapeo Sheets → Postgres y reglas de limpieza |
| [docs/FORMS_CATALOG.md](docs/FORMS_CATALOG.md) | Catálogo de los 15 formularios |
| `scripts/generar_import.py` | Genera el SQL de importación desde el Sheets |
| [docs/UI_SCREENS.md](docs/UI_SCREENS.md) | Inventario de pantallas y sus columnas |
| [docs/AUTH.md](docs/AUTH.md) | Roles, permisos y cómo se crea el primer admin |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Pasos para Supabase + Vercel |
