# Despliegue — Supabase + Vercel

> **No ejecutar nada de este documento todavía.**
> Es el plan para la iteración 2, después de que el profesor autorice el proyecto.
> Hoy la app corre solo en local y sin base de datos.

## Estado actual

| Componente | Estado |
|---|---|
| Pantallas React | ✅ Listas, corren en local con `npm run dev` |
| Migraciones SQL | ✅ Escritas en `supabase/migrations/`, **sin ejecutar** |
| Proyecto de Supabase | ⬜ No creado |
| Importación desde el Sheets | ⬜ No escrita — la especificación es [DATA_MAPPING.md](DATA_MAPPING.md) |
| Proyecto de Vercel | ⬜ No creado |

## Paso 1 — Proyecto de Supabase

1. Crear el proyecto en la región `us-east-1` (la más cercana a Monterrey con
   plan gratuito).
2. Guardar la contraseña de la base de datos en un gestor de contraseñas.
   **Nunca en el repositorio.**
3. Aplicar las migraciones **en orden numérico**:

```bash
supabase link --project-ref <project-ref>
supabase db push
```

O manualmente desde el SQL Editor, en este orden:
`0001_enums.sql` → `0002_core.sql` → `0003_module1.sql` → `0004_module2.sql` →
`0005_appendices.sql` → `0006_views.sql` → `0007_seed_catalogs.sql`.

4. Verificar que RLS quedó habilitado en todas las tablas
   (Database → Tables → columna *RLS enabled*).

## Paso 2 — Variables de entorno

Crear `.env.local` a partir de `.env.example`. **`.env.local` está en `.gitignore`
y nunca se commitea.**

```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

La `service_role` key **no** se usa en el frontend: solo la necesita el script de
importación, que corre localmente y toma la llave de una variable de entorno de la
terminal, nunca de un archivo versionado.

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

1. Importar el repositorio de GitHub.
2. Framework preset: **Vite**. Build: `npm run build`. Output: `dist`.
3. Cargar `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` en Environment Variables.
4. Verificar el despliegue de preview antes de promover a producción.

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
