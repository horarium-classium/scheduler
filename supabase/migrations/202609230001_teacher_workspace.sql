-- Atomic school workspace reads/writes. Keep all existing RLS policies in force.
-- Serialize RPC saves and direct table writes; a stale snapshot never silently wins.
create function private.lock_teacher_workspace() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare school uuid;
begin
  if tg_table_name = 'schools' then
    if tg_op = 'DELETE' then school := old.id; else school := new.id; end if;
  else
    if tg_op = 'DELETE' then school := old.school_id; else school := new.school_id; end if;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('teacher:' || school::text, 0));
  if tg_op = 'DELETE' then return old; else return new; end if;
end $$;
revoke all on function private.lock_teacher_workspace() from public, anon, authenticated;
create trigger teacher_workspace_lock before insert or update or delete on public.classes for each row execute function private.lock_teacher_workspace();
create trigger teacher_workspace_lock before insert or update or delete on public.time_slots for each row execute function private.lock_teacher_workspace();
create trigger teacher_workspace_lock before insert or update or delete on public.subjects for each row execute function private.lock_teacher_workspace();
create trigger teacher_workspace_lock before insert or update or delete on public.teachers for each row execute function private.lock_teacher_workspace();
create trigger teacher_workspace_lock before insert or update or delete on public.lessons for each row execute function private.lock_teacher_workspace();
create trigger teacher_workspace_lock before insert or update or delete on public.schools for each row execute function private.lock_teacher_workspace();
create trigger teacher_workspace_lock before insert or update or delete on public.school_members for each row execute function private.lock_teacher_workspace();

create function public.teacher_workspace_read(p_school uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('data', snapshot, 'version', md5(snapshot::text))
  from (select jsonb_build_object(
    'school', (select to_jsonb(s) from public.schools s where s.id = p_school),
    'classes', coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from public.classes t where t.school_id = p_school), '[]'::jsonb),
    'time_slots', coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from public.time_slots t where t.school_id = p_school), '[]'::jsonb),
    'subjects', coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from public.subjects t where t.school_id = p_school), '[]'::jsonb),
    'teachers', coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from public.teachers t where t.school_id = p_school), '[]'::jsonb),
    'lessons', coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from public.lessons t where t.school_id = p_school), '[]'::jsonb)
  ) as snapshot) q
  where private.is_school_member(p_school);
$$;
revoke all on function public.teacher_workspace_read(uuid) from public, anon;
grant execute on function public.teacher_workspace_read(uuid) to authenticated;

create function public.teacher_workspace_save(p_school uuid, p_version text, p_changes jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare current_snapshot jsonb; change jsonb; row_data jsonb; affected integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('teacher:' || p_school::text, 0));
  if not private.is_school_member(p_school) then
    raise exception using errcode = '42501', message = 'school_membership_required';
  end if;
  current_snapshot := public.teacher_workspace_read(p_school);
  if p_version is null or p_version is distinct from current_snapshot->>'version' then
    raise exception using errcode = '40001', message = 'workspace_conflict';
  end if;
  if jsonb_typeof(p_changes) is distinct from 'array' or jsonb_array_length(p_changes) > 1000 then
    raise exception using errcode = '22023', message = 'invalid_workspace_changes';
  end if;
  for change in select value from jsonb_array_elements(p_changes) loop
    row_data := change->'row';
    if jsonb_typeof(row_data) is distinct from 'object' then
      raise exception using errcode = '22023', message = 'invalid_workspace_row';
    end if;
    case change->>'table'
    when 'classes' then
      case change->>'op'
      when 'insert' then
        insert into public.classes(id, school_id, name, sort_order) values ((row_data->>'id')::uuid, p_school, (row_data->>'name')::text, (row_data->>'sort_order')::integer);
      when 'delete' then
        delete from public.classes where id = (row_data->>'id')::uuid and school_id = p_school;
      when 'update' then
        update public.classes set name = (row_data->>'name')::text, sort_order = (row_data->>'sort_order')::integer where id = (row_data->>'id')::uuid and school_id = p_school;
      else raise exception using errcode = '22023', message = 'invalid_workspace_operation';
      end case;
    when 'time_slots' then
      case change->>'op'
      when 'insert' then
        insert into public.time_slots(id, school_id, start_time, end_time, sort_order) values ((row_data->>'id')::uuid, p_school, (row_data->>'start_time')::time, (row_data->>'end_time')::time, (row_data->>'sort_order')::integer);
      when 'delete' then
        delete from public.time_slots where id = (row_data->>'id')::uuid and school_id = p_school;
      when 'update' then
        update public.time_slots set start_time = (row_data->>'start_time')::time, end_time = (row_data->>'end_time')::time, sort_order = (row_data->>'sort_order')::integer where id = (row_data->>'id')::uuid and school_id = p_school;
      else raise exception using errcode = '22023', message = 'invalid_workspace_operation';
      end case;
    when 'subjects' then
      case change->>'op'
      when 'insert' then
        insert into public.subjects(id, school_id, name, color) values ((row_data->>'id')::uuid, p_school, (row_data->>'name')::text, (row_data->>'color')::text);
      when 'delete' then
        delete from public.subjects where id = (row_data->>'id')::uuid and school_id = p_school;
      when 'update' then
        update public.subjects set name = (row_data->>'name')::text, color = (row_data->>'color')::text where id = (row_data->>'id')::uuid and school_id = p_school;
      else raise exception using errcode = '22023', message = 'invalid_workspace_operation';
      end case;
    when 'teachers' then
      case change->>'op'
      when 'insert' then
        insert into public.teachers(id, school_id, name) values ((row_data->>'id')::uuid, p_school, (row_data->>'name')::text);
      when 'delete' then
        delete from public.teachers where id = (row_data->>'id')::uuid and school_id = p_school;
      when 'update' then
        update public.teachers set name = (row_data->>'name')::text where id = (row_data->>'id')::uuid and school_id = p_school;
      else raise exception using errcode = '22023', message = 'invalid_workspace_operation';
      end case;
    when 'lessons' then
      case change->>'op'
      when 'insert' then
        insert into public.lessons(id, school_id, class_id, weekday, time_slot_id, subject_id, teacher_id, comment) values ((row_data->>'id')::uuid, p_school, (row_data->>'class_id')::uuid, (row_data->>'weekday')::smallint, (row_data->>'time_slot_id')::uuid, (row_data->>'subject_id')::uuid, (row_data->>'teacher_id')::uuid, (row_data->>'comment')::text);
      when 'delete' then
        delete from public.lessons where id = (row_data->>'id')::uuid and school_id = p_school;
      when 'update' then
        update public.lessons set class_id = (row_data->>'class_id')::uuid, weekday = (row_data->>'weekday')::smallint, time_slot_id = (row_data->>'time_slot_id')::uuid, subject_id = (row_data->>'subject_id')::uuid, teacher_id = (row_data->>'teacher_id')::uuid, comment = (row_data->>'comment')::text where id = (row_data->>'id')::uuid and school_id = p_school;
      else raise exception using errcode = '22023', message = 'invalid_workspace_operation';
      end case;
    when 'schools' then
      case change->>'op'
      when 'update' then
        update public.schools set name = (row_data->>'name')::text, timezone = (row_data->>'timezone')::text where id = (row_data->>'id')::uuid and id = p_school;
      else raise exception using errcode = '22023', message = 'invalid_workspace_operation';
      end case;
    else raise exception using errcode = '22023', message = 'invalid_workspace_table';
    end case;
    get diagnostics affected = row_count;
    if affected <> 1 then
      raise exception using errcode = '42501', message = 'workspace_row_not_writable';
    end if;
  end loop;
  return public.teacher_workspace_read(p_school);
end $$;
revoke all on function public.teacher_workspace_save(uuid, text, jsonb) from public, anon;
grant execute on function public.teacher_workspace_save(uuid, text, jsonb) to authenticated;
