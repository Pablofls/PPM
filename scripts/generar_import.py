#!/usr/bin/env python3
"""
Genera el SQL de importación a partir del export del Google Sheets.

    python3 scripts/generar_import.py "ruta/al/datos procesados.xlsx" [salida/]

El SQL generado CONTIENE DATOS PERSONALES de alumnos, así que se escribe fuera
del repositorio y nunca se commitea (regla «Nunca datos sensibles» de CLAUDE.md).
Lo que sí se versiona es este generador: es revisable, reejecutable y deja claro
qué transformación se le aplicó a cada columna.

Especificación de las transformaciones: docs/DATA_MAPPING.md
Alcance: los 11 formularios form1_0 … form2_7. Las hojas `alumnos` y
`fechas_entrega` se ignoran a propósito.

La importación es idempotente: cada entrega lleva un `source_row_key` único y
todos los INSERT usan ON CONFLICT DO NOTHING. Volver a correr el SQL no duplica.
"""

from __future__ import annotations

import re
import sys
import unicodedata
from collections import Counter, defaultdict
from datetime import date, datetime
from pathlib import Path

import openpyxl

# ---------------------------------------------------------------------------
# Utilidades
# ---------------------------------------------------------------------------

incidencias: dict[str, Counter] = defaultdict(Counter)


def anotar(categoria: str, detalle: str) -> None:
    """Registra una transformación no trivial para el reporte final."""
    incidencias[categoria][detalle] += 1


def sin_acentos(texto: str) -> str:
    return ''.join(
        c for c in unicodedata.normalize('NFD', texto)
        if unicodedata.category(c) != 'Mn'
    )


def lit(valor) -> str:
    """Convierte un valor de Python en un literal SQL."""
    if valor is None:
        return 'null'
    if isinstance(valor, bool):
        return 'true' if valor else 'false'
    if isinstance(valor, (int, float)):
        return str(valor)
    if isinstance(valor, datetime):
        return "'" + valor.strftime('%Y-%m-%d %H:%M:%S') + "'"
    if isinstance(valor, date):
        return "'" + valor.strftime('%Y-%m-%d') + "'"
    if isinstance(valor, list):
        if not valor:
            return 'null'
        partes = ','.join('"' + str(v).replace('"', '\\"') + '"' for v in valor)
        return "'{" + partes + "}'"
    return "'" + str(valor).replace("'", "''") + "'"


def texto(valor) -> str | None:
    if valor is None:
        return None
    limpio = str(valor).strip()
    return limpio or None


def correo(valor) -> str | None:
    limpio = texto(valor)
    return limpio.lower() if limpio else None


def entero(valor) -> int | None:
    """El Sheets entrega los enteros como float (611194.0)."""
    if valor is None or valor == '':
        return None
    try:
        return int(float(valor))
    except (TypeError, ValueError):
        return None


def identificador(valor) -> str | None:
    """Matrículas y teléfonos: número en el origen, texto en la base."""
    n = entero(valor)
    if n is not None:
        return str(n)
    return texto(valor)


def solo_fecha(valor) -> date | None:
    """El Sheets trae una hora espuria por la zona horaria; se descarta."""
    if isinstance(valor, datetime):
        return valor.date()
    if isinstance(valor, date):
        return valor
    return None


# ---------------------------------------------------------------------------
# Normalización de enums
# ---------------------------------------------------------------------------

def idioma(valor) -> str | None:
    v = texto(valor)
    if not v:
        return None
    return 'en' if sin_acentos(v).lower().startswith('ingl') else 'es'


def frecuencia(valor) -> str | None:
    v = texto(valor)
    if not v:
        return None
    return 'miercoles' if sin_acentos(v).lower().startswith('mi') else 'lunes'


def sexo(valor) -> str | None:
    """'Femenine' es la opción del formulario en inglés, no una categoría aparte."""
    v = texto(valor)
    if not v:
        return 'no_especificado'
    base = sin_acentos(v).lower()
    if base.startswith('femen'):
        if base != 'femenino':
            anotar('sexo normalizado', f'{v} -> femenino')
        return 'femenino'
    if base.startswith('mascul'):
        return 'masculino'
    anotar('sexo sin reconocer', v)
    return 'no_especificado'


ORDINALES = {
    '1ro': 1, '1er': 1, '2do': 2, '3ro': 3, '3er': 3, '4to': 4, '5to': 5,
    '6to': 6, '7mo': 7, '8vo': 8, '9no': 9, '10mo': 10, '11vo': 11, '12vo': 12,
}


def semestre(valor) -> int | None:
    v = texto(valor)
    if not v:
        return None
    clave = v.lower()
    if clave in ORDINALES:
        return ORDINALES[clave]
    n = entero(v)
    if n is not None and 1 <= n <= 12:
        return n
    anotar('semestre sin reconocer', v)
    return None


def si_no(valor) -> bool | None:
    """Acepta Sí, Si, Yes / No, con y sin acento."""
    v = texto(valor)
    if not v:
        return None
    base = sin_acentos(v).lower()
    if base in ('si', 'yes', 'true'):
        if v not in ('Sí', 'Si'):
            anotar('si/no normalizado', f'{v} -> true')
        return True
    if base in ('no', 'false'):
        return False
    anotar('si/no sin reconocer', v)
    return None


# ---------------------------------------------------------------------------
# Habilidades (form1_4)
# ---------------------------------------------------------------------------

NIVELES = ['novato', 'principiante', 'intermedio', 'avanzado', 'experto']

# El formulario existe en dos idiomas y trae typos. 247 celdas vienen en inglés
# y 42 con 'Esperto': sin esta tabla, 39 de 44 alumnos quedarían sin habilidades.
TRADUCCION_NIVEL = {
    'novato': 'novato', 'novice': 'novato',
    'principiante': 'principiante', 'beginner': 'principiante',
    'intermedio': 'intermedio', 'intermediate': 'intermedio',
    'avanzado': 'avanzado', 'advanced': 'avanzado',
    'experto': 'experto', 'expert': 'experto',
    'esperto': 'experto',  # typo frecuente en el origen
}


def nivel_habilidad(valor) -> str | None:
    v = texto(valor)
    if not v:
        return None

    encontrados: list[str] = []
    for parte in v.split(','):
        clave = sin_acentos(parte.strip()).lower()
        if clave in TRADUCCION_NIVEL:
            encontrados.append(TRADUCCION_NIVEL[clave])
        elif clave:
            anotar('nivel de habilidad sin reconocer', parte.strip())

    if not encontrados:
        return None

    if len(encontrados) > 1:
        # El formulario permitió marcar varias casillas. Se toma la más alta:
        # un alumno que marcó "Intermedio, Avanzado" alcanza el avanzado.
        anotar('habilidad con varios niveles', f'{v} -> {max(encontrados, key=NIVELES.index)}')

    return max(encontrados, key=NIVELES.index)


# ---------------------------------------------------------------------------
# Holland (form1_1)
# ---------------------------------------------------------------------------

def holland_letra(valor) -> str | None:
    """'R (Realista)' -> 'R'."""
    v = texto(valor)
    if not v:
        return None
    letra = v.strip()[0].upper()
    return letra if letra in 'RIASEC' else None


def holland_codigo(valor) -> str | None:
    v = texto(valor)
    if not v:
        return None
    codigo = re.sub(r'[^RIASEC]', '', v.upper())
    if len(codigo) == 3:
        return codigo
    anotar('código Holland sin reconocer', v)
    return None


# ---------------------------------------------------------------------------
# MBTI (form1_2)
# ---------------------------------------------------------------------------

# Las 16 columnas en español de la hoja, cada una es un tipo MBTI.
COLUMNAS_MBTI = {
    'arquitecto': 'INTJ', 'logico': 'INTP', 'comandante': 'ENTJ',
    'innovador': 'ENTP', 'abogado': 'INFJ', 'mediador': 'INFP',
    'protagonista': 'ENFJ', 'activista': 'ENFP', 'practico': 'ISTJ',
    'defensor': 'ISFJ', 'ejecutivo': 'ESTJ', 'consul': 'ESFJ',
    'vistuoso': 'ISTP', 'aventurero': 'ISFP', 'emprendedor': 'ESTP',
    'animador': 'ESFP',
}

DIMENSIONES_MBTI = {
    'energia':    ({'extravertido': 'extravertido', 'extrovertido': 'extravertido',
                    'introvertido': 'introvertido'}, 'energy'),
    'mente':      ({'intuitivo': 'intuitivo', 'observador': 'observador'}, 'mind'),
    'naturaleza': ({'pensamiento': 'pensamiento', 'emocional': 'emocional'}, 'nature'),
    'tacticas':   ({'juzgador': 'juzgador', 'prospeccion': 'prospeccion'}, 'tactics'),
    'identidad':  ({'asertivo': 'asertivo', 'cauteloso': 'cauteloso'}, 'identity'),
}


def dimension_mbti(columna: str, valor) -> str | None:
    v = texto(valor)
    if not v:
        return None
    mapa, _ = DIMENSIONES_MBTI[columna]
    clave = sin_acentos(v).lower()
    if clave in mapa:
        if mapa[clave] != clave:
            anotar('MBTI normalizado', f'{v} -> {mapa[clave]}')
        return mapa[clave]
    anotar(f'MBTI {columna} sin reconocer', v)
    return None


def porcentaje(valor) -> int | None:
    n = entero(valor)
    if n is None:
        return None
    if 0 <= n <= 100:
        return n
    anotar('porcentaje fuera de rango', str(n))
    return None


# ---------------------------------------------------------------------------
# DISC (form1_3) — la hoja más sucia del origen
# ---------------------------------------------------------------------------

CATEGORIAS_DISC = {
    'coaches': 'Coaches', 'coach': 'Coaches',
    'technicians': 'Technicians', 'technician': 'Technicians',
    'networkers': 'Networkers', 'networker': 'Networkers',
    'harmonizers': 'Harmonizers', 'harmonizer': 'Harmonizers',
    'formalists': 'Formalists', 'formalist': 'Formalists',
    'formalista': 'Formalists', 'formalistas': 'Formalists',
    'fact-finders': 'Fact-finders', 'fact finders': 'Fact-finders',
    'explorers': 'Explorers', 'explorer': 'Explorers',
    'assessors': 'Assessors', 'asessors': 'Assessors', 'assessor': 'Assessors',
    'examiners': 'Examiners', 'examiner': 'Examiners',
    'dynamos': 'Dynamos', 'dynamo': 'Dynamos',
    'influencers': 'Influencers', 'influencer': 'Influencers',
    'producers': 'Producers', 'producer': 'Producers',
}


def limpiar_disc(estilo_crudo, categoria_cruda) -> tuple[str | None, str | None, bool]:
    """Devuelve (estilo, categoría, necesita_revisión)."""
    estilo = texto(estilo_crudo)
    categoria = texto(categoria_cruda)
    revisar = False

    # El traductor automático del formulario convierte el estilo 'SC' en
    # "South Carolina" -> "Carolina del Sur".
    if estilo and sin_acentos(estilo).lower() in ('carolina del sur', 'south carolina'):
        anotar('DISC traducido por el formulario', f'{estilo} -> SC')
        estilo, revisar = 'SC', True

    # Algunos alumnos escriben la categoría en la columna del estilo.
    if estilo and sin_acentos(estilo).lower() in CATEGORIAS_DISC:
        anotar('DISC categoría en la columna de estilo', estilo)
        if not categoria:
            categoria = estilo
        estilo, revisar = None, True

    # …y otros escriben texto libre.
    if estilo and not re.fullmatch(r'[DISCdisc]{1,4}', estilo):
        anotar('DISC estilo sin reconocer', estilo)
        estilo, revisar = None, True

    # 'DISC' pasa el formato pero es el nombre de la prueba, no un resultado.
    if estilo and estilo.upper() == 'DISC':
        anotar('DISC estilo sin reconocer', estilo)
        estilo, revisar = None, True

    # A la inversa: el estilo capturado en la columna de categoría.
    if categoria and re.fullmatch(r'[DISCdisc]{1,4}', categoria):
        anotar('DISC estilo en la columna de categoría', categoria)
        if not estilo:
            estilo = categoria.upper()
        categoria, revisar = None, True

    if categoria:
        clave = sin_acentos(categoria).lower()
        if clave in CATEGORIAS_DISC:
            if categoria != CATEGORIAS_DISC[clave]:
                anotar('DISC categoría normalizada', f'{categoria} -> {CATEGORIAS_DISC[clave]}')
            categoria = CATEGORIAS_DISC[clave]
        else:
            anotar('DISC categoría sin reconocer', categoria)
            revisar = True

    if estilo:
        estilo = estilo.upper()

    return estilo, categoria, revisar


# ---------------------------------------------------------------------------
# Lectura del Excel
# ---------------------------------------------------------------------------

def leer_hoja(libro, nombre: str) -> list[dict]:
    hoja = libro[nombre]
    filas = list(hoja.iter_rows(values_only=True))
    encabezados = list(filas[0])
    resultado = []
    for fila in filas[1:]:
        if not any(c is not None for c in fila):
            continue  # las hojas traen filas en blanco al final
        registro = {}
        for i, clave in enumerate(encabezados):
            if clave is not None:
                registro[clave] = fila[i] if i < len(fila) else None
        resultado.append(registro)
    return resultado


def marca_temporal(registro: dict):
    """En form1_1 el encabezado está mal escrito en el origen."""
    return registro.get('marcaTemporal') or registro.get('marcaTemproal')


# ---------------------------------------------------------------------------
# Generación del SQL
# ---------------------------------------------------------------------------

def bloque_values(filas: list[list[str]]) -> str:
    return ',\n  '.join('(' + ', '.join(f) + ')' for f in filas)


def sql_entregas(form_code: str, entregas: list[dict]) -> str:
    """Inserta en `submissions`, ligando por correo institucional."""
    filas = [
        [lit(e['email']), lit(e['submitted_at']), lit(e['language']), lit(e['key'])]
        for e in entregas
    ]
    return f"""-- Entregas de {form_code} ({len(entregas)})
insert into submissions (student_id, form_code, submitted_at, language, source_row_key)
select st.id, {lit(form_code)}, v.submitted_at::timestamptz, v.language::language, v.source_row_key
from (values
  {bloque_values(filas)}
) as v(email, submitted_at, language, source_row_key)
join students st on st.institutional_email = v.email
on conflict (source_row_key) do nothing;
"""


def sql_respuestas(tabla: str, columnas: list[str], filas: list[list[str]],
                   casts: dict[str, str]) -> str:
    """Inserta la tabla de respuestas, ligando por `source_row_key`."""
    if not filas:
        return f'-- {tabla}: sin filas\n'
    select = ', '.join(f'v.{c}{casts.get(c, "")}' for c in columnas)
    return f"""-- Respuestas en {tabla} ({len(filas)})
insert into {tabla} (submission_id, {', '.join(columnas)})
select sub.id, {select}
from (values
  {bloque_values(filas)}
) as v(source_row_key, {', '.join(columnas)})
join submissions sub on sub.source_row_key = v.source_row_key
on conflict (submission_id) do nothing;
"""


CABECERA = """-- ============================================================
-- {titulo}
-- Generado por scripts/generar_import.py — NO COMMITEAR
-- Contiene datos personales de alumnos.
-- Idempotente: volver a ejecutarlo no duplica nada.
-- ============================================================

"""

def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 1

    ruta = Path(sys.argv[1])
    salida = Path(sys.argv[2] if len(sys.argv) > 2 else 'import_sql')
    salida.mkdir(parents=True, exist_ok=True)

    libro = openpyxl.load_workbook(ruta, read_only=True, data_only=True)
    archivos: list[tuple[str, str]] = []

    # --- Alumnos ----------------------------------------------------------
    # La lista se DERIVA de los correos que aparecen en los formularios: la hoja
    # `alumnos` no se importa en esta iteración.
    FORMULARIOS = ['form1_0', 'form1_1', 'form1_2', 'form1_3', 'form1_4',
                   'form1_5', 'form2_1', 'form2_2', 'form2_4', 'form2_5', 'form2_7']

    hojas = {f: leer_hoja(libro, f) for f in FORMULARIOS}

    correos: set[str] = set()
    for nombre, filas in hojas.items():
        for fila in filas:
            c = correo(fila.get('idCorreo'))
            if c:
                correos.add(c)
            else:
                anotar('fila sin correo (se descarta)', nombre)

    sql = CABECERA.format(titulo=f'Alumnos ({len(correos)})')
    sql += f"""insert into students (institutional_email)
select v.email::citext
from (values
  {bloque_values([[lit(c)] for c in sorted(correos)])}
) as v(email)
on conflict (institutional_email) do nothing;
"""
    archivos.append(('01_students.sql', sql))

    def entregas_de(form_code: str) -> list[dict]:
        salida_e = []
        for fila in hojas[form_code]:
            c = correo(fila.get('idCorreo'))
            ts = marca_temporal(fila)
            if not c or ts is None:
                continue
            salida_e.append({
                'email': c,
                'submitted_at': ts,
                'language': idioma(fila.get('idioma')),
                # Idempotencia: identifica la respuesta de forma única.
                'key': f"{form_code}:{c}:{ts:%Y-%m-%dT%H:%M:%S}",
                'fila': fila,
            })
        return salida_e

    def clave(e: dict) -> str:
        return lit(e['key'])

    # --- 1.0 Datos Demográficos -------------------------------------------
    ent = entregas_de('form1_0')
    cols = ['full_name', 'student_number', 'personal_email', 'birth_date',
            'birth_country', 'gender', 'degree_code', 'semester', 'period_code',
            'session_day']
    filas = [[clave(e),
              lit(texto(e['fila'].get('nombre'))),
              lit(identificador(e['fila'].get('matricula'))),
              lit(correo(e['fila'].get('correoPersonal'))),
              lit(solo_fecha(e['fila'].get('fechaNacimiento'))),
              lit(texto(e['fila'].get('paisNacimiento'))),
              lit(sexo(e['fila'].get('sexo'))),
              lit(texto(e['fila'].get('carrera'))),
              lit(semestre(e['fila'].get('semestre'))),
              lit(texto(e['fila'].get('periodo'))),
              lit(frecuencia(e['fila'].get('frecuencia')))] for e in ent]
    sql = CABECERA.format(titulo='1.0 Datos Demográficos (form1_0)')
    sql += sql_entregas('form1_0', ent) + '\n'
    sql += sql_respuestas('demographics', cols, filas, {
        'birth_date': '::date', 'personal_email': '::citext',
        'gender': '::gender', 'semester': '::smallint',
        'session_day': '::session_day'})
    archivos.append(('02_form1_0_demographics.sql', sql))

    # --- 1.1 Intereses Profesionales --------------------------------------
    ent = entregas_de('form1_1')
    cols = ['first_type', 'second_type', 'third_type', 'holland_code',
            'first_score', 'second_score', 'third_score']
    filas = [[clave(e),
              lit(holland_letra(e['fila'].get('primerPuntaje'))),
              lit(holland_letra(e['fila'].get('segundoPuntaje'))),
              lit(holland_letra(e['fila'].get('tercerPuntaje'))),
              lit(holland_codigo(e['fila'].get('codigoHolland'))),
              lit(entero(e['fila'].get('primerPuntacion'))),
              lit(entero(e['fila'].get('segundaPuntuacion'))),
              lit(entero(e['fila'].get('tercerPuntuacion')))] for e in ent]
    sql = CABECERA.format(titulo='1.1 Intereses Profesionales (form1_1)')
    sql += sql_entregas('form1_1', ent) + '\n'
    sql += sql_respuestas('holland_results', cols, filas, {
        'first_type': '::holland_type', 'second_type': '::holland_type',
        'third_type': '::holland_type', 'first_score': '::smallint',
        'second_score': '::smallint', 'third_score': '::smallint'})
    archivos.append(('03_form1_1_holland.sql', sql))

    # --- 1.2 Personalidad --------------------------------------------------
    ent = entregas_de('form1_2')
    cols = ['report_url', 'mbti_type', 'identity', 'energy', 'mind', 'nature',
            'tactics', 'energy_pct', 'mind_pct', 'nature_pct', 'tactics_pct',
            'identity_pct']
    filas = []
    for e in ent:
        fila = e['fila']
        # Las 16 columnas de tipo: solo una trae valor, y ese valor es A o T.
        tipo = None
        for columna, codigo in COLUMNAS_MBTI.items():
            if texto(fila.get(columna)):
                if tipo is not None:
                    anotar('MBTI con varios tipos marcados', f'{tipo} y {codigo}')
                tipo = codigo
        if tipo is None:
            anotar('MBTI sin tipo marcado', 'ninguna de las 16 columnas')
        filas.append([clave(e),
                      lit(texto(fila.get('link'))),
                      lit(tipo),
                      lit(dimension_mbti('identidad', fila.get('identidad'))),
                      lit(dimension_mbti('energia', fila.get('energia'))),
                      lit(dimension_mbti('mente', fila.get('mente'))),
                      lit(dimension_mbti('naturaleza', fila.get('naturaleza'))),
                      lit(dimension_mbti('tacticas', fila.get('tacticas'))),
                      lit(porcentaje(fila.get('energiaPorcentaje'))),
                      lit(porcentaje(fila.get('mentePorcentaje'))),
                      lit(porcentaje(fila.get('naturalezaPorcentaje'))),
                      lit(porcentaje(fila.get('tacticasPorcentaje'))),
                      lit(porcentaje(fila.get('identidadPorcentaje')))])
    sql = CABECERA.format(titulo='1.2 Personalidad (form1_2)')
    sql += sql_entregas('form1_2', ent) + '\n'
    sql += sql_respuestas('mbti_results', cols, filas, {
        'mbti_type': '::mbti_type', 'identity': '::mbti_identity',
        'energy': '::mbti_energy', 'mind': '::mbti_mind',
        'nature': '::mbti_nature', 'tactics': '::mbti_tactics',
        'energy_pct': '::smallint', 'mind_pct': '::smallint',
        'nature_pct': '::smallint', 'tactics_pct': '::smallint',
        'identity_pct': '::smallint'})
    archivos.append(('04_form1_2_mbti.sql', sql))

    # --- 1.3 Estilos de Comportamiento -------------------------------------
    ent = entregas_de('form1_3')
    cols = ['disc_style', 'disc_category', 'explanation', 'needs_review']
    filas = []
    for e in ent:
        estilo, categoria, revisar = limpiar_disc(
            e['fila'].get('discStyle'), e['fila'].get('discCategoria'))
        filas.append([clave(e), lit(estilo), lit(categoria),
                      lit(texto(e['fila'].get('explicacion'))), lit(revisar)])
    sql = CABECERA.format(titulo='1.3 Estilos de Comportamiento (form1_3)')
    sql += sql_entregas('form1_3', ent) + '\n'
    sql += sql_respuestas('disc_results', cols, filas, {'needs_review': '::boolean'})
    archivos.append(('05_form1_3_disc.sql', sql))

    # --- 1.4 Formulario de Habilidades -------------------------------------
    HABILIDADES = [
        ('comunicacionEscrita', 'written_communication'),
        ('comunicacionVerbal', 'verbal_communication'),
        ('comunicacionNoVerbal', 'nonverbal_communication'),
        ('colabYTrabajoEquipo', 'collaboration_teamwork'),
        ('liderazgo', 'leadership'),
        ('resDeConflictos', 'conflict_resolution'),
        ('negociacion', 'negotiation'),
        ('escuchaActiva', 'active_listening'),
        ('empatia', 'empathy'),
        ('servicioCliente', 'customer_service'),
        ('excel', 'excel'), ('sheets', 'sheets'), ('word', 'word'),
        ('docs', 'docs'), ('powerpoint', 'powerpoint'), ('slides', 'slides'),
        ('chatGPT', 'chatgpt'), ('gemini', 'gemini'),
        ('programacion', 'programming'),
        ('pensamientoCritico', 'critical_thinking'),
        ('tomaDecisiones', 'decision_making'),
        ('adminTiempo', 'time_management'),
        ('planeacionOrganizacion', 'planning_organization'),
        ('analisisInvestigacion', 'research_analysis'),
        ('adminProyectos', 'project_management'),
        ('creatividadInovacion', 'creativity_innovation'),
        ('flexibilidadAdaptibildad', 'flexibility_adaptability'),
        ('eticaTrabajo', 'work_ethic'),
        ('eduFinanciera', 'financial_literacy'),
        ('habilidadAprender', 'learning_ability'),
        ('inteligenciaEmocional', 'emotional_intelligence'),
        ('networking', 'networking'), ('ventas', 'sales'),
    ]
    ent = entregas_de('form1_4')
    cols = [destino for _, destino in HABILIDADES] + ['is_pefista_graduating']
    filas = [[clave(e)]
             + [lit(nivel_habilidad(e['fila'].get(origen))) for origen, _ in HABILIDADES]
             + [lit(si_no(e['fila'].get('PefistaYGraduando')))] for e in ent]
    casts = {destino: '::skill_level' for _, destino in HABILIDADES}
    casts['is_pefista_graduating'] = '::boolean'
    sql = CABECERA.format(titulo='1.4 Formulario de Habilidades (form1_4)')
    sql += sql_entregas('form1_4', ent) + '\n'
    sql += sql_respuestas('skills_assessment', cols, filas, casts)
    archivos.append(('06_form1_4_skills.sql', sql))

    # --- 1.5 Valores -------------------------------------------------------
    ent = entregas_de('form1_5')
    cols = ['report_url', 'top_values', 'score']
    filas = []
    for e in ent:
        crudo = texto(e['fila'].get('valoresFuertes'))
        valores = [v.strip() for v in crudo.split(',') if v.strip()] if crudo else []
        filas.append([clave(e), lit(texto(e['fila'].get('link'))),
                      lit(valores), lit(entero(e['fila'].get('puntuacion')))])
    sql = CABECERA.format(titulo='1.5 Valores (form1_5)')
    sql += sql_entregas('form1_5', ent) + '\n'
    sql += sql_respuestas('values_results', cols, filas,
                          {'top_values': '::text[]', 'score': '::smallint'})
    archivos.append(('07_form1_5_values.sql', sql))

    # --- 2.1 / 2.2 / 2.4 / 2.5 Reflexiones ---------------------------------
    # Los cuatro comparten la tabla `reflections`; se distinguen por form_code.
    partes_ent, partes_resp = [], []
    for form_code in ('form2_1', 'form2_2', 'form2_4', 'form2_5'):
        ent = entregas_de(form_code)
        if not ent:
            continue
        partes_ent.append(sql_entregas(form_code, ent))
        filas = [[clave(e), lit(si_no(e['fila'].get('util'))),
                  lit(texto(e['fila'].get('porque')))] for e in ent]
        partes_resp.append(sql_respuestas('reflections', ['was_useful', 'reason'],
                                          filas, {'was_useful': '::boolean'}))
    sql = CABECERA.format(titulo='2.1 FODA · 2.2 CV · 2.4 Cover Letter · 2.5 Elevator Pitch')
    sql += '\n'.join(partes_ent) + '\n' + '\n'.join(partes_resp)
    archivos.append(('08_modulo2_reflections.sql', sql))

    # --- 2.7 Indeed --------------------------------------------------------
    ent = entregas_de('form2_7')
    cols = ['positions', 'position_url_1', 'position_url_2', 'position_url_3',
            'companies', 'company_url_1', 'company_url_2', 'company_url_3']
    filas = [[clave(e),
              lit(texto(e['fila'].get('3puestos'))),
              lit(texto(e['fila'].get('link1'))),
              lit(texto(e['fila'].get('link2'))),
              lit(texto(e['fila'].get('link3'))),
              lit(texto(e['fila'].get('3companias'))),
              lit(texto(e['fila'].get('comp1'))),
              lit(texto(e['fila'].get('comp2'))),
              lit(texto(e['fila'].get('comp3')))] for e in ent]
    sql = CABECERA.format(titulo='2.7 Indeed (form2_7)')
    sql += sql_entregas('form2_7', ent) + '\n'
    sql += sql_respuestas('indeed_research', cols, filas, {})
    archivos.append(('09_form2_7_indeed.sql', sql))

    # --- Escritura ---------------------------------------------------------
    for nombre, contenido in archivos:
        (salida / nombre).write_text(contenido, encoding='utf-8')

    print(f'SQL generado en: {salida.resolve()}')
    print()
    for nombre, contenido in archivos:
        print(f'  {nombre:34} {len(contenido) // 1024:4} KB')

    print()
    print(f'Alumnos: {len(correos)}')
    print('Entregas por formulario:')
    for f in FORMULARIOS:
        print(f'  {f:10} {len(entregas_de(f))}')

    print()
    if incidencias:
        print('=' * 62)
        print('TRANSFORMACIONES APLICADAS Y DATOS DUDOSOS')
        print('=' * 62)
        for categoria in sorted(incidencias):
            total = sum(incidencias[categoria].values())
            print(f'\n{categoria} ({total}):')
            for detalle, n in incidencias[categoria].most_common(12):
                print(f'    {n:4}x  {detalle}')
    else:
        print('Sin incidencias.')

    return 0


if __name__ == '__main__':
    raise SystemExit(main())
