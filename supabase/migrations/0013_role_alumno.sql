-- 0013_role_alumno.sql — El rol `alumno`
-- Ver docs/DATABASE_SCHEMA.md#autenticación-y-roles y docs/AUTH.md
--
-- Va SOLO en su archivo a propósito: PostgreSQL no permite usar un valor de enum
-- recién agregado dentro de la misma transacción que lo agregó. Si esta línea
-- viviera junto al resto del alta de cuentas (0014), el `role = 'alumno'` de ese
-- archivo fallaría con:
--
--   unsafe use of new value "alumno" of enum type app_role
--
-- Por eso son dos pegadas al SQL Editor, en orden: primero esta, luego 0014.

alter type app_role add value if not exists 'alumno';
