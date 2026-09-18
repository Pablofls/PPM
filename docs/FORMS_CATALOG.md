# Catálogo de formularios

Los 15 formularios de Google que alimentan el panel, tal como aparecen en el
Google Sheets de origen. El `code` es el mismo que la hoja y el que se guarda en
`forms.code` y `submissions.form_code`.

## Resumen

| Code | Pantalla | Módulo | Hoja origen | Respuestas por alumno | Tabla de respuestas | En el esquema actual |
|---|---|---|---|---|---|---|
| `form1_0` | 1.0 Datos Demográficos | 1 | `form1_0` | 1 | `demographics` | ✅ |
| `form1_1` | 1.1 Intereses Profesionales | 1 | `form1_1` | 1 | `holland_results` | ✅ |
| `form1_2` | 1.2 Personalidad | 1 | `form1_2` | 1 | `mbti_results` | ✅ |
| `form1_3` | 1.3 Estilos de Comportamiento | 1 | `form1_3` | 1 | `disc_results` | ✅ |
| `form1_4` | 1.4 Formulario de Habilidades | 1 | `form1_4` | 1 | `skills_assessment` | ✅ |
| `form1_5` | 1.5 Valores | 1 | `form1_5` | 1 | `values_results` | ✅ |
| `form2_1` | 2.1 Análisis FODA | 2 | `form2_1` | 1 | `reflections` | ✅ |
| `form2_2` | 2.2 Curriculum Vitae | 2 | `form2_2` | 1 | `reflections` | ✅ |
| `form2_4` | 2.4 Cover Letter | 2 | `form2_4` | 1 | `reflections` | ✅ |
| `form2_5` | 2.5 Elevator Pitch | 2 | `form2_5` | 1 | `reflections` | ✅ |
| `form2_7` | 2.7 Indeed | 2 | `form2_7` | 1 | `indeed_research` | ✅ |
| `formA_1` | A.1 Carta Formal de Aceptación | A | `formA_1` | 1 | `internship_applications` | ✅ tabla, sin pantalla |
| `formB_1` | B.1 Formulario de Inicio | B | `formB_1` | 1 | `company_profiles` | ✅ tabla, sin pantalla |
| `form_busqueda` | Bitácora de búsqueda de empleo | W | `form_busqueda` | **N (semanal)** | `job_search_logs` | ⬜ fuera de alcance |
| `form_practicas` | Bitácora de prácticas | W | `form_practicas` | **N (semanal)** | `internship_logs` | ⬜ fuera de alcance |

> **Alcance del esquema actual:** solo los 11 formularios marcados con ✅, es
> decir `form1_0` a `form2_7`. Los apéndices, las bitácoras y las hojas
> `alumnos` y `fechas_entrega` no tienen tabla todavía.

> No existen `form2_3` ni `form2_6` en el Sheets de origen. La numeración del
> Módulo 2 salta de 2.2 a 2.4 y de 2.5 a 2.7, y el panel respeta esa numeración
> porque es la que el profesor y los alumnos ya conocen.

## Módulos

| Code | Nombre (ES) | Nombre (EN) | Formularios | En el esquema |
|---|---|---|---|---|
| `1` | Conócete | Know Yourself | `form1_0` … `form1_5` | ✅ |
| `2` | Actúa | Take Action | `form2_1`, `form2_2`, `form2_4`, `form2_5`, `form2_7` | ✅ |
| `A` | Apéndice A: Cartas Requeridas | Appendix A | `formA_1` | ✅ |
| `B` | Apéndice B: Reportes | Appendix B | `formB_1` | ✅ |
| `W` | Bitácoras semanales | Weekly Logs | `form_busqueda`, `form_practicas` | ⬜ |

`forms.module_code` admite `'1'`, `'2'`, `'A'` y `'B'`. El `CHECK` se amplió en
`0009_appendices.sql`; al incorporar las bitácoras habrá que ampliarlo otra vez
con `'W'`.

## Cardinalidad observada en los datos de origen

Volumen del export analizado, útil para dimensionar las pantallas. Son conteos
agregados; ningún dato de alumno se versiona en este repositorio.

| Hoja | Filas | Alumnos distintos | Máx. respuestas por alumno | Correos sin alumno registrado |
|---|---|---|---|---|
| `alumnos` | 42 | 42 | 1 | — |
| `fechas_entrega` | 4 | — | — | — |
| `form1_0` | 42 | 42 | 1 | 0 |
| `form1_1` | 44 | 44 | 1 | 4 |
| `form1_2` | 44 | 44 | 1 | 4 |
| `form1_3` | 43 | 43 | 1 | 4 |
| `form1_4` | 44 | 44 | 1 | 4 |
| `form1_5` | 42 | 42 | 1 | 3 |
| `form2_1` | 15 | 15 | 1 | 3 |
| `form2_2` | 15 | 15 | 1 | 2 |
| `form2_4` | 18 | 18 | 1 | 4 |
| `form2_5` | 19 | 19 | 1 | 3 |
| `form2_7` | 19 | 19 | 1 | 4 |
| `formA_1` | 13 | 13 | 1 | 2 |
| `formB_1` | 25 | 25 | 1 | 0 |
| `form_busqueda` | 62 | 32 | **5** | 2 |
| `form_practicas` | 95 | 33 | **10** | 3 |

**Dos observaciones que definieron el esquema:**

1. Las bitácoras (`form_busqueda`, `form_practicas`) tienen hasta 10 respuestas por
   alumno. Por eso `submissions` admite N filas por alumno y formulario. Aunque hoy
   los demás formularios sean 1:1, un reenvío no debe sobrescribir la respuesta
   anterior.
2. Cada hoja tiene entre 2 y 4 correos que no existen en la hoja `alumnos`, que
   está desactualizada. Por eso el esquema actual **deriva la lista de alumnos de
   los propios formularios**: 46 correos únicos, contra los 42 de esa hoja.

## Fechas de entrega

La hoja `fechas_entrega` solo tiene 4 filas configuradas (`form2_1`, `form2_2`,
`form2_4`, `form2_5`, todas del periodo `PR-26`), con `idioma` y `frecuencia`
vacíos. En el esquema esas columnas vacías se traducen a `NULL`, que significa
**"aplica a todos"**.

La resolución de la fecha aplicable a un alumno va de lo más específico a lo más
general:

1. fecha con el `session_day` del alumno,
2. fecha con el `language` del alumno,
3. fecha general del formulario y periodo,
4. si no hay ninguna → estado `sin_fecha`.

Los formularios sin fecha configurada no se marcan como pendientes ni tarde: se
muestran como `sin_fecha` para que el profesor sepa que falta configurarla.
