# PPM — Panel de Prácticas Profesionales

Panel web para que el profesor visualice las entregas que sus alumnos hacen en
formularios de Google. Reemplaza la implementación actual en Google Apps Script.

## Estado

**Iteración 1: pantallas del Módulo 1 y Módulo 2, sin base de datos.**

La aplicación corre en local y no requiere Supabase, Vercel ni archivo `.env`.
Las pantallas se muestran con sus columnas y en estado vacío: el objetivo es que
el profesor valide la estructura antes de migrar los datos.

El esquema SQL está escrito y verificado contra PostgreSQL, pero **no se ha
ejecutado** en ningún servidor.

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
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Pasos para Supabase + Vercel (iteración 2) |

## Aviso sobre datos

Este repositorio **no contiene datos de alumnos**. Las exportaciones del Google
Sheets (`.xlsx`, `.csv`) están en `.gitignore` porque incluyen nombres,
matrículas, correos y fechas de nacimiento.
