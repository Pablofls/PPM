# PPM — Panel de Prácticas Profesionales

Panel web para que el profesor visualice las entregas que sus alumnos hacen en
formularios de Google. Reemplaza la implementación actual en Google Apps Script.

## Estado del proyecto

**Iteración 1 (actual): pantallas + esquema, sin base de datos.**

- La app corre en local con `npm run dev` y **no requiere base de datos ni `.env`**.
- Las pantallas se renderizan en estado vacío. **No se agrega demo data.**
- El SQL de `supabase/migrations/` está escrito pero **NO se ha ejecutado**.
- El objetivo es presentarle las pantallas al profesor para recibir su opinión.

**Iteración 2 (después de la autorización del profesor):** ejecutar las migraciones
en Supabase, migrar los datos del Google Sheets y desplegar en Vercel.
Ver [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Reglas del proyecto

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

### 7. Alcance de las pantallas

Esta iteración construye **solo Módulo 1 y Módulo 2**. Los Apéndices A/B, las
bitácoras semanales, Grupos y Administrador tienen su esquema listo pero **no** su
pantalla. No construir pantallas fuera de alcance sin pedirlo.

## Stack

- **Vite** + **React 19** + **TypeScript**
- **Tailwind CSS v4** (plugin de Vite, sin `tailwind.config.js`)
- **React Router** para navegación
- Tabla de datos propia (`src/components/DataTable.tsx`), sin librería externa
- **Supabase** (Postgres) — futuro, ver iteración 2
- **Vercel** — futuro

> No se usa TanStack Table: su versión 9 tiene una API reescrita y la tabla que
> necesita este panel —encabezados fijos, scroll horizontal y estado vacío— son
> unas 60 líneas. Si más adelante hacen falta ordenamiento o paginación, el tipo
> `Column<T>` está modelado sobre el de TanStack para facilitar la migración.

## Estructura

```
docs/                     Documentación (esquema, mapeo, catálogos, despliegue)
supabase/migrations/      SQL numerado, aún sin ejecutar
src/
  data/                   Capa de datos: tipos + repositorio (hoy vacío)
  components/             Componentes compartidos (DataTable, FilterBar, …)
  layouts/                AppShell con el sidebar
  pages/modulo1/          Pantallas 1.0 – 1.5
  pages/modulo2/          Pantallas 2.1, 2.2, 2.4, 2.5, 2.7
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
| [docs/UI_SCREENS.md](docs/UI_SCREENS.md) | Inventario de pantallas y sus columnas |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Pasos para Supabase + Vercel |
