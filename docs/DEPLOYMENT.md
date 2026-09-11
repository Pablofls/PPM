# Despliegue — Supabase + Vercel

> Iteración 2, en curso. El profesor autorizó el proyecto el 10 de septiembre
> de 2026.

## Cómo se aplican los cambios de base de datos

**Todos los cambios de base de datos se hacen desde el SQL Editor de Supabase,
en el navegador.** No se usa `supabase db push` ni ninguna otra forma de aplicar
migraciones desde la terminal.

Esto tiene una consecuencia que hay que compensar a mano: la base de datos puede
cambiar sin que el repositorio se entere. Para evitarlo, cada cambio son **tres
cosas en el mismo commit**:

1. El SQL, guardado en `supabase/migrations/` con el siguiente número de la serie.
2. `docs/DATABASE_SCHEMA.md` actualizado (regla 1 de CLAUDE.md).
3. En el mensaje del commit, decir si el SQL **ya se ejecutó** en Supabase o no.

Los archivos de `supabase/migrations/` son el historial y la fuente de lo que se
pega en el SQL Editor. Nunca se editan después de haberse ejecutado: un cambio
posterior es un archivo nuevo.

## Estado actual

| Componente | Estado |
|---|---|
| Pantallas React | ✅ Listas, corren en local con `npm run dev` |
| SQL del esquema | ✅ Escrito en `supabase/migrations/`, **sin ejecutar** |
| Proyecto de Supabase | ✅ Creado — ref `sovinakodrmgxytgapry` |
| Variables de entorno (local) | ✅ `.env.local` con la llave pública |
| Proyecto de Vercel | ⬜ En proceso |
| Importación desde el Sheets | ⬜ No escrita — la especificación es [DATA_MAPPING.md](DATA_MAPPING.md) |

## Paso 1 — Proyecto de Supabase ✅

Creado el 11 de septiembre de 2026, región East US (North Virginia), plan Free.
La contraseña de la base de datos vive en el gestor de contraseñas de Pablo,
**nunca en el repositorio**.

Cuando se ejecute el esquema, será pegando en el SQL Editor en este orden:
`0001_enums.sql` → `0002_core.sql` → `0003_module1.sql` → `0004_module2.sql` →
`0005_appendices.sql` → `0006_views.sql` → `0007_seed_catalogs.sql`.

Después, verificar que RLS quedó habilitado en todas las tablas
(Database → Tables → columna *RLS enabled*).

## Paso 2 — Variables de entorno

Crear `.env.local` a partir de `.env.example`. **`.env.local` está en `.gitignore`
y nunca se commitea.**

```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

Ambos valores salen de **Project Settings → API Keys** en el dashboard.

- `VITE_SUPABASE_URL`: la *Project URL*.
- `VITE_SUPABASE_ANON_KEY`: la llave **pública** (`anon` / `publishable`). Está
  diseñada para ir en el navegador y no es un secreto: lo que protege los datos
  son las políticas RLS, no ocultar esta llave.

La llave **secreta** (`service_role` / `secret`) **no** se usa en el frontend ni
se guarda en ningún archivo del repositorio. Solo la necesita el script de
importación, que la toma de una variable de entorno de la terminal.

## Paso 3 — Conectar la capa de datos

`src/data/repository.ts` hoy devuelve listas vacías. Cambiar únicamente ese archivo:

1. `npm install @supabase/supabase-js`
2. Crear el cliente en `src/data/supabaseClient.ts`
3. Sustituir cada método del repositorio por su consulta

**Las pantallas no cambian.** Ese es el propósito de que la capa de datos esté
aislada: consumen la misma interfaz `PanelRepository`.

## Paso 4 — Importar los datos del Google Sheets

Script de un solo uso, siguiendo [DATA_MAPPING.md](DATA_MAPPING.md):

1. Exportar el Sheets a `.xlsx` **fuera del repositorio** (contiene datos personales).
2. Ejecutar el script con la `service_role` key desde la terminal.
3. Revisar `unmatched_submissions` — se esperan entre 2 y 4 filas por hoja.
4. Revisar `disc_results` con `needs_review = true`.

El script es idempotente gracias a `submissions.source_row_key`: volver a correrlo
no duplica respuestas.

## Paso 5 — Vercel

1. Importar el repositorio `Pablofls/PPM` desde GitHub.
2. Framework preset: **Vite**. Build: `npm run build`. Output: `dist`.
   Vercel lo detecta solo; no hay que escribirlo.
3. Cargar `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` en Environment Variables,
   marcadas para Production, Preview y Development.
4. Verificar el despliegue abriendo una ruta profunda, no solo la raíz
   (por ejemplo `/modulo1/personalidad`), para confirmar el rewrite de abajo.

### Por qué existe `vercel.json`

El panel es una SPA: React Router maneja las rutas en el navegador, y en el
servidor **solo existe `index.html`**. Sin configuración, al abrir o recargar
`/modulo1/personalidad` Vercel buscaría un archivo en esa ruta, no lo encontraría
y devolvería 404.

```json
{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
```

Esto le dice a Vercel que sirva `index.html` para cualquier ruta, y que React
Router decida qué pantalla mostrar. Los archivos que sí existen en `dist/`
(el JS, el CSS, el favicon) se sirven antes de aplicar el rewrite, así que no se
rompen.

Importa porque el profesor va a guardar rutas como marcador y a compartir vistas
filtradas: todas esas URLs entran directo a una ruta profunda.

### El sitio queda público

Un proyecto de Vercel es accesible para cualquiera que tenga la URL. Hoy no hay
riesgo porque no hay datos, pero **la autenticación del paso 6 no es opcional
antes de cargar datos de alumnos**.

## Paso 6 — Acceso del profesor

El panel contiene datos personales de alumnos, así que **no puede quedar público**.

1. Habilitar Supabase Auth con Google, restringido al dominio `@udem.edu`.
2. Agregar una pantalla de login y proteger las rutas.
3. Confirmar que las políticas RLS solo permiten lectura al rol `authenticated`.

> Este paso no es opcional. Sin autenticación, cualquiera con la URL de Vercel vería
> nombres, matrículas, fechas de nacimiento y correos personales de los alumnos.

## Pendientes antes de producción

- [ ] Autenticación y protección de rutas
- [ ] Confirmar con el profesor el supuesto `practico` → `ISTJ` en el mapeo MBTI
- [ ] Configurar las fechas de entrega faltantes (hoy solo 4 de 15 formularios)
- [ ] Corregir en el formulario de Google la traducción de `SC` → «Carolina del Sur»
- [ ] Decidir si los alumnos con correo no registrado se dan de alta o se ignoran
- [ ] Definir si la importación desde el Sheets será manual o automática
