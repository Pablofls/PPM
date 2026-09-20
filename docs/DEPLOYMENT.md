# Despliegue — Supabase + Vercel

> Iteración 2, en curso. El profesor autorizó el proyecto el 10 de septiembre
> de 2026.

## Al pegar SQL en el editor: siempre «Run without RLS»

El SQL Editor avisa *«Potential issue detected»* y ofrece dos botones. **Usar
siempre `Run without RLS`.**

`Run and enable RLS` no ejecuta el SQL tal cual: Supabase lo analiza, deduce qué
tablas se crearon y les añade `alter table … enable row level security`. Con
scripts que llevan texto libre de alumnos, ese analizador se confunde y llega a
generar sentencias contra tablas inexistentes, con errores tan desconcertantes
como `relation "modern" does not exist` — donde `modern` era una palabra dentro
de la respuesta de un alumno.

No hace falta que Supabase active RLS por su cuenta: todas las migraciones de
este proyecto lo activan explícitamente, junto con su política.

## Cómo se aplican los cambios de base de datos

**Todos los cambios de base de datos se hacen desde el SQL Editor de Supabase,
en el navegador.** No se usa `supabase db push` ni ninguna otra forma de aplicar
migraciones desde la terminal.

Esto tiene una consecuencia que hay que compensar a mano: la base de datos puede
cambiar sin que el repositorio se entere. Para evitarlo, cada cambio son **tres
cosas en el mismo commit**:

1. El SQL, guardado en `supabase/migrations/` con el siguiente número de la serie.
2. `docs/DATABASE_SCHEMA.md` actualizado (regla «El esquema de la BD vive en un MD» de CLAUDE.md).
3. En el mensaje del commit, decir si el SQL **ya se ejecutó** en Supabase o no.

Los archivos de `supabase/migrations/` son el historial y la fuente de lo que se
pega en el SQL Editor. Nunca se editan después de haberse ejecutado: un cambio
posterior es un archivo nuevo.

## Estado actual

| Componente | Estado |
|---|---|
| Pantallas React | ✅ Listas, corren en local con `npm run dev` |
| SQL del esquema | ✅ **Ejecutado** — 15 migraciones, hasta `0015_sheet_sync.sql` |
| Entregas del alumno (`0016`) | ⏳ **Pendiente de pegar** en el SQL Editor |
| Proyecto de Supabase | ✅ Creado — ref `sovinakodrmgxytgapry` |
| Variables de entorno (local) | ✅ `.env.local` con la llave pública |
| Proyecto de Vercel | ✅ https://ppd-zeta.vercel.app |
| Primer administrador | ✅ creado |
| Importación desde el Sheets | ✅ 46 alumnos y 580 entregas — generador en `scripts/generar_import.py` |

## Paso 1 — Proyecto de Supabase ✅

Creado el 11 de septiembre de 2026, región East US (North Virginia), plan Free.
La contraseña de la base de datos vive en el gestor de contraseñas de Pablo,
**nunca en el repositorio**.

Cuando se ejecute el esquema, será pegando en el SQL Editor en este orden:
`0001_auth.sql` → `0002_enums.sql` → `0003_core.sql` → `0004_module1.sql` →
`0005_module2.sql` → `0006_views_rls.sql` → `0007_seed_forms.sql`.

Después:

1. Verificar que RLS quedó habilitado en las 12 tablas
   (Database → Tables → columna *RLS enabled*).
2. Crear el primer administrador siguiendo [AUTH.md](AUTH.md).
3. Confirmar que un usuario con rol `pendiente` no puede leer
   `latest_submissions` ni `v_students_directory` — es lo único que no se pudo
   verificar en local, porque `security_invoker` requiere PostgreSQL 15.

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
3. Revisar el log del script: no debería haber filas sin correo.
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

1. Habilitar el proveedor **Email + contraseña** en Supabase Auth.
2. Agregar la pantalla de login y proteger las rutas.
3. Confirmar que las políticas exigen `is_admin()`, no solo `authenticated`.

Ver [AUTH.md](AUTH.md) para el modelo completo de roles y permisos.

> Este paso no es opcional. Sin autenticación, cualquiera con la URL de Vercel vería
> nombres, matrículas, fechas de nacimiento y correos personales de los alumnos.

## Pendientes antes de producción

- [ ] Pegar `0016_student_weekly_logs.sql` en el SQL Editor. Sin ella, el portal
      del alumno muestra las tareas pero **ninguna entrega se guarda**: no hay
      políticas ni funciones que se lo permitan
- [ ] Correr `select * from public.create_student_accounts();` para dar de alta
      a los alumnos. Sin cuentas, nadie puede entrar a entregar
- [ ] Instalar el Apps Script en el Sheets (ver [SHEETS_SYNC.md](SHEETS_SYNC.md))
- [ ] Decidir si se cierran los Google Forms de las dos bitácoras ahora que se
      entregan en el panel. Mientras sigan abiertos, un alumno puede entregar la
      misma semana por los dos lados y quedan dos entregas
- [ ] Autenticación y protección de rutas
- [ ] Confirmar con el profesor el supuesto `practico` → `ISTJ` en el mapeo MBTI
- [ ] Configurar las fechas de entrega faltantes (hoy solo 4 de 15 formularios)
- [ ] Corregir en el formulario de Google la traducción de `SC` → «Carolina del Sur»
- [ ] Decidir si los alumnos con correo no registrado se dan de alta o se ignoran
- [ ] Definir si la importación desde el Sheets será manual o automática
