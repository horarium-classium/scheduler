create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create function private.is_school_member(target_school_id uuid) returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.school_members where school_id = target_school_id and user_id = auth.uid()) $$;

create function private.has_school_role(target_school_id uuid, allowed_roles public.school_role[]) returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.school_members where school_id = target_school_id and user_id = auth.uid() and role = any(allowed_roles)) $$;

revoke all on function private.is_school_member(uuid) from public;
revoke all on function private.has_school_role(uuid, public.school_role[]) from public;
grant usage on schema private to authenticated;
grant execute on function private.is_school_member(uuid) to authenticated;
grant execute on function private.has_school_role(uuid, public.school_role[]) to authenticated;

alter table public.schools enable row level security;
alter table public.profiles enable row level security;
alter table public.school_members enable row level security;
alter table public.classes enable row level security;
alter table public.time_slots enable row level security;
alter table public.subjects enable row level security;
alter table public.teachers enable row level security;
alter table public.lessons enable row level security;
alter table public.schedule_publications enable row level security;

revoke all on all tables in schema public from public, anon, authenticated;
grant select on public.schools, public.profiles, public.school_members, public.classes, public.time_slots, public.subjects, public.teachers, public.lessons, public.schedule_publications to authenticated;
grant update (display_name) on public.profiles to authenticated;
grant update (name, timezone) on public.schools to authenticated;
grant insert, update, delete on public.classes, public.subjects, public.teachers, public.lessons to authenticated;
grant insert, update, delete on public.time_slots to authenticated;

create policy profiles_select_own on public.profiles for select to authenticated using (id = auth.uid());
create policy profiles_update_own on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy schools_select_member on public.schools for select to authenticated using (private.is_school_member(id));
create policy schools_update_admin on public.schools for update to authenticated
  using (private.has_school_role(id, array['admin'::public.school_role]))
  with check (private.has_school_role(id, array['admin'::public.school_role]));

create policy members_select_admin_or_self on public.school_members for select to authenticated
  using (user_id = auth.uid() or private.has_school_role(school_id, array['admin'::public.school_role]));

create policy classes_select_member on public.classes for select to authenticated using (private.is_school_member(school_id));
create policy classes_insert_editor on public.classes for insert to authenticated with check (private.has_school_role(school_id, array['admin'::public.school_role, 'scheduler'::public.school_role]));
create policy classes_update_editor on public.classes for update to authenticated using (private.has_school_role(school_id, array['admin'::public.school_role, 'scheduler'::public.school_role])) with check (private.has_school_role(school_id, array['admin'::public.school_role, 'scheduler'::public.school_role]));
create policy classes_delete_editor on public.classes for delete to authenticated using (private.has_school_role(school_id, array['admin'::public.school_role, 'scheduler'::public.school_role]));

create policy subjects_select_member on public.subjects for select to authenticated using (private.is_school_member(school_id));
create policy subjects_insert_editor on public.subjects for insert to authenticated with check (private.has_school_role(school_id, array['admin'::public.school_role, 'scheduler'::public.school_role]));
create policy subjects_update_editor on public.subjects for update to authenticated using (private.has_school_role(school_id, array['admin'::public.school_role, 'scheduler'::public.school_role])) with check (private.has_school_role(school_id, array['admin'::public.school_role, 'scheduler'::public.school_role]));
create policy subjects_delete_editor on public.subjects for delete to authenticated using (private.has_school_role(school_id, array['admin'::public.school_role, 'scheduler'::public.school_role]));

create policy teachers_select_member on public.teachers for select to authenticated using (private.is_school_member(school_id));
create policy teachers_insert_editor on public.teachers for insert to authenticated with check (private.has_school_role(school_id, array['admin'::public.school_role, 'scheduler'::public.school_role]));
create policy teachers_update_editor on public.teachers for update to authenticated using (private.has_school_role(school_id, array['admin'::public.school_role, 'scheduler'::public.school_role])) with check (private.has_school_role(school_id, array['admin'::public.school_role, 'scheduler'::public.school_role]));
create policy teachers_delete_editor on public.teachers for delete to authenticated using (private.has_school_role(school_id, array['admin'::public.school_role, 'scheduler'::public.school_role]));

create policy lessons_select_member on public.lessons for select to authenticated using (private.is_school_member(school_id));
create policy lessons_insert_editor on public.lessons for insert to authenticated with check (private.has_school_role(school_id, array['admin'::public.school_role, 'scheduler'::public.school_role]));
create policy lessons_update_editor on public.lessons for update to authenticated using (private.has_school_role(school_id, array['admin'::public.school_role, 'scheduler'::public.school_role])) with check (private.has_school_role(school_id, array['admin'::public.school_role, 'scheduler'::public.school_role]));
create policy lessons_delete_editor on public.lessons for delete to authenticated using (private.has_school_role(school_id, array['admin'::public.school_role, 'scheduler'::public.school_role]));

create policy time_slots_select_member on public.time_slots for select to authenticated using (private.is_school_member(school_id));
create policy time_slots_insert_admin on public.time_slots for insert to authenticated with check (private.has_school_role(school_id, array['admin'::public.school_role]));
create policy time_slots_update_admin on public.time_slots for update to authenticated using (private.has_school_role(school_id, array['admin'::public.school_role])) with check (private.has_school_role(school_id, array['admin'::public.school_role]));
create policy time_slots_delete_admin on public.time_slots for delete to authenticated using (private.has_school_role(school_id, array['admin'::public.school_role]));

create policy publications_select_member on public.schedule_publications for select to authenticated using (private.is_school_member(school_id));

alter default privileges in schema public revoke all on tables from public, anon, authenticated;
alter default privileges in schema public revoke all on functions from public, anon, authenticated;
