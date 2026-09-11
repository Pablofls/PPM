-- 0001_auth.sql — Autenticación, roles y permisos
-- Ver docs/DATABASE_SCHEMA.md y docs/AUTH.md
--
-- Va PRIMERO en la serie a propósito: las políticas de todas las tablas de datos
-- dependen de la función is_admin() que se define aquí.
--
-- El login es correo + contraseña contra Supabase Auth. Supabase administra el
-- esquema `auth` y el hash de las contraseñas; este proyecto NUNCA guarda ni ve
-- una contraseña.

create extension if not exists citext;
create extension if not exists pgcrypto;

-- Roles de la aplicación.
-- 'pendiente' es el rol con el que nace todo usuario nuevo: puede iniciar sesión
-- pero no ve ningún dato. Se agregan roles con ALTER TYPE ... ADD VALUE.
create type app_role as enum ('admin', 'pendiente');

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
-- Supabase administra auth.users y no debemos modificar esa tabla. El patrón
-- estándar es una tabla propia ligada por id, donde vive lo que sí es nuestro:
-- el rol y el estado de la cuenta.
create table profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      citext not null unique,
  full_name  text,
  role       app_role not null default 'pendiente',
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_profiles_admins on profiles (id) where role = 'admin';

-- ---------------------------------------------------------------------------
-- is_admin()
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER no es opcional: esta función se llama desde la política de
-- profiles, y consultar profiles con los permisos de quien llama volvería a
-- disparar esa misma política, provocando recursión infinita. SECURITY DEFINER
-- ejecuta la consulta con los permisos del dueño de la función, saltándose RLS,
-- y corta el ciclo.
--
-- `set search_path = ''` evita que alguien anteponga un esquema propio y
-- suplante public.profiles.
create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role = 'admin'
      and is_active
  );
$$;

revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- Alta automática del perfil
-- ---------------------------------------------------------------------------
-- Cuando alguien se registra, Supabase inserta en auth.users y este trigger le
-- crea el perfil con rol 'pendiente'. Nadie puede darse permisos a sí mismo:
-- promover a admin es un UPDATE que solo otro admin puede hacer.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    nullif(new.raw_user_meta_data ->> 'full_name', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Protección del campo `role`
-- ---------------------------------------------------------------------------
-- RLS controla qué filas se pueden modificar, pero no qué columnas. Sin esto, un
-- usuario con permiso de editar su propio perfil podría ascenderse a admin.
create function public.guard_profile_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role is distinct from old.role then
    -- auth.uid() nulo significa que no hay sesión de usuario: la sentencia viene
    -- del SQL Editor o de service_role, que son contextos administrativos. Es la
    -- única forma de crear el primer admin, cuando todavía no existe ninguno que
    -- pueda autorizar el cambio. Un usuario autenticado SIEMPRE tiene uid, así
    -- que esta rama no le sirve a nadie para escalar privilegios desde la app.
    if (select auth.uid()) is not null then
      if not public.is_admin() then
        raise exception 'Solo un administrador puede cambiar roles';
      end if;
      -- Evita que un admin se degrade y deje el panel sin administradores.
      if old.id = (select auth.uid()) then
        raise exception 'Un administrador no puede cambiar su propio rol';
      end if;
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_guard_role
  before update on profiles
  for each row
  execute function public.guard_profile_role();

-- ---------------------------------------------------------------------------
-- RLS de profiles
-- ---------------------------------------------------------------------------
alter table profiles enable row level security;

-- Cada quien ve su propio perfil (lo necesita para saber su rol al iniciar
-- sesión); los administradores ven todos.
create policy profiles_select on profiles
  for select to authenticated
  using (id = (select auth.uid()) or public.is_admin());

-- Cada quien edita su propio perfil; los administradores, cualquiera.
-- El cambio de `role` lo sigue bloqueando el trigger de arriba.
create policy profiles_update on profiles
  for update to authenticated
  using (id = (select auth.uid()) or public.is_admin())
  with check (id = (select auth.uid()) or public.is_admin());

create policy profiles_delete on profiles
  for delete to authenticated
  using (public.is_admin());

-- No hay política de INSERT a propósito: los perfiles los crea únicamente el
-- trigger handle_new_user(), que corre como SECURITY DEFINER.
