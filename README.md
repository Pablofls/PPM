# PPM — Panel de Prácticas Profesionales

Panel web para que el profesor visualice las entregas que sus alumnos hacen en
formularios de Google. Reemplaza la implementación actual en Google Apps Script.

## Estado

**Iteración 2: autenticación y primer esquema de base de datos.**

Supabase está configurado y la app desplegada en Vercel. El esquema SQL cubre la
autenticación y los 11 formularios del Módulo 1 y 2; está escrito y verificado
contra PostgreSQL, pero **todavía no se ejecuta** en Supabase.

Las pantallas siguen mostrándose en estado vacío, sin demo data.

## Cómo correrlo

```bash
npm install
npm run dev
```

Abre <http://localhost:5173>.

## Documentación

| Documento | Contenido |
|---|---|
| [CLAUDE.md](CLAUDE.md) | Reglas del proyecto |
| [docs/DATABASE_SCHEMA.md](docs/DATABASE_SCHEMA.md) | Esquema y diagrama ER — fuente única de verdad |
| [docs/DATA_MAPPING.md](docs/DATA_MAPPING.md) | Mapeo Google Sheets → PostgreSQL y limpieza de datos |
| [docs/FORMS_CATALOG.md](docs/FORMS_CATALOG.md) | Catálogo de los 15 formularios |
| [docs/UI_SCREENS.md](docs/UI_SCREENS.md) | Inventario de pantallas |
| [docs/AUTH.md](docs/AUTH.md) | Roles, permisos y cómo se crea el primer admin |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Pasos para Supabase + Vercel |

## Aviso sobre datos

Este repositorio **no contiene datos de alumnos**. Las exportaciones del Google
Sheets (`.xlsx`, `.csv`) están en `.gitignore` porque incluyen nombres,
matrículas, correos y fechas de nacimiento.
