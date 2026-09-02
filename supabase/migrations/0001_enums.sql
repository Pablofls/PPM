-- 0001_enums.sql — Extensiones y tipos enumerados
-- Ver docs/DATABASE_SCHEMA.md#tipos-enumerados
--
-- Los valores en español provienen de los formularios de Google. La normalización
-- desde el Sheets (Femenino/Femenine, Extravertido/Extrovertido, Sí/Si) está
-- especificada en docs/DATA_MAPPING.md.

create extension if not exists citext;
create extension if not exists pgcrypto;

-- Idioma en que el alumno respondió el formulario. Origen: 'Español' / 'Inglés'.
create type language as enum ('es', 'en');

-- Grupo de sesión del alumno. Origen: columna 'frecuencia'.
create type session_day as enum ('lunes', 'miercoles');

-- Origen: columna 'sexo'. 'Femenine' (opción del formulario en inglés) mapea a 'femenino'.
create type gender as enum ('femenino', 'masculino', 'otro', 'no_especificado');

-- Escala del formulario 1.4. EL ORDEN IMPORTA: define <, >, ORDER BY y max().
-- De menor a mayor dominio.
create type skill_level as enum ('novato', 'principiante', 'intermedio', 'avanzado', 'experto');

-- Inventario Holland (RIASEC).
-- R Realista · I Investigadora · A Artística · S Social · E Emprendedora · C Convencional
create type holland_type as enum ('R', 'I', 'A', 'S', 'E', 'C');

-- Los 16 tipos MBTI. En el Sheets vienen como 16 columnas con nombre en español;
-- el mapeo columna -> tipo está en docs/DATA_MAPPING.md#form1_2--mbti_results.
create type mbti_type as enum (
  'INTJ', 'INTP', 'ENTJ', 'ENTP',
  'INFJ', 'INFP', 'ENFJ', 'ENFP',
  'ISTJ', 'ISFJ', 'ESTJ', 'ESFJ',
  'ISTP', 'ISFP', 'ESTP', 'ESFP'
);

-- Las cinco dimensiones MBTI.
create type mbti_energy   as enum ('extravertido', 'introvertido');
create type mbti_mind     as enum ('intuitivo', 'observador');
create type mbti_nature   as enum ('pensamiento', 'emocional');
create type mbti_tactics  as enum ('juzgador', 'prospeccion');
create type mbti_identity as enum ('asertivo', 'cauteloso');

-- Estado de entrega calculado en la vista v_submission_status.
-- 'sin_fecha' = no hay deadline configurado para ese formulario y periodo.
create type submission_state as enum ('a_tiempo', 'tarde', 'pendiente', 'sin_fecha');
