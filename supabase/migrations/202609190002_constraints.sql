create unique index classes_school_name_key on public.classes (school_id, lower(btrim(name)));
create unique index subjects_school_name_key on public.subjects (school_id, lower(btrim(name)));

alter table public.subjects add constraint subjects_color_format_check check (color ~ '^#[0-9A-Fa-f]{6}$');
alter table public.lessons add constraint lessons_weekday_check check (weekday between 1 and 6);
alter table public.lessons add constraint lessons_cell_key unique (school_id, class_id, weekday, time_slot_id);
create unique index lessons_teacher_slot_key on public.lessons (school_id, teacher_id, weekday, time_slot_id) where teacher_id is not null;
alter table public.time_slots add constraint time_slots_order_check check (start_time < end_time);
alter table public.time_slots add constraint time_slots_end_before_midnight_check check (end_time <= '23:59');
alter table public.time_slots add constraint time_slots_minute_precision_check check (extract(second from start_time) = 0 and extract(second from end_time) = 0);
alter table public.time_slots add constraint time_slots_no_overlap exclude using gist (
  school_id with =,
  int4range((extract(epoch from start_time) / 60)::integer, (extract(epoch from end_time) / 60)::integer, '[)') with &&
);
alter table public.schedule_publications add constraint publications_revision_check check (revision > 0);
alter table public.schedule_publications add constraint publications_format_version_check check (format_version > 0);
alter table public.schedule_publications add constraint publications_payload_object_check check (jsonb_typeof(payload) = 'object');

create function public.is_valid_timezone(candidate text) returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from pg_catalog.pg_timezone_names where name = candidate) $$;
revoke all on function public.is_valid_timezone(text) from public;
alter table public.schools add constraint schools_timezone_check check (public.is_valid_timezone(timezone));

create function public.set_updated_at() returns trigger
language plpgsql set search_path = ''
as $$ begin new.updated_at = now(); return new; end $$;

create trigger schools_set_updated_at before update on public.schools for each row execute function public.set_updated_at();
create trigger profiles_set_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger classes_set_updated_at before update on public.classes for each row execute function public.set_updated_at();
create trigger time_slots_set_updated_at before update on public.time_slots for each row execute function public.set_updated_at();
create trigger subjects_set_updated_at before update on public.subjects for each row execute function public.set_updated_at();
create trigger teachers_set_updated_at before update on public.teachers for each row execute function public.set_updated_at();
create trigger lessons_set_updated_at before update on public.lessons for each row execute function public.set_updated_at();

create function public.protect_immutable_columns() returns trigger
language plpgsql set search_path = ''
as $$
declare column_name text;
begin
  foreach column_name in array tg_argv loop
    if to_jsonb(new) -> column_name is distinct from to_jsonb(old) -> column_name then
      raise exception using errcode = '23514', constraint = tg_table_name || '_' || column_name || '_immutable', message = column_name || ' cannot be changed';
    end if;
  end loop;
  return new;
end $$;

create trigger schools_immutable before update on public.schools for each row execute function public.protect_immutable_columns('id', 'created_at');
create trigger profiles_immutable before update on public.profiles for each row execute function public.protect_immutable_columns('id', 'created_at');
create trigger classes_immutable before update on public.classes for each row execute function public.protect_immutable_columns('id', 'school_id', 'public_id', 'created_at');
create trigger time_slots_immutable before update on public.time_slots for each row execute function public.protect_immutable_columns('id', 'school_id', 'created_at');
create trigger subjects_immutable before update on public.subjects for each row execute function public.protect_immutable_columns('id', 'school_id', 'created_at');
create trigger teachers_immutable before update on public.teachers for each row execute function public.protect_immutable_columns('id', 'school_id', 'created_at');
create trigger lessons_immutable before update on public.lessons for each row execute function public.protect_immutable_columns('id', 'school_id', 'created_at');

create function public.enforce_active_lesson_links() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.class_id is distinct from old.class_id then
    if exists (select 1 from public.classes where school_id = new.school_id and id = new.class_id and not active) then raise exception using errcode = '23514', constraint = 'lessons_active_class_check', message = 'class must be active'; end if;
  end if;
  if tg_op = 'INSERT' or new.subject_id is distinct from old.subject_id then
    if exists (select 1 from public.subjects where school_id = new.school_id and id = new.subject_id and not active) then raise exception using errcode = '23514', constraint = 'lessons_active_subject_check', message = 'subject must be active'; end if;
  end if;
  if new.teacher_id is not null and (tg_op = 'INSERT' or new.teacher_id is distinct from old.teacher_id) then
    if exists (select 1 from public.teachers where school_id = new.school_id and id = new.teacher_id and not active) then raise exception using errcode = '23514', constraint = 'lessons_active_teacher_check', message = 'teacher must be active'; end if;
  end if;
  return new;
end $$;
create trigger lessons_active_links before insert or update on public.lessons for each row execute function public.enforce_active_lesson_links();

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = ''
as $$ begin insert into public.profiles(id, display_name) values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', '')); return new; end $$;
revoke all on function public.handle_new_user() from public;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
