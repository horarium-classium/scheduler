-- Allow school schedulers to manage time slots, preserving school isolation.
drop policy time_slots_insert_admin on public.time_slots;
create policy time_slots_insert_editor on public.time_slots for insert to authenticated
  with check (private.has_school_role(school_id, array['admin'::public.school_role, 'scheduler'::public.school_role]));
drop policy time_slots_update_admin on public.time_slots;
create policy time_slots_update_editor on public.time_slots for update to authenticated
  using (private.has_school_role(school_id, array['admin'::public.school_role, 'scheduler'::public.school_role]))
  with check (private.has_school_role(school_id, array['admin'::public.school_role, 'scheduler'::public.school_role]));
drop policy time_slots_delete_admin on public.time_slots;
create policy time_slots_delete_editor on public.time_slots for delete to authenticated
  using (private.has_school_role(school_id, array['admin'::public.school_role, 'scheduler'::public.school_role]));
