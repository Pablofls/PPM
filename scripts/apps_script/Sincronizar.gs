/**
 * Sincronización del Google Sheets hacia Supabase.
 *
 * Se pega en Extensiones > Apps Script del propio Sheets de datos procesados.
 * Con `instalarSincronizacionPPM()` queda corriendo cada hora sin que nadie lo
 * toque.
 *
 * Este script NO normaliza nada: lee cada hoja y manda las filas tal como
 * están. Toda la limpieza —sexo, niveles de habilidad, el DISC que tradujo el
 * formulario, las horas que el Sheets convirtió en fechas— vive en SQL, en
 * supabase/migrations/0015_sheet_sync.sql. Es a propósito: una sola copia de
 * esas reglas, en el repositorio, revisable en un diff.
 *
 * ---------------------------------------------------------------------------
 * TODO vive dentro del objeto PPM y los nombres de arriba llevan sufijo.
 * ---------------------------------------------------------------------------
 * Apps Script comparte UN solo espacio de nombres entre todos los archivos del
 * proyecto, y este proyecto ya tiene `main.gs` y los `pasarDatos_*.gs` del
 * sistema anterior. Una función suelta llamada `leerHoja` o `celda` pisaría en
 * silencio a la del sistema viejo —gana la última que carga— y rompería algo
 * que hoy funciona, sin ningún error que lo delate.
 *
 * ---------------------------------------------------------------------------
 * Configuración (Configuración del proyecto > Propiedades del script)
 * ---------------------------------------------------------------------------
 *
 *   Propiedad             Valor
 *   SUPABASE_URL          https://sovinakodrmgxytgapry.supabase.co
 *   SUPABASE_SERVICE_KEY  la llave `service_role` del proyecto
 *
 * `getProperty()` recibe el NOMBRE de la propiedad, nunca el valor. La llave
 * `service_role` salta RLS y no debe quedar escrita en este archivo: ni aquí,
 * ni en el repositorio, ni en el .env del panel, que corre en el navegador.
 */

const PPM = {

  /** Las hojas que se sincronizan. El nombre de la hoja ES el código del formulario. */
  HOJAS: [
    'form1_0', 'form1_1', 'form1_2', 'form1_3', 'form1_4', 'form1_5',
    'form2_1', 'form2_2', 'form2_4', 'form2_5', 'form2_7',
    'formA_1', 'formB_1',
    'form_busqueda', 'form_practicas',
  ],

  /**
   * Cuántas filas van por petición. Con 46 alumnos cabría todo de una, pero las
   * bitácoras crecen cada semana y una hoja entera en un solo POST acabaría
   * topando con el límite de tiempo de Apps Script.
   */
  TAMANO_LOTE: 200,

  /**
   * Resuelve la zona horaria con la que se formatean las fechas del Sheets.
   *
   * NO adivina. Una versión anterior tenía una cadena de respaldos
   * (`getSpreadsheetTimeZone()` → zona del script → 'America/Monterrey') y eso
   * convirtió un error ruidoso en uno silencioso: la zona del script iba seis
   * horas atrás de la del Sheets, todas las marcas temporales salieron
   * corridas, ninguna `source_row_key` coincidió con la de la importación
   * inicial y la sincronización creó 581 entregas duplicadas en vez de
   * actualizar las que ya estaban.
   *
   * Ahora hay dos fuentes y ninguna inventada:
   *
   *   1. La propiedad del script `ZONA_SHEETS`, si está puesta. Es la que
   *      manda, y existe porque `getSpreadsheetTimeZone()` ya falló una vez.
   *   2. La zona del propio Sheets.
   *
   * Si ninguna sirve, truena. Un error detiene la corrida y manda un correo;
   * una zona equivocada ensucia la base sin que nadie se entere.
   */
  zona: function (libro) {
    const declarada = PropertiesService.getScriptProperties()
      .getProperty('ZONA_SHEETS');
    if (typeof declarada === 'string' && declarada) return declarada;

    const delLibro = libro.getSpreadsheetTimeZone();
    if (typeof delLibro === 'string' && delLibro) return delLibro;

    throw new Error(
      'No se pudo determinar la zona horaria del Sheets: ' +
      'getSpreadsheetTimeZone() devolvió ' + JSON.stringify(delLibro) + '. ' +
      'Corre diagnosticoZonaPPM() y pon el valor correcto en la propiedad ' +
      'del script ZONA_SHEETS.');
  },

  /**
   * Convierte una hoja en una lista de objetos {encabezado: valor}.
   *
   * Se descartan las filas sin correo Y sin marca temporal: las hojas arrastran
   * cientos de filas en blanco al final (form1_3 tiene 999 filas y 43 con
   * datos) y mandarlas cada hora sería puro tráfico.
   */
  leerHoja: function (pestana, zona) {
    const datos = pestana.getDataRange().getValues();
    if (datos.length < 2) return [];

    const encabezados = datos[0];
    const filas = [];

    for (let f = 1; f < datos.length; f++) {
      const registro = {};
      for (let c = 0; c < encabezados.length; c++) {
        const clave = String(encabezados[c]).trim();
        if (!clave) continue;
        const valor = this.celda(datos[f][c], zona);
        if (valor !== null) registro[clave] = valor;
      }

      // 'marcaTemproal' es un encabezado mal escrito en el origen (form1_1).
      const tieneCorreo = !!registro['idCorreo'];
      const tieneMarca = !!(registro['marcaTemporal'] || registro['marcaTemproal']);
      if (tieneCorreo || tieneMarca) filas.push(registro);
    }

    return filas;
  },

  /**
   * Serializa una celda.
   *
   * Las fechas se mandan como texto ISO SIN zona horaria, en la zona del propio
   * Sheets. Es deliberado: JSON.stringify las convertiría a UTC y correría las
   * fechas de nacimiento un día, y la parte de SQL necesita ver la fecha tal
   * como la ve el profesor en la pantalla. También es lo que hace que se puedan
   * reconocer las horas que el Sheets guardó como fechas de 1900.
   */
  celda: function (valor, zona) {
    if (valor === null || valor === undefined || valor === '') return null;
    if (valor instanceof Date) {
      return Utilities.formatDate(valor, zona, "yyyy-MM-dd'T'HH:mm:ss");
    }
    return valor;  // número, booleano o texto, tal cual
  },

  /** Llama a una función de Postgres por PostgREST. */
  llamar: function (funcion, cuerpo) {
    const props = PropertiesService.getScriptProperties();

    // El argumento es el NOMBRE de la propiedad. Si aquí aparece una URL o una
    // llave, alguien confundió el nombre con el valor.
    const url = props.getProperty('SUPABASE_URL');
    const key = props.getProperty('SUPABASE_SERVICE_KEY');

    if (!url || !key) {
      throw new Error(
        'Faltan SUPABASE_URL o SUPABASE_SERVICE_KEY en Configuración del ' +
        'proyecto > Propiedades del script.');
    }

    const respuesta = UrlFetchApp.fetch(url + '/rest/v1/rpc/' + funcion, {
      method: 'post',
      contentType: 'application/json',
      headers: { apikey: key, Authorization: 'Bearer ' + key },
      payload: JSON.stringify(cuerpo),
      muteHttpExceptions: true,
    });

    const codigo = respuesta.getResponseCode();
    const texto = respuesta.getContentText();

    // Se lanza el error en vez de tragárselo: un disparador que falla le manda
    // un correo al dueño del script, y ese correo es toda la alarma que tiene
    // esta sincronización.
    if (codigo < 200 || codigo >= 300) {
      throw new Error(funcion + ' respondió ' + codigo + ': ' + texto);
    }

    return JSON.parse(texto);
  },
};

/**
 * El punto de entrada del disparador horario.
 *
 * El nombre lleva sufijo para no chocar con nada del sistema anterior que viva
 * en este mismo proyecto de Apps Script.
 */
function sincronizarPPM() {
  const libro = SpreadsheetApp.getActive();
  if (!libro) {
    throw new Error(
      'El script no está enlazado a un Sheets. Tiene que vivir en ' +
      'Extensiones > Apps Script del archivo de datos procesados.');
  }

  const zona = PPM.zona(libro);
  Logger.log('Zona horaria: ' + zona);

  const resumen = [];
  for (let i = 0; i < PPM.HOJAS.length; i++) {
    const nombre = PPM.HOJAS[i];
    const pestana = libro.getSheetByName(nombre);
    if (!pestana) {
      resumen.push(nombre + ': la hoja no existe');
      continue;
    }

    const filas = PPM.leerHoja(pestana, zona);
    let nuevas = 0;
    for (let j = 0; j < filas.length; j += PPM.TAMANO_LOTE) {
      const lote = filas.slice(j, j + PPM.TAMANO_LOTE);
      nuevas += PPM.llamar('ingest_sheet_rows',
                           { p_form_code: nombre, p_rows: lote }).nuevas;
    }
    resumen.push(nombre + ': ' + filas.length + ' filas, ' + nuevas + ' nuevas');
  }

  // Las filas llegaron al staging; esto las normaliza y las escribe en las
  // tablas del panel, todo en una sola transacción.
  const escrito = PPM.llamar('import_sheet_rows', {});

  Logger.log(resumen.join('\n'));
  Logger.log('Importado: ' + JSON.stringify(escrito));
  return escrito;
}

/**
 * Diagnóstico de la zona horaria. Se corre a mano cuando hay que averiguar con
 * qué zona hay que formatear las fechas para que coincidan con lo que el Sheets
 * tiene guardado.
 *
 * Imprime la misma celda formateada con varias zonas candidatas. La correcta es
 * la que reproduce la marca temporal que ya está en `submissions` para esa
 * entrega; cualquier otra genera una `source_row_key` distinta y duplica.
 */
function diagnosticoZonaPPM() {
  const libro = SpreadsheetApp.getActive();
  const delLibro = libro.getSpreadsheetTimeZone();

  Logger.log('getSpreadsheetTimeZone(): ' + JSON.stringify(delLibro) +
             '  (tipo: ' + (typeof delLibro) + ')');
  Logger.log('Session.getScriptTimeZone(): ' +
             JSON.stringify(Session.getScriptTimeZone()));
  Logger.log('propiedad ZONA_SHEETS: ' + JSON.stringify(
    PropertiesService.getScriptProperties().getProperty('ZONA_SHEETS')));

  const hoja = libro.getSheetByName('form1_0');
  const marca = hoja.getRange('A2').getValue();
  const correo = hoja.getRange('B2').getValue();

  Logger.log('--- fila 2 de form1_0 ---');
  Logger.log('idCorreo: ' + correo);
  Logger.log('marcaTemporal cruda: ' + marca +
             '  (¿Date? ' + (marca instanceof Date) + ')');

  if (!(marca instanceof Date)) {
    Logger.log('A2 no es una fecha: revisa que la columna A sea marcaTemporal.');
    return;
  }

  const candidatas = ['GMT', 'UTC', 'America/Monterrey', 'America/Mexico_City',
                      'America/Los_Angeles', 'America/New_York'];
  for (let i = 0; i < candidatas.length; i++) {
    Logger.log(candidatas[i] + ' -> ' +
               Utilities.formatDate(marca, candidatas[i], "yyyy-MM-dd'T'HH:mm:ss"));
  }
}

/**
 * Instala el disparador horario. Se corre UNA vez, a mano, desde el editor.
 * Borra primero el que hubiera para no acabar con seis copias corriendo.
 */
function instalarSincronizacionPPM() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'sincronizarPPM') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('sincronizarPPM').timeBased().everyHours(1).create();
  Logger.log('Disparador horario instalado.');
}

/**
 * Opcional: además del horario, sincroniza en cuanto llega una respuesta nueva.
 * Solo sirve si ESTE Sheets es el que recibe las respuestas del formulario; si
 * los datos se copian desde otro archivo, el disparador horario es el que vale.
 */
function instalarSincronizacionFormularioPPM() {
  ScriptApp.newTrigger('sincronizarPPM')
    .forSpreadsheet(SpreadsheetApp.getActive())
    .onFormSubmit()
    .create();
  Logger.log('Disparador de envío de formulario instalado.');
}
