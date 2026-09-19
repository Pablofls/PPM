-- 0015_sheet_sync.sql — Sincronización automática desde el Google Sheets
-- Ver docs/DATABASE_SCHEMA.md#sincronización-con-el-sheets y docs/SHEETS_SYNC.md
--
-- Un Apps Script con disparador horario lee las 15 hojas del Sheets y manda las
-- filas CRUDAS a `ingest_sheet_rows()`; después llama a `import_sheet_rows()`,
-- que las normaliza y las escribe en `students`, `submissions` y las tablas de
-- respuestas.
--
-- Por qué el Apps Script no normaliza nada: las transformaciones son la parte
-- difícil (sexo, niveles de habilidad, el DISC traducido por el formulario, las
-- horas que Excel convirtió en fechas) y tienen que vivir en un solo lugar
-- revisable. Este archivo es el puerto a SQL de scripts/generar_import.py; la
-- especificación de cada transformación sigue siendo docs/DATA_MAPPING.md.
--
-- Diferencia deliberada con el generador de Python: ahí los INSERT eran
-- `on conflict do nothing` porque era una carga única. Aquí una entrega que ya
-- existe se ACTUALIZA, porque el profesor corrige celdas en el Sheets y esas
-- correcciones tienen que llegar al panel.

-- ===========================================================================
-- Staging
-- ===========================================================================
-- Las filas llegan tal cual salieron del Sheets: un objeto jsonb con los
-- encabezados en español como llaves. Guardarlas crudas hace que la
-- importación sea reejecutable y que un error de normalización se pueda
-- diagnosticar contra el dato original sin volver a pedirle nada a Google.
create table sheet_rows (
  id          bigint generated always as identity primary key,
  form_code   text not null references forms (code),
  payload     jsonb not null,

  -- La huella de la fila. Se calcula en la base y no la manda el cliente: es
  -- lo que hace que mandar las 15 hojas completas cada hora no duplique nada.
  -- Editar una celda en el Sheets cambia la huella, así que la corrección
  -- entra como fila nueva y la importación la vuelve a aplicar.
  row_hash    text generated always as (md5(payload::text)) stored,

  ingested_at timestamptz not null default now(),
  imported_at timestamptz,

  unique (form_code, row_hash)
);

comment on table sheet_rows is
  'Staging crudo del Google Sheets. Lo llena el Apps Script; lo consume import_sheet_rows().';

-- Las filas pendientes son una minoría permanente: casi todas las huellas ya
-- están importadas. Índice parcial sobre justo esa minoría.
create index idx_sheet_rows_pendientes
  on sheet_rows (form_code, id)
  where imported_at is null;

-- ---------------------------------------------------------------------------
-- Bitácora de sincronizaciones
-- ---------------------------------------------------------------------------
-- Sin esto, una sincronización que deja de correr no se nota: el panel
-- simplemente se queda quieto y nadie sabe desde cuándo.
create table sheet_sync_runs (
  id          bigint generated always as identity primary key,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  detail      jsonb,                -- filas por formulario, entregas escritas
  error       text
);

comment on table sheet_sync_runs is
  'Una fila por corrida de import_sheet_rows(). Para saber si la sincronización sigue viva.';

-- ---------------------------------------------------------------------------
-- RLS (regla «Toda pantalla nace protegida y admin-only»)
-- ---------------------------------------------------------------------------
-- El staging contiene los mismos datos personales que las tablas finales.
-- El Apps Script no pasa por aquí: usa la llave service_role, que salta RLS.
alter table sheet_rows      enable row level security;
alter table sheet_sync_runs enable row level security;

create policy sheet_rows_select_admin on sheet_rows
  for select to authenticated using (public.is_admin());

create policy sheet_sync_runs_select_admin on sheet_sync_runs
  for select to authenticated using (public.is_admin());

-- ===========================================================================
-- Normalización — el puerto de scripts/generar_import.py
-- ===========================================================================
-- Todas son IMMUTABLE y sin SECURITY DEFINER: son funciones puras de un valor
-- del Sheets a un valor de la base. Se leen en el mismo orden que el generador
-- de Python para poder compararlas lado a lado.
--
-- Cómo llegan los valores: el Apps Script serializa cada celda como número,
-- booleano o texto. Las celdas de fecha las manda como texto sin zona horaria
-- ('2004-09-15T00:00:00'), en la zona del propio Sheets, que es exactamente lo
-- que openpyxl le entregaba al script de Python.

-- Minúsculas sin acentos. No se usa la extensión `unaccent` a propósito: haría
-- falta instalarla y el vocabulario de este proyecto cabe en un translate().
create or replace function public.sheet_plain(p text)
returns text language sql immutable as $$
  select translate(lower(p), 'áéíóúàèìòùäëïöüñ', 'aeiouaeiouaeioun');
$$;

-- El texto de una celda: trim, y vacío es NULL.
create or replace function public.sheet_text(p jsonb, k text)
returns text language sql immutable as $$
  select nullif(btrim(p ->> k), '');
$$;

create or replace function public.sheet_email(p jsonb, k text)
returns text language sql immutable as $$
  select lower(public.sheet_text(p, k));
$$;

-- El Sheets entrega los enteros como float (611194.0) y a veces como texto.
create or replace function public.sheet_num(p jsonb, k text)
returns numeric language sql immutable as $$
  select case
    when public.sheet_text(p, k) ~ '^-?\d+(\.\d+)?$'
    then public.sheet_text(p, k)::numeric
  end;
$$;

create or replace function public.sheet_int(p jsonb, k text)
returns integer language sql immutable as $$
  select trunc(public.sheet_num(p, k))::integer;
$$;

-- Matrículas y teléfonos: número en el origen, texto en la base. Un teléfono
-- con lada ('+52-833-155-6372') no es numérico y se conserva tal cual: el
-- formato lo puso el alumno y normalizarlo no le aporta nada al panel.
create or replace function public.sheet_ident(p jsonb, k text)
returns text language sql immutable as $$
  select coalesce(
    trunc(public.sheet_num(p, k))::text,
    public.sheet_text(p, k)
  );
$$;

-- ¿La celda es una fecha? El Apps Script las manda en ISO sin zona.
create or replace function public.sheet_is_date(p jsonb, k text)
returns boolean language sql immutable as $$
  select public.sheet_text(p, k) ~ '^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}:\d{2})?$';
$$;

-- Marca temporal -> timestamptz. El Sheets no guarda zona horaria, así que se
-- interpreta en la del campus.
create or replace function public.sheet_ts(p jsonb, k text)
returns timestamptz language sql immutable as $$
  select case
    when public.sheet_is_date(p, k)
    then (replace(public.sheet_text(p, k), 'T', ' ')::timestamp)
           at time zone 'America/Monterrey'
  end;
$$;

-- Solo la parte de fecha: el Sheets arrastra una hora espuria por la zona
-- horaria (fechaNacimiento viene con 05:00:00).
create or replace function public.sheet_date(p jsonb, k text)
returns date language sql immutable as $$
  select case
    when public.sheet_is_date(p, k)
    then left(public.sheet_text(p, k), 10)::date
  end;
$$;

-- ---------------------------------------------------------------------------
-- Enums del dominio
-- ---------------------------------------------------------------------------

create or replace function public.sheet_language(p jsonb, k text)
returns language language sql immutable as $$
  select case
    when public.sheet_text(p, k) is null then null
    when public.sheet_plain(public.sheet_text(p, k)) like 'ingl%' then 'en'
    else 'es'
  end::language;
$$;

create or replace function public.sheet_session_day(p jsonb, k text)
returns session_day language sql immutable as $$
  select case
    when public.sheet_text(p, k) is null then null
    when public.sheet_plain(public.sheet_text(p, k)) like 'mi%' then 'miercoles'
    else 'lunes'
  end::session_day;
$$;

-- 'Femenine' es la opción del formulario en inglés, no una categoría aparte.
-- Sin valor NO es NULL: es 'no_especificado', igual que en el generador.
create or replace function public.sheet_gender(p jsonb, k text)
returns gender language sql immutable as $$
  select case
    when public.sheet_plain(public.sheet_text(p, k)) like 'femen%'  then 'femenino'
    when public.sheet_plain(public.sheet_text(p, k)) like 'mascul%' then 'masculino'
    else 'no_especificado'
  end::gender;
$$;

create or replace function public.sheet_semester(p jsonb, k text)
returns smallint language sql immutable as $$
  select coalesce(
    (select n from (values
       ('1ro',1),('1er',1),('2do',2),('3ro',3),('3er',3),('4to',4),('5to',5),
       ('6to',6),('7mo',7),('8vo',8),('9no',9),('10mo',10),('11vo',11),('12vo',12)
     ) as t(clave, n)
     where t.clave = lower(public.sheet_text(p, k))),
    (select i from (select public.sheet_int(p, k) as i) s where s.i between 1 and 12)
  )::smallint;
$$;

-- Acepta Sí, Si, Yes / No, con y sin acento.
create or replace function public.sheet_bool(p jsonb, k text)
returns boolean language sql immutable as $$
  select case public.sheet_plain(public.sheet_text(p, k))
    when 'si'    then true
    when 'yes'   then true
    when 'true'  then true
    when 'no'    then false
    when 'false' then false
  end;
$$;

create or replace function public.sheet_pct(p jsonb, k text)
returns smallint language sql immutable as $$
  select (select i from (select public.sheet_int(p, k) as i) s
          where s.i between 0 and 100)::smallint;
$$;

-- ---------------------------------------------------------------------------
-- Habilidades (form1_4)
-- ---------------------------------------------------------------------------
-- El formulario existe en dos idiomas y trae typos: 'Esperto' por 'Experto'.
-- Sin la tabla de traducción, 39 de 44 alumnos quedarían sin habilidades.
--
-- El formulario permitió marcar varias casillas. Se toma la más alta: quien
-- marcó 'Intermedio, Avanzado' alcanza el avanzado. `max()` sobre skill_level
-- funciona porque el enum está declarado en orden (ver 0002_enums.sql).
create or replace function public.sheet_skill(p jsonb, k text)
returns skill_level language sql immutable as $$
  select max(t.nivel)
  from unnest(string_to_array(public.sheet_text(p, k), ',')) as parte
  cross join lateral (
    select case public.sheet_plain(btrim(parte))
      when 'novato'       then 'novato'
      when 'novice'       then 'novato'
      when 'principiante' then 'principiante'
      when 'beginner'     then 'principiante'
      when 'intermedio'   then 'intermedio'
      when 'intermediate' then 'intermedio'
      when 'avanzado'     then 'avanzado'
      when 'advanced'     then 'avanzado'
      when 'experto'      then 'experto'
      when 'expert'       then 'experto'
      when 'esperto'      then 'experto'   -- typo frecuente en el origen
    end::skill_level as nivel
  ) t;
$$;

-- ---------------------------------------------------------------------------
-- Holland (form1_1)
-- ---------------------------------------------------------------------------

-- 'R (Realista)' -> 'R'
create or replace function public.sheet_holland_type(p jsonb, k text)
returns holland_type language sql immutable as $$
  select (select l from (select upper(left(public.sheet_text(p, k), 1)) as l) s
          where s.l in ('R','I','A','S','E','C'))::holland_type;
$$;

create or replace function public.sheet_holland_code(p jsonb, k text)
returns text language sql immutable as $$
  select (select c from (
            select regexp_replace(upper(public.sheet_text(p, k)), '[^RIASEC]', '', 'g') as c
          ) s where length(s.c) = 3);
$$;

-- ---------------------------------------------------------------------------
-- MBTI (form1_2)
-- ---------------------------------------------------------------------------
-- La hoja trae 16 columnas con nombre en español, una por tipo. Solo una tiene
-- valor, y ese valor es A o T. El tipo es la columna que quedó llena.
create or replace function public.sheet_mbti_type(p jsonb)
returns mbti_type language sql immutable as $$
  select (select t.codigo from (values
      ('arquitecto','INTJ'), ('logico','INTP'), ('comandante','ENTJ'),
      ('innovador','ENTP'),  ('abogado','INFJ'), ('mediador','INFP'),
      ('protagonista','ENFJ'), ('activista','ENFP'), ('practico','ISTJ'),
      ('defensor','ISFJ'),   ('ejecutivo','ESTJ'), ('consul','ESFJ'),
      ('vistuoso','ISTP'),   ('aventurero','ISFP'), ('emprendedor','ESTP'),
      ('animador','ESFP')
    ) as t(columna, codigo)
    where public.sheet_text(p, t.columna) is not null
    limit 1)::mbti_type;
$$;

-- 'Extrovertido' y 'Extravertido' son la misma opción escrita distinto.
create or replace function public.sheet_mbti_energy(p jsonb, k text)
returns mbti_energy language sql immutable as $$
  select case public.sheet_plain(public.sheet_text(p, k))
    when 'extravertido' then 'extravertido'
    when 'extrovertido' then 'extravertido'
    when 'introvertido' then 'introvertido'
  end::mbti_energy;
$$;

create or replace function public.sheet_mbti_mind(p jsonb, k text)
returns mbti_mind language sql immutable as $$
  select case public.sheet_plain(public.sheet_text(p, k))
    when 'intuitivo'  then 'intuitivo'
    when 'observador' then 'observador'
  end::mbti_mind;
$$;

create or replace function public.sheet_mbti_nature(p jsonb, k text)
returns mbti_nature language sql immutable as $$
  select case public.sheet_plain(public.sheet_text(p, k))
    when 'pensamiento' then 'pensamiento'
    when 'emocional'   then 'emocional'
  end::mbti_nature;
$$;

create or replace function public.sheet_mbti_tactics(p jsonb, k text)
returns mbti_tactics language sql immutable as $$
  select case public.sheet_plain(public.sheet_text(p, k))
    when 'juzgador'    then 'juzgador'
    when 'prospeccion' then 'prospeccion'
  end::mbti_tactics;
$$;

create or replace function public.sheet_mbti_identity(p jsonb, k text)
returns mbti_identity language sql immutable as $$
  select case public.sheet_plain(public.sheet_text(p, k))
    when 'asertivo'  then 'asertivo'
    when 'cauteloso' then 'cauteloso'
  end::mbti_identity;
$$;

-- ---------------------------------------------------------------------------
-- DISC (form1_3) — la hoja más sucia del origen
-- ---------------------------------------------------------------------------

create or replace function public.sheet_disc_category(p text)
returns text language sql immutable as $$
  select t.canonica from (values
    ('coaches','Coaches'), ('coach','Coaches'),
    ('technicians','Technicians'), ('technician','Technicians'),
    ('networkers','Networkers'), ('networker','Networkers'),
    ('harmonizers','Harmonizers'), ('harmonizer','Harmonizers'),
    ('formalists','Formalists'), ('formalist','Formalists'),
    ('formalista','Formalists'), ('formalistas','Formalists'),
    ('fact-finders','Fact-finders'), ('fact finders','Fact-finders'),
    ('explorers','Explorers'), ('explorer','Explorers'),
    ('assessors','Assessors'), ('asessors','Assessors'), ('assessor','Assessors'),
    ('examiners','Examiners'), ('examiner','Examiners'),
    ('dynamos','Dynamos'), ('dynamo','Dynamos'),
    ('influencers','Influencers'), ('influencer','Influencers'),
    ('producers','Producers'), ('producer','Producers')
  ) as t(clave, canonica)
  where t.clave = public.sheet_plain(p);
$$;

-- Devuelve el estilo, la categoría y si la fila necesita revisión humana.
-- `needs_review` no es un detalle: es lo que le dice al profesor que ese
-- resultado lo arregló el importador y conviene confirmarlo con el alumno.
create or replace function public.sheet_disc(p jsonb)
returns table (disc_style text, disc_category text, needs_review boolean)
language plpgsql immutable as $$
declare
  estilo    text := public.sheet_text(p, 'discStyle');
  categoria text := public.sheet_text(p, 'discCategoria');
  revisar   boolean := false;
begin
  -- El traductor automático del formulario convierte el estilo 'SC' en
  -- "South Carolina" -> "Carolina del Sur".
  if public.sheet_plain(estilo) in ('carolina del sur', 'south carolina') then
    estilo := 'SC';
    revisar := true;
  end if;

  -- Algunos alumnos escriben la categoría en la columna del estilo.
  if estilo is not null and public.sheet_disc_category(estilo) is not null then
    categoria := coalesce(categoria, estilo);
    estilo := null;
    revisar := true;
  end if;

  -- …y otros escriben texto libre. 'DISC' pasa el formato pero es el nombre de
  -- la prueba, no un resultado.
  if estilo is not null and (estilo !~ '^[DISCdisc]{1,4}$' or upper(estilo) = 'DISC') then
    estilo := null;
    revisar := true;
  end if;

  -- A la inversa: el estilo capturado en la columna de categoría.
  if categoria is not null and categoria ~ '^[DISCdisc]{1,4}$' then
    estilo := coalesce(estilo, upper(categoria));
    categoria := null;
    revisar := true;
  end if;

  if categoria is not null then
    if public.sheet_disc_category(categoria) is not null then
      categoria := public.sheet_disc_category(categoria);
    else
      revisar := true;   -- se conserva tal cual para que el profesor la vea
    end if;
  end if;

  disc_style    := upper(estilo);
  disc_category := categoria;
  needs_review  := revisar;
  return next;
end;
$$;

-- ---------------------------------------------------------------------------
-- Números sucios de los apéndices y las bitácoras
-- ---------------------------------------------------------------------------

-- 'horas' del formA_1 viene mezclado: unos capturan 240, otros '240 horas' o
-- '480 horas voy todos los días 9am'. Se extrae el primer número.
create or replace function public.sheet_hours(p jsonb, k text)
returns smallint language sql immutable as $$
  select (select n from (
     select coalesce(
       public.sheet_int(p, k),
       (regexp_match(public.sheet_text(p, k), '\d+'))[1]::integer
     ) as n
   ) s where s.n between 0 and 2000)::smallint;
$$;

-- 'anioEmpresa' llega como número, como texto y a veces como fecha.
--
-- Quien escribe "2002" en una celda con formato de fecha acaba guardando
-- 1905-06-24, porque 2002 es el número de días desde el 1899-12-30, que es el
-- día cero del Sheets. Si la fecha cae antes de 1910 y su serial parece un
-- año, el año real es el serial: ninguna empresa de este formulario se fundó
-- en 1905.
create or replace function public.sheet_year(p jsonb, k text)
returns smallint language sql immutable as $$
  select (select n from (
     select case
       when public.sheet_is_date(p, k) then
         case
           when extract(year from public.sheet_date(p, k)) < 1910
            and (public.sheet_date(p, k) - date '1899-12-30') between 1800 and 2100
           then (public.sheet_date(p, k) - date '1899-12-30')
           else extract(year from public.sheet_date(p, k))::integer
         end
       else coalesce(
         public.sheet_int(p, k),
         (regexp_match(public.sheet_text(p, k), '\y(1[89]\d{2}|20\d{2})\y'))[1]::integer
       )
     end as n
   ) s where s.n between 1800 and 2100)::smallint;
$$;

-- 'horas' de form_practicas: la columna más sucia del Sheets.
--
-- Una celda con formato de fecha convierte el número de horas en una fecha de
-- 1900: 40 horas se guardan como 1900-02-08, que son 40 días después del día
-- cero del Sheets. Se deshace la conversión restando ese día cero.
--
-- Una fecha moderna en el campo de horas es captura del alumno, no un número
-- disfrazado: 2026-05-25 como serial serían 46 167 horas. Se descarta.
-- Una hora del día (07:20) cae en el día cero y da menos de 1: también se
-- descarta, igual que en el generador de Python.
create or replace function public.sheet_week_hours(p jsonb, k text)
returns numeric language sql immutable as $$
  select (select h from (
     select case
       when public.sheet_is_date(p, k) then
         (select serial from (
            select extract(epoch from
                     replace(public.sheet_text(p, k), 'T', ' ')::timestamp
                     - timestamp '1899-12-30 00:00:00') / 86400.0 as serial
          ) d
          -- < 1 es una hora del día, no un número de horas; una fecha moderna
          -- da decenas de miles y la descarta el rango de abajo.
          where d.serial >= 1)
       else coalesce(
         public.sheet_num(p, k),
         -- El paréntesis envuelve TODO el número: regexp_match devuelve los
         -- grupos de captura, así que sin él '31,20' entregaría solo ',20'.
         replace((regexp_match(public.sheet_text(p, k), '(\d+(?:[.,]\d+)?)'))[1], ',', '.')::numeric
       )
     end as h
   ) s where s.h between 0 and 500);
$$;

-- 'valoresFuertes' del form1_5: una lista separada por comas.
create or replace function public.sheet_list(p jsonb, k text)
returns text[] language sql immutable as $$
  select array_agg(btrim(x))
  from unnest(string_to_array(public.sheet_text(p, k), ',')) as x
  where btrim(x) <> '';
$$;

-- ===========================================================================
-- Motor de importación
-- ===========================================================================

-- Las filas pendientes de un formulario, ya con su llave de idempotencia.
--
-- La llave se arma EXACTAMENTE igual que en scripts/generar_import.py:
-- `form_code:correo:marca_temporal_sin_zona`. No es un detalle estético: las
-- 580 entregas que ya están en la base se importaron con esa llave, y si la
-- sincronización generara otra, cada entrega existente se duplicaría.
--
-- `distinct on` porque una celda editada en el Sheets deja dos filas
-- pendientes de la misma entrega —la vieja y la corregida— y un INSERT con
-- ON CONFLICT no puede tocar la misma fila destino dos veces. Gana la última
-- que llegó.
create or replace function public.sheet_pending(p_form_code text)
returns table (
  row_id         bigint,
  payload        jsonb,
  email          text,
  submitted_at   timestamptz,
  source_row_key text
)
language sql stable as $$
  select distinct on (k.llave)
    sr.id, sr.payload, x.email, x.ts, k.llave
  from sheet_rows sr
  cross join lateral (
    select
      public.sheet_email(sr.payload, 'idCorreo') as email,
      -- En form1_1 el encabezado está mal escrito en el origen.
      coalesce(public.sheet_ts(sr.payload, 'marcaTemporal'),
               public.sheet_ts(sr.payload, 'marcaTemproal')) as ts
  ) x
  cross join lateral (
    select p_form_code || ':' || x.email || ':' ||
           to_char(x.ts at time zone 'America/Monterrey',
                   'YYYY-MM-DD"T"HH24:MI:SS') as llave
  ) k
  where sr.form_code = p_form_code
    and sr.imported_at is null
    -- Sin correo o sin marca temporal no hay entrega que registrar: son las
    -- filas en blanco que el Sheets arrastra al final de cada hoja.
    and x.email is not null
    and x.ts is not null
  order by k.llave, sr.id desc;
$$;

-- Da de alta a los alumnos nuevos y escribe las entregas de un formulario.
-- Devuelve cuántas entregas quedaron insertadas o actualizadas.
create or replace function public.sheet_sync_submissions(p_form_code text)
returns bigint
language plpgsql as $$
declare
  n bigint;
begin
  -- La lista de alumnos se DERIVA de los correos vistos en los formularios,
  -- igual que en la importación inicial: la hoja `alumnos` no se importa.
  insert into students (institutional_email)
  select distinct v.email::citext
  from public.sheet_pending(p_form_code) v
  on conflict (institutional_email) do nothing;

  -- A diferencia del generador de Python, aquí una entrega que ya existe se
  -- actualiza: el profesor corrige celdas en el Sheets y esas correcciones
  -- tienen que llegar al panel. `submitted_at` no se toca porque es parte de
  -- la llave.
  insert into submissions (
    student_id, form_code, submitted_at, language, source_row_key,
    week_start, week_end
  )
  select
    st.id, p_form_code, v.submitted_at,
    public.sheet_language(v.payload, 'idioma'),
    v.source_row_key,
    public.sheet_date(v.payload, 'inicioSemana'),   -- solo las bitácoras
    public.sheet_date(v.payload, 'finalSemana')
  from public.sheet_pending(p_form_code) v
  join students st on st.institutional_email = v.email::citext
  on conflict (source_row_key) do update set
    language   = excluded.language,
    week_start = excluded.week_start,
    week_end   = excluded.week_end;

  get diagnostics n = row_count;
  return n;
end;
$$;

-- Borra las respuestas de las entregas que se están reimportando. El par
-- borrar-e-insertar reemplaza a un `on conflict do update` con 34 columnas en
-- el caso de `skills_assessment`, y deja una sola forma de escribir para las
-- trece tablas. La tabla destino sale del catálogo `forms`.
create or replace function public.sheet_clear_responses(p_form_code text)
returns void
language plpgsql as $$
declare
  tabla text;
begin
  select response_table into tabla from forms where code = p_form_code;
  if tabla is null then
    return;
  end if;

  execute format(
    'delete from public.%I d
       using public.sheet_pending($1) v
       join public.submissions sub on sub.source_row_key = v.source_row_key
      where d.submission_id = sub.id', tabla)
  using p_form_code;
end;
$$;

-- ---------------------------------------------------------------------------
-- import_sheet_rows() — el equivalente de main() en generar_import.py
-- ---------------------------------------------------------------------------
-- Recorre las filas pendientes del staging, formulario por formulario, y las
-- escribe normalizadas. Es idempotente y reejecutable: si algo falla a la
-- mitad, la transacción se revierte entera y las filas siguen pendientes.
create or replace function public.import_sheet_rows()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  run_id    bigint;
  detalle   jsonb := '{}'::jsonb;
  form_code text;
  n         bigint;
  omitidas  bigint;
begin
  insert into sheet_sync_runs default values returning id into run_id;

  -- 1.0 Datos Demográficos ------------------------------------------------
  n := public.sheet_sync_submissions('form1_0');
  detalle := detalle || jsonb_build_object('form1_0', n);
  perform public.sheet_clear_responses('form1_0');
  insert into demographics (
    submission_id, full_name, student_number, personal_email, birth_date,
    birth_country, gender, degree_code, semester, period_code, session_day)
  select sub.id,
    public.sheet_text (v.payload, 'nombre'),
    public.sheet_ident(v.payload, 'matricula'),
    public.sheet_email(v.payload, 'correoPersonal')::citext,
    public.sheet_date (v.payload, 'fechaNacimiento'),
    public.sheet_text (v.payload, 'paisNacimiento'),
    public.sheet_gender(v.payload, 'sexo'),
    public.sheet_text (v.payload, 'carrera'),
    public.sheet_semester(v.payload, 'semestre'),
    public.sheet_text (v.payload, 'periodo'),
    public.sheet_session_day(v.payload, 'frecuencia')
  from public.sheet_pending('form1_0') v
  join submissions sub on sub.source_row_key = v.source_row_key;

  -- 1.1 Intereses Profesionales -------------------------------------------
  n := public.sheet_sync_submissions('form1_1');
  detalle := detalle || jsonb_build_object('form1_1', n);
  perform public.sheet_clear_responses('form1_1');
  insert into holland_results (
    submission_id, first_type, second_type, third_type, holland_code,
    first_score, second_score, third_score)
  select sub.id,
    public.sheet_holland_type(v.payload, 'primerPuntaje'),
    public.sheet_holland_type(v.payload, 'segundoPuntaje'),
    public.sheet_holland_type(v.payload, 'tercerPuntaje'),
    public.sheet_holland_code(v.payload, 'codigoHolland'),
    public.sheet_int(v.payload, 'primerPuntacion')::smallint,
    public.sheet_int(v.payload, 'segundaPuntuacion')::smallint,
    public.sheet_int(v.payload, 'tercerPuntuacion')::smallint
  from public.sheet_pending('form1_1') v
  join submissions sub on sub.source_row_key = v.source_row_key;

  -- 1.2 Personalidad -------------------------------------------------------
  n := public.sheet_sync_submissions('form1_2');
  detalle := detalle || jsonb_build_object('form1_2', n);
  perform public.sheet_clear_responses('form1_2');
  insert into mbti_results (
    submission_id, report_url, mbti_type, identity, energy, mind, nature,
    tactics, energy_pct, mind_pct, nature_pct, tactics_pct, identity_pct)
  select sub.id,
    public.sheet_text(v.payload, 'link'),
    public.sheet_mbti_type(v.payload),
    public.sheet_mbti_identity(v.payload, 'identidad'),
    public.sheet_mbti_energy  (v.payload, 'energia'),
    public.sheet_mbti_mind    (v.payload, 'mente'),
    public.sheet_mbti_nature  (v.payload, 'naturaleza'),
    public.sheet_mbti_tactics (v.payload, 'tacticas'),
    public.sheet_pct(v.payload, 'energiaPorcentaje'),
    public.sheet_pct(v.payload, 'mentePorcentaje'),
    public.sheet_pct(v.payload, 'naturalezaPorcentaje'),
    public.sheet_pct(v.payload, 'tacticasPorcentaje'),
    public.sheet_pct(v.payload, 'identidadPorcentaje')
  from public.sheet_pending('form1_2') v
  join submissions sub on sub.source_row_key = v.source_row_key;

  -- 1.3 Estilos de Comportamiento ------------------------------------------
  n := public.sheet_sync_submissions('form1_3');
  detalle := detalle || jsonb_build_object('form1_3', n);
  perform public.sheet_clear_responses('form1_3');
  insert into disc_results (
    submission_id, disc_style, disc_category, explanation, needs_review)
  select sub.id, d.disc_style, d.disc_category,
    public.sheet_text(v.payload, 'explicacion'), d.needs_review
  from public.sheet_pending('form1_3') v
  join submissions sub on sub.source_row_key = v.source_row_key
  cross join lateral public.sheet_disc(v.payload) d;

  -- 1.4 Formulario de Habilidades ------------------------------------------
  n := public.sheet_sync_submissions('form1_4');
  detalle := detalle || jsonb_build_object('form1_4', n);
  perform public.sheet_clear_responses('form1_4');
  insert into skills_assessment (
    submission_id,
    written_communication, verbal_communication, nonverbal_communication,
    collaboration_teamwork, leadership, conflict_resolution, negotiation,
    active_listening, empathy, customer_service,
    excel, sheets, word, docs, powerpoint, slides, chatgpt, gemini, programming,
    critical_thinking, decision_making, time_management, planning_organization,
    research_analysis, project_management,
    creativity_innovation, flexibility_adaptability, work_ethic,
    financial_literacy, learning_ability, emotional_intelligence,
    networking, sales,
    is_pefista_graduating)
  select sub.id,
    public.sheet_skill(v.payload, 'comunicacionEscrita'),
    public.sheet_skill(v.payload, 'comunicacionVerbal'),
    public.sheet_skill(v.payload, 'comunicacionNoVerbal'),
    public.sheet_skill(v.payload, 'colabYTrabajoEquipo'),
    public.sheet_skill(v.payload, 'liderazgo'),
    public.sheet_skill(v.payload, 'resDeConflictos'),
    public.sheet_skill(v.payload, 'negociacion'),
    public.sheet_skill(v.payload, 'escuchaActiva'),
    public.sheet_skill(v.payload, 'empatia'),
    public.sheet_skill(v.payload, 'servicioCliente'),
    public.sheet_skill(v.payload, 'excel'),
    public.sheet_skill(v.payload, 'sheets'),
    public.sheet_skill(v.payload, 'word'),
    public.sheet_skill(v.payload, 'docs'),
    public.sheet_skill(v.payload, 'powerpoint'),
    public.sheet_skill(v.payload, 'slides'),
    public.sheet_skill(v.payload, 'chatGPT'),
    public.sheet_skill(v.payload, 'gemini'),
    public.sheet_skill(v.payload, 'programacion'),
    public.sheet_skill(v.payload, 'pensamientoCritico'),
    public.sheet_skill(v.payload, 'tomaDecisiones'),
    public.sheet_skill(v.payload, 'adminTiempo'),
    public.sheet_skill(v.payload, 'planeacionOrganizacion'),
    public.sheet_skill(v.payload, 'analisisInvestigacion'),
    public.sheet_skill(v.payload, 'adminProyectos'),
    public.sheet_skill(v.payload, 'creatividadInovacion'),
    public.sheet_skill(v.payload, 'flexibilidadAdaptibildad'),
    public.sheet_skill(v.payload, 'eticaTrabajo'),
    public.sheet_skill(v.payload, 'eduFinanciera'),
    public.sheet_skill(v.payload, 'habilidadAprender'),
    public.sheet_skill(v.payload, 'inteligenciaEmocional'),
    public.sheet_skill(v.payload, 'networking'),
    public.sheet_skill(v.payload, 'ventas'),
    public.sheet_bool (v.payload, 'PefistaYGraduando')
  from public.sheet_pending('form1_4') v
  join submissions sub on sub.source_row_key = v.source_row_key;

  -- 1.5 Valores -------------------------------------------------------------
  n := public.sheet_sync_submissions('form1_5');
  detalle := detalle || jsonb_build_object('form1_5', n);
  perform public.sheet_clear_responses('form1_5');
  insert into values_results (submission_id, report_url, top_values, score)
  select sub.id,
    public.sheet_text(v.payload, 'link'),
    public.sheet_list(v.payload, 'valoresFuertes'),
    public.sheet_int (v.payload, 'puntuacion')::smallint
  from public.sheet_pending('form1_5') v
  join submissions sub on sub.source_row_key = v.source_row_key;

  -- 2.1 FODA · 2.2 CV · 2.4 Cover Letter · 2.5 Elevator Pitch ---------------
  -- Los cuatro comparten la tabla `reflections`; se distinguen por form_code.
  foreach form_code in array array['form2_1', 'form2_2', 'form2_4', 'form2_5']
  loop
    n := public.sheet_sync_submissions(form_code);
    detalle := detalle || jsonb_build_object(form_code, n);
    perform public.sheet_clear_responses(form_code);
    insert into reflections (submission_id, was_useful, reason)
    select sub.id,
      public.sheet_bool(v.payload, 'util'),
      public.sheet_text(v.payload, 'porque')
    from public.sheet_pending(form_code) v
    join submissions sub on sub.source_row_key = v.source_row_key;
  end loop;

  -- 2.7 Indeed ---------------------------------------------------------------
  n := public.sheet_sync_submissions('form2_7');
  detalle := detalle || jsonb_build_object('form2_7', n);
  perform public.sheet_clear_responses('form2_7');
  insert into indeed_research (
    submission_id, positions, position_url_1, position_url_2, position_url_3,
    companies, company_url_1, company_url_2, company_url_3)
  select sub.id,
    public.sheet_text(v.payload, '3puestos'),
    public.sheet_text(v.payload, 'link1'),
    public.sheet_text(v.payload, 'link2'),
    public.sheet_text(v.payload, 'link3'),
    public.sheet_text(v.payload, '3companias'),
    public.sheet_text(v.payload, 'comp1'),
    public.sheet_text(v.payload, 'comp2'),
    public.sheet_text(v.payload, 'comp3')
  from public.sheet_pending('form2_7') v
  join submissions sub on sub.source_row_key = v.source_row_key;

  -- A.1 Carta Formal de Aceptación -------------------------------------------
  n := public.sheet_sync_submissions('formA_1');
  detalle := detalle || jsonb_build_object('formA_1', n);
  perform public.sheet_clear_responses('formA_1');
  insert into internship_applications (
    submission_id, required_hours, internship_option, restrictions,
    company_name, company_website, company_tax_id, company_founded_year,
    department, supervisor_name, supervisor_role, supervisor_email,
    supervisor_phone, schedule, is_paid, description, career_relation,
    professional_relation, company_validation)
  select sub.id,
    public.sheet_hours(v.payload, 'horas'),
    public.sheet_text (v.payload, 'opcionesPracticas'),
    public.sheet_text (v.payload, 'restricciones'),
    public.sheet_text (v.payload, 'nombreEmpresa'),
    public.sheet_text (v.payload, 'paginaEmpresa'),
    public.sheet_text (v.payload, 'rfcEmpresa'),
    public.sheet_year (v.payload, 'anioEmpresa'),
    public.sheet_text (v.payload, 'departamento'),
    public.sheet_text (v.payload, 'nombreJefe'),
    public.sheet_text (v.payload, 'puestoJefe'),
    public.sheet_email(v.payload, 'correoJefe')::citext,
    public.sheet_ident(v.payload, 'telefonoJefe'),
    public.sheet_text (v.payload, 'horario'),
    public.sheet_bool (v.payload, 'renumeracion'),
    public.sheet_text (v.payload, 'descripcion'),
    public.sheet_text (v.payload, 'relacionCarrera'),
    public.sheet_text (v.payload, 'realacionProfesional'),
    public.sheet_text (v.payload, 'empresaValida')
  from public.sheet_pending('formA_1') v
  join submissions sub on sub.source_row_key = v.source_row_key;

  -- B.1 Formulario de Inicio --------------------------------------------------
  n := public.sheet_sync_submissions('formB_1');
  detalle := detalle || jsonb_build_object('formB_1', n);
  perform public.sheet_clear_responses('formB_1');
  insert into company_profiles (
    submission_id, company_name, company_website, industry, mission, vision,
    company_values, address, work_schedule, department, supervisor_info,
    supervisor_email, supervisor_phone, activities, has_contract, salary,
    has_linkedin_profile, linkedin_connections, linkedin_url)
  select sub.id,
    public.sheet_text (v.payload, 'empresa'),
    public.sheet_text (v.payload, 'paginaEmpresa'),
    public.sheet_text (v.payload, 'giro'),
    public.sheet_text (v.payload, 'mision'),
    public.sheet_text (v.payload, 'vision'),
    public.sheet_text (v.payload, 'valores'),
    public.sheet_text (v.payload, 'direccionEmpresa'),
    public.sheet_text (v.payload, 'horarioLaboral'),
    public.sheet_text (v.payload, 'departamento'),
    public.sheet_text (v.payload, 'datosJefe'),
    public.sheet_email(v.payload, 'correoJefe')::citext,
    public.sheet_ident(v.payload, 'telefonoJefe'),
    public.sheet_text (v.payload, 'actividades'),
    public.sheet_bool (v.payload, 'contrato'),
    public.sheet_num  (v.payload, 'sueldo'),
    public.sheet_bool (v.payload, 'perfilLinkedin'),
    public.sheet_int  (v.payload, 'contactosLinkedin'),
    public.sheet_text (v.payload, 'linkedinLink')
  from public.sheet_pending('formB_1') v
  join submissions sub on sub.source_row_key = v.source_row_key;

  -- Bitácora de búsqueda ------------------------------------------------------
  -- Las dos bitácoras son los únicos formularios de respuesta múltiple: un
  -- alumno acumula hasta 10 entregas y cada una es una fila de submissions.
  n := public.sheet_sync_submissions('form_busqueda');
  detalle := detalle || jsonb_build_object('form_busqueda', n);
  perform public.sheet_clear_responses('form_busqueda');
  insert into job_search_logs (
    submission_id, activities, applications, interviews, learnings, next_steps)
  select sub.id,
    public.sheet_text(v.payload, 'actividades'),
    public.sheet_text(v.payload, 'aplicaciones'),
    public.sheet_text(v.payload, 'entrevistas'),
    public.sheet_text(v.payload, 'aprendizajes'),
    public.sheet_text(v.payload, 'siguientesPasos')
  from public.sheet_pending('form_busqueda') v
  join submissions sub on sub.source_row_key = v.source_row_key;

  -- Bitácora de prácticas -----------------------------------------------------
  n := public.sheet_sync_submissions('form_practicas');
  detalle := detalle || jsonb_build_object('form_practicas', n);
  perform public.sheet_clear_responses('form_practicas');
  insert into internship_logs (
    submission_id, activities, hours_worked, skills_practiced, proposal)
  select sub.id,
    public.sheet_text      (v.payload, 'actividades'),
    public.sheet_week_hours(v.payload, 'horas'),
    public.sheet_text      (v.payload, 'habilidades'),
    public.sheet_text      (v.payload, 'propuesta')
  from public.sheet_pending('form_practicas') v
  join submissions sub on sub.source_row_key = v.source_row_key;

  -- Cierre --------------------------------------------------------------------
  -- Se marcan TODAS las pendientes, incluidas las que se descartaron por no
  -- traer correo o marca temporal: ya se procesaron y reintentarlas cada hora
  -- solo haría crecer el trabajo.
  select count(*) into omitidas
  from sheet_rows sr
  where sr.imported_at is null
    and (public.sheet_email(sr.payload, 'idCorreo') is null
         or coalesce(public.sheet_ts(sr.payload, 'marcaTemporal'),
                     public.sheet_ts(sr.payload, 'marcaTemproal')) is null);

  update sheet_rows set imported_at = now() where imported_at is null;

  detalle := detalle || jsonb_build_object('filas_omitidas', omitidas);

  -- El staging es una bitácora de tránsito, no un archivo histórico: el dato
  -- bueno ya vive en las tablas finales y el original sigue en el Sheets.
  delete from sheet_rows where imported_at < now() - interval '30 days';

  update sheet_sync_runs
     set finished_at = now(), detail = detalle
   where id = run_id;

  return detalle;
end;
$$;

-- ===========================================================================
-- La puerta de entrada del Apps Script
-- ===========================================================================
-- Recibe un lote de filas crudas de una hoja y las deja en el staging. No
-- normaliza ni escribe en las tablas finales: eso lo hace import_sheet_rows()
-- al final de la corrida, en una sola transacción.
create or replace function public.ingest_sheet_rows(p_form_code text, p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  nuevas bigint;
begin
  -- El nombre de la hoja tiene que ser un formulario del catálogo. Una hoja
  -- nueva en el Sheets no se importa sola: primero se le hace su tabla.
  if not exists (select 1 from forms where code = p_form_code) then
    raise exception 'formulario desconocido: %', p_form_code;
  end if;

  -- `distinct` porque dos filas idénticas en la misma hoja chocarían contra la
  -- misma huella dentro del mismo INSERT, y ON CONFLICT no puede tocar la
  -- misma fila destino dos veces.
  insert into sheet_rows (form_code, payload)
  select distinct p_form_code, fila
  from jsonb_array_elements(p_rows) as fila
  on conflict (form_code, row_hash) do nothing;

  get diagnostics nuevas = row_count;

  return jsonb_build_object(
    'form_code', p_form_code,
    'recibidas', jsonb_array_length(p_rows),
    'nuevas',    nuevas);
end;
$$;

-- ---------------------------------------------------------------------------
-- Permisos
-- ---------------------------------------------------------------------------
-- El Apps Script se autentica con la llave `service_role`, que vive en las
-- propiedades del proyecto de Apps Script y en ningún otro lado: nunca en este
-- repositorio ni en el .env del front, porque salta RLS y el front corre en el
-- navegador del profesor.
--
-- Nadie con una sesión normal —ni siquiera un admin— puede llamar a estas
-- funciones desde el navegador. La importación no es una acción de la UI.
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as firma
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and (p.proname like 'sheet\_%' or p.proname in ('import_sheet_rows', 'ingest_sheet_rows'))
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.firma);
  end loop;
end;
$$;

grant execute on function public.ingest_sheet_rows(text, jsonb) to service_role;
grant execute on function public.import_sheet_rows()            to service_role;

-- ===========================================================================
-- Reconciliación de las entregas ya importadas
-- ===========================================================================
-- La importación inicial emitía la marca temporal como literal suelto
-- (`'2026-03-03 09:00:00'::timestamptz`), así que la interpretó la zona de la
-- sesión del SQL Editor, que en Supabase es UTC. La sincronización interpreta
-- la misma marca en America/Monterrey, como manda docs/DATA_MAPPING.md.
--
-- Son seis horas de diferencia. Si no se reconcilian, las 580 entregas viejas y
-- las nuevas quedan en dos convenciones distintas y el panel muestra horas que
-- no coinciden entre sí.
--
-- El arreglo no adivina el desfase: reconstruye la marca desde la propia
-- `source_row_key`, que lleva la hora tal como venía del Sheets. Por eso es
-- idempotente —volver a correrlo no mueve nada— y por eso no importa cuál era
-- la zona de la sesión que hizo la importación original.
-- La expresión se repite en el SET y en el WHERE porque un UPDATE ... FROM no
-- puede referenciar la propia tabla que actualiza desde un LATERAL.
update submissions s
   set submitted_at = (replace(right(s.source_row_key, 19), 'T', ' ')::timestamp
                         at time zone 'America/Monterrey')
 where s.source_row_key is not null
   and right(s.source_row_key, 19) ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$'
   and s.submitted_at is distinct from
       (replace(right(s.source_row_key, 19), 'T', ' ')::timestamp
          at time zone 'America/Monterrey');
