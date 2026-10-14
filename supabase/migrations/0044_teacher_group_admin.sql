-- 0044_teacher_group_admin.sql
-- Maestros y coordinadores administran sus grupos y alumnos.
--   1. Acceso por defecto a «Alumnos registrados» y «Administrar grupos»
--      (Puede editar), acotado por RLS a sus grupos (0036/0038).
--   2. v_students_directory: nombre del maestro, derivado de groups.teacher_id
--      (no se guarda nada nuevo: 4FN intacta).
--   3. admin_register_students(): `maestro_id` opcional por fila, para
--      distinguir grupos con el mismo periodo + día + idioma de maestros distintos.

insert into role_screen_access (role_code, screen_code, access)
select r.code, s.code, 'edicion'
from (values ('maestro'), ('coordinador')) r(code)
cross join (values ('alumnos_registrados'), ('grupos')) s(code)
on conflict (role_code, screen_code) do update set access = excluded.access;

create or replace view v_students_directory as
select
  s.id   as student_id,
  s.institutional_email,
  d.full_name,
  coalesce(d.student_number, s.student_number) as student_number,
  d.personal_email,
  d.birth_date,
  d.birth_country,
  d.gender,
  d.degree_code,
  d.semester,
  coalesce(ce.period_code, d.period_code)      as period_code,
  coalesce(ce.session_day, d.session_day)      as session_day,
  coalesce(ce.language, d.sub_language)        as language,
  ce.group_id,
  ce.teacher_id,
  nullif(concat_ws(' ', tp.first_name, tp.last_name), '') as teacher_name
from students s
left join lateral (
  select dm.*, sub.language as sub_language
  from submissions sub
  join demographics dm on dm.submission_id = sub.id
  where sub.student_id = s.id
    and sub.form_code = 'form1_0'
  order by sub.submitted_at desc
  limit 1
) d on true
left join v_current_enrollments ce on ce.student_id = s.id
left join profiles tp on tp.id = ce.teacher_id;

alter view v_students_directory set (security_invoker = on);

create or replace function public.admin_register_students(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  fila      jsonb;
  n         int := 0;
  salida    jsonb := '[]'::jsonb;
  v_correo  text;
  v_mat     text;
  v_per     text;
  v_freq    text;
  v_idi     text;
  v_freq_n  session_day;
  v_idi_n   language;
  v_grupos  uuid[];
  v_grupo   uuid;
  v_maestro uuid;
  v_actual  uuid;
  s_id      uuid;
  s_mat     text;
  d_mat     text;
  resultado text;
  cuentas   jsonb := '{}'::jsonb;
  cuenta    record;
  i         int;
begin
  if not (public.is_admin() or public.can_edit_screen('alumnos_registrados')) then
    raise exception 'No tienes permiso para registrar alumnos';
  end if;

  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Se esperaba un arreglo de alumnos';
  end if;
  if jsonb_array_length(p_rows) > 500 then
    raise exception 'Máximo 500 alumnos por importación';
  end if;

  for fila in select * from jsonb_array_elements(p_rows)
  loop
    n := n + 1;
    resultado := null;
    d_mat := null;
    s_id := null;
    s_mat := null;
    v_actual := null;
    v_correo := lower(btrim(coalesce(fila->>'correo', '')));

    begin
      v_mat  := btrim(coalesce(fila->>'matricula', ''));
      v_per  := upper(btrim(coalesce(fila->>'periodo', '')));
      v_freq := lower(translate(btrim(coalesce(fila->>'frecuencia', '')), 'áéíóúÁÉÍÓÚ', 'aeiouaeiou'));
      v_maestro := nullif(btrim(coalesce(fila->>'maestro_id', '')), '')::uuid;
      v_idi  := lower(translate(btrim(coalesce(fila->>'idioma', '')), 'áéíóúÁÉÍÓÚ', 'aeiouaeiou'));

      if v_correo !~ '^[^@[:space:]]+@([a-z0-9-]+\.)*udem\.edu(\.mx)?$' then
        raise exception 'correo institucional inválido';
      end if;
      if v_mat !~ '^[A-Za-z0-9]+$' then
        raise exception 'matrícula inválida';
      end if;
      if v_per !~ '^[A-Z]{2}-[0-9]{2}$' then
        raise exception 'periodo inválido (formato PR-26)';
      end if;

      v_freq_n := case v_freq
        when 'lunes' then 'lunes'::session_day
        when 'miercoles' then 'miercoles'::session_day
        else null end;
      if v_freq_n is null then
        raise exception 'frecuencia inválida (lunes o miércoles)';
      end if;

      v_idi_n := case v_idi
        when 'es' then 'es'::language
        when 'espanol' then 'es'::language
        when 'en' then 'en'::language
        when 'ingles' then 'en'::language
        when 'english' then 'en'::language
        else null end;
      if v_idi_n is null then
        raise exception 'idioma inválido (español o inglés)';
      end if;

      -- Quien no es admin solo inscribe en los grupos que le tocan (0038).
      select array_agg(g.id) into v_grupos
      from groups g
      where g.period_code = v_per
        and g.session_day = v_freq_n
        and g.language    = v_idi_n
        and (v_maestro is null or g.teacher_id = v_maestro)
        and (public.is_admin() or g.id in (select public.visible_group_ids()));

      if v_grupos is null then
        -- Quien no es admin puede toparse con un grupo que sí existe pero es
        -- de otro maestro: decirle «no existe» lo mandaría a crearlo de nuevo.
        if not public.is_admin() and exists (
          select 1 from groups g
          where g.period_code = v_per and g.session_day = v_freq_n and g.language = v_idi_n
            and (v_maestro is null or g.teacher_id = v_maestro)
        ) then
          raise exception 'el grupo % · % · % es de otro maestro', v_per, v_freq_n, v_idi_n;
        end if;
        raise exception 'no existe un grupo % · % · %: créalo en Grupos',
          v_per, v_freq_n, v_idi_n;
      end if;
      if array_length(v_grupos, 1) > 1 then
        raise exception 'hay varios grupos % · % · % (de distintos maestros): indica el maestro',
          v_per, v_freq_n, v_idi_n;
      end if;
      v_grupo := v_grupos[1];

      select st.id, st.student_number into s_id, s_mat
      from students st where st.institutional_email = v_correo::citext;

      if found then
        -- Si el alumno ya contestó el 1.0, su matrícula es la que vale.
        select dm.student_number into d_mat
        from submissions sub
        join demographics dm on dm.submission_id = sub.id
        where sub.student_id = s_id and sub.form_code = 'form1_0'
        order by sub.submitted_at desc
        limit 1;
        d_mat := nullif(btrim(d_mat), '');
        if d_mat is not null and d_mat <> v_mat then
          raise exception 'el alumno ya tiene otra matrícula en el 1.0';
        end if;
      end if;

      -- La matrícula no puede ser de otro alumno, la tenga en students o en el 1.0.
      if exists (
        select 1 from public.v_students_directory dir
        where dir.student_number = v_mat
          and dir.student_id is distinct from s_id
      ) then
        raise exception 'la matrícula ya pertenece a otro alumno';
      end if;

      if s_id is null then
        insert into students (institutional_email, student_number)
        values (v_correo::citext, v_mat)
        returning id into s_id;
        resultado := 'creado';
      elsif s_mat is distinct from v_mat then
        update students set student_number = v_mat, updated_at = now() where id = s_id;
        resultado := 'actualizado';
      else
        resultado := 'sin cambios';
      end if;

      select e.group_id into v_actual
      from student_enrollments e
      join groups g on g.id = e.group_id
      where e.student_id = s_id and g.period_code = v_per;

      -- Sacar a un alumno del grupo de otro maestro no es «registrarlo».
      if v_actual is not null and not public.is_admin()
         and v_actual not in (select public.visible_group_ids()) then
        raise exception 'el alumno ya está en un grupo de otro maestro';
      end if;

      if v_actual is null then
        insert into student_enrollments (student_id, group_id)
        values (s_id, v_grupo);
        if resultado = 'sin cambios' then resultado := 'actualizado'; end if;
      elsif v_actual <> v_grupo then
        update student_enrollments
           set group_id = v_grupo
         where student_id = s_id and group_id = v_actual;
        if resultado = 'sin cambios' then resultado := 'actualizado'; end if;
      end if;

    exception
      when unique_violation then
        resultado := 'error: dato repetido (correo o matrícula)';
      when others then
        resultado := 'error: ' || sqlerrm;
    end;

    salida := salida || jsonb_build_object(
      'fila', n, 'correo', v_correo, 'resultado', resultado, 'cuenta', null);
  end loop;

  -- Un solo pase de alta de cuentas para todos (idempotente, 0014).
  for cuenta in select * from public.create_student_accounts()
  loop
    cuentas := cuentas || jsonb_build_object(lower(cuenta.student_email), cuenta.outcome);
  end loop;

  for i in 0 .. jsonb_array_length(salida) - 1
  loop
    if salida->i->>'resultado' not like 'error:%' then
      salida := jsonb_set(salida, array[i::text, 'cuenta'],
        coalesce(cuentas->(salida->i->>'correo'), 'null'::jsonb) );
    end if;
  end loop;

  return salida;
end;
$$;

revoke execute on function public.admin_register_students(jsonb) from public, anon;
grant execute on function public.admin_register_students(jsonb) to authenticated;
