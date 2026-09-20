# Sincronización con el Google Sheets

Cómo el panel se mantiene al día con el Sheets sin que nadie copie nada a mano.

Un **Apps Script** dentro del propio Sheets corre cada hora, lee las 15 hojas y
manda las filas a Supabase. La base las normaliza y las escribe en las tablas
que alimentan las pantallas.

```
Sheets ──(disparador horario)──> ingest_sheet_rows() ──> sheet_rows (staging)
                                                                │
                                                       import_sheet_rows()
                                                                │
                                          students · submissions · tablas de respuestas
```

| Pieza | Dónde vive |
|---|---|
| El que lee y manda | [`scripts/apps_script/Sincronizar.gs`](../scripts/apps_script/Sincronizar.gs) — se pega en el Apps Script del Sheets |
| El que normaliza y escribe | `supabase/migrations/0015_sheet_sync.sql` |
| Qué transformación se le aplica a cada columna | [DATA_MAPPING.md](DATA_MAPPING.md) |
| Las tablas y funciones | [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md#sincronización-con-el-sheets) |

## Las bitácoras tienen una segunda entrada

Desde `0016_student_weekly_logs.sql`, los dos reportes semanales
(`form_busqueda`, `form_practicas`) también se entregan **dentro del panel**, en
el portal del alumno. Las dos vías escriben en las mismas tablas y no se
estorban:

| Vía | `submissions.source_row_key` |
|---|---|
| Google Forms → esta sincronización | `form_code:correo:marcaTemporal` |
| Portal del alumno | `NULL` |

Todas las consultas de `sheet_sync_*` emparejan por `source_row_key`, así que
**una entrega hecha en el panel es invisible para la sincronización**: no se
duplica, no se pisa y no se borra. Y la política de RLS del alumno exige
`source_row_key is null`, de modo que tampoco puede inventar una llave y
bloquear una fila que el Sheets iba a importar.

Mientras los Google Forms sigan abiertos, un alumno podría entregar la misma
semana por los dos lados. Quedarían dos entregas, que es exactamente lo que
pasa hoy cuando alguien contesta dos veces el formulario: el profesor las ve
las dos. Cerrar los Google Forms de las bitácoras es una decisión suya, no del
panel.

---

## Por qué el Apps Script no normaliza nada

El script solo transporta: lee las celdas y las manda tal como están. Todas las
reglas de limpieza —`Femenine` → `femenino`, `Esperto` → `experto`, el estilo
DISC que el traductor del formulario convirtió en *Carolina del Sur*, las horas
que el Sheets guardó como fechas de 1900— viven en SQL.

La razón es que esas reglas son la parte difícil y tienen que estar en **un solo
lugar revisable**. En el Apps Script quedarían en Google, fuera del repositorio,
sin diff y sin forma de probarlas. En SQL se leen al lado del esquema y se
verifican contra un PostgreSQL local.

---

## Puesta en marcha

### 1. Ejecutar la migración — ✅ hecho el 2026-09-18

`supabase/migrations/0015_sheet_sync.sql`, pegada en el SQL Editor de Supabase
(regla «Los cambios de BD se hacen en la interfaz» de [CLAUDE.md](../CLAUDE.md)).

> Incluye un `UPDATE` que reconcilia las marcas temporales de las 580 entregas
> ya importadas. Ver *[Las seis horas](#las-seis-horas)* más abajo. Correrlo dos
> veces no hace daño: reconstruye la marca desde la `source_row_key`.

> **Los pasos 2 a 6 están hechos.** El script quedó instalado en el Sheets el
> 2026-09-20 y el disparador horario está corriendo; se comprueba en
> `sheet_sync_runs` y en el encabezado del panel.

### 2. Crear el proyecto de Apps Script

En el Sheets de datos procesados: **Extensiones → Apps Script**. Pegar el
contenido de `scripts/apps_script/Sincronizar.gs` como un archivo nuevo y
guardar.

> **Convive con el sistema anterior.** Ese proyecto ya tiene `main.gs` y los
> `pasarDatos_*.gs` de la implementación en Apps Script, y Apps Script comparte
> un solo espacio de nombres entre todos los archivos. Por eso todo aquí vive
> dentro del objeto `PPM` y las tres funciones de arriba llevan sufijo
> (`sincronizarPPM`, `instalarSincronizacionPPM`,
> `instalarSincronizacionFormularioPPM`): una función suelta llamada `leerHoja`
> o `celda` pisaría en silencio a la del sistema viejo —gana la última que
> carga— y rompería algo que hoy funciona, sin ningún error que lo delate.

### 3. Configurar las propiedades

**Configuración del proyecto → Propiedades del script**, y agregar tres:

| Propiedad | Valor |
|---|---|
| `SUPABASE_URL` | `https://sovinakodrmgxytgapry.supabase.co` |
| `SUPABASE_SERVICE_KEY` | la llave `service_role` (Supabase → Project Settings → API Keys) |
| `ZONA_SHEETS` | `America/Monterrey` |

Se agregan como **propiedades**, no en el código. `getProperty('SUPABASE_URL')`
recibe el *nombre* de la propiedad; si ahí aparece la URL o la llave, alguien
confundió el nombre con el valor y la llave quedó escrita en el archivo.

> **La llave `service_role` solo vive aquí.** Nunca en este repositorio ni en el
> `.env` del panel: salta RLS por completo, y el panel corre en el navegador del
> profesor, donde cualquiera puede leer lo que se le mande.

`ZONA_SHEETS` es técnicamente opcional —el script cae a
`getSpreadsheetTimeZone()`— pero **se pone de todos modos**, y el paso 4
explica por qué.

### 4. Confirmar la zona horaria ANTES de la primera corrida

Con la función `diagnosticoZonaPPM` seleccionada, **Ejecutar**, y leer el
**Registro de ejecución**. Imprime la zona que reportan las tres fuentes y,
abajo, cómo se formatearía la marca temporal de la primera fila de `form1_0`
con seis zonas candidatas.

**La correcta es la que reproduce la hora que se ve en la celda del Sheets.**
Si esa no es `America/Monterrey`, hay que poner esa otra en `ZONA_SHEETS`.

Este paso parece burocrático y no lo es. La zona horaria es lo que forma la
`source_row_key` (`form_code:correo:marcaTemporal`), que es como la base
reconoce una entrega que ya tiene. Con la zona equivocada **ninguna llave
coincide** y la sincronización deja de actualizar entregas para empezar a
crearlas: ya pasó una vez, con 581 entregas duplicadas, y por eso existen esta
función y esta propiedad. El error no avisa —la corrida termina «bien»— y se
descubre viendo el panel al doble.

### 5. Probar a mano

Con la función `sincronizarPPM` seleccionada, **Ejecutar**. La primera vez Google
pide autorización para leer la hoja y salir a internet. Al terminar, en
**Registro de ejecución** aparece cuántas filas llevaba cada hoja y cuántas eran
nuevas.

La primera corrida manda las 15 hojas completas. Como las 580 entregas ya están
importadas, lo esperado es que casi todas las filas se archiven sin cambiar nada:
lo que se escribe son las diferencias.

### 6. Instalar el disparador

Ejecutar **una vez** la función `instalarSincronizacionPPM()`. Queda corriendo
cada hora. Borra primero el que hubiera, para no acabar con seis copias.

Opcional: `instalarSincronizacionFormularioPPM()` agrega un disparador de envío de
formulario, y una entrega nueva aparece en el panel en segundos en vez de en una
hora. **Solo sirve si este Sheets es el que recibe las respuestas**; si los datos
se copian desde otro archivo, el horario es el que vale.

---

## Cómo saber si sigue viva

```sql
select started_at, finished_at, detail
from sheet_sync_runs
order by started_at desc
limit 10;
```

| Qué se ve | Qué significa |
|---|---|
| `finished_at` con valor y `detail` con ceros | Todo bien: no hubo nada nuevo esa hora |
| `finished_at` nulo | La corrida se cayó a la mitad. La transacción se revirtió y las filas siguen pendientes |
| La última corrida es de hace días | El disparador dejó de correr. Revisar el Apps Script |

Filas que llegaron pero todavía no se escriben:

```sql
select form_code, count(*) from sheet_rows where imported_at is null group by 1;
```

Un disparador que falla **le manda un correo al dueño del script**. Es la única
alarma que tiene esta sincronización, y es a propósito que el error se lance en
vez de tragárselo.

---

## Qué pasa cuando el profesor corrige una celda

Nada especial: la fila cambia, su huella cambia, entra como fila nueva y la
importación reescribe esa entrega. No se duplica, porque la entrega se
identifica por `form_code:correo:marcaTemporal`, que no cambió.

Es la diferencia deliberada con `scripts/generar_import.py`: ahí los `INSERT`
eran `on conflict do nothing` porque era una carga única. Aquí una entrega
existente se **actualiza**.

Lo que **no** se propaga es un borrado: si el profesor borra una fila del
Sheets, la entrega se queda en la base. Borrar por ausencia haría que un error
de lectura del Sheets vaciara el panel, y ese no es el lado seguro del error.

---

## Las seis horas

La importación inicial emitía la marca temporal como literal suelto
(`'2026-03-03 09:00:00'::timestamptz`), así que la interpretó la zona de la
sesión del SQL Editor, que en Supabase es UTC. La sincronización la interpreta
en `America/Monterrey`, como manda [DATA_MAPPING.md](DATA_MAPPING.md).

Son seis horas. Sin reconciliar, las entregas viejas y las nuevas quedan en dos
convenciones distintas y el panel muestra horas que no coinciden entre sí.

El `UPDATE` de la migración no adivina el desfase: reconstruye `submitted_at`
desde la propia `source_row_key`, que lleva la hora tal como venía del Sheets.
Por eso es idempotente y por eso no importa cuál era la zona de la sesión que
hizo la importación original.

Para confirmar que quedó parejo:

```sql
select form_code,
       min(submitted_at at time zone 'America/Monterrey') as primera,
       max(submitted_at at time zone 'America/Monterrey') as ultima
from submissions group by 1 order by 1;
```

---

## Agregar una hoja nueva

Una hoja que no esté en el catálogo `forms` se rechaza con
`formulario desconocido`. Es deliberado: sin tabla de respuestas no hay dónde
guardar lo que traiga. El orden es:

1. Migración con la tabla de respuestas, su RLS y su fila en `forms`.
2. Un bloque nuevo en `import_sheet_rows()` con su normalización.
3. El código de la hoja en la constante `HOJAS` del Apps Script.
4. Su sección en [DATA_MAPPING.md](DATA_MAPPING.md).

---

## Límites conocidos

| Límite | Detalle |
|---|---|
| Tiempo de ejecución | Apps Script corta a los 6 minutos. Hoy la corrida completa son ~15 peticiones; el lote de 200 filas existe para que siga cabiendo cuando las bitácoras crezcan |
| Borrados | No se propagan, a propósito (ver arriba) |
| Hojas `alumnos` y `fechas_entrega` | Fuera de alcance: no tienen tabla |
| Revisión del DISC | La sincronización vuelve a marcar `needs_review`; si el profesor corrigió a mano una fila en la base y la celda del Sheets sigue sucia, la corrección se pierde en la siguiente pasada. Lo correcto es corregir en el Sheets |
