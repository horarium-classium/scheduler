-- School metadata is part of the publication. Its CHECK validator must be
-- executable by the authenticated writer; school UPDATE is still admin-only RLS.
grant execute on function public.is_valid_timezone(text) to authenticated;

-- Class publications are immutable to API clients. Private draft data is never
-- returned by the anonymous endpoint. Use the same lock as every workspace write.
alter table public.schedule_publications add column draft_snapshot jsonb;

create function private.publication_source(p_school uuid, p_class uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'school', jsonb_build_object('name', s.name, 'timezone', s.timezone),
    'className', c.name, 'classActive', c.active, 'publicId', c.public_id,
    'lessons', coalesce((select jsonb_agg(jsonb_build_object(
      'weekday', l.weekday, 'start', to_char(t.start_time, 'HH24:MI'),
      'end', to_char(t.end_time, 'HH24:MI'), 'lesson', sub.name,
      'subjectId', sub.id, 'color', sub.color, 'subjectActive', sub.active, 'teacherId', l.teacher_id,
      'teacherName', teacher.name, 'teacherActive', teacher.active, 'comment', l.comment
    ) order by l.weekday, t.start_time)
    from public.lessons l
    join public.time_slots t on t.school_id = l.school_id and t.id = l.time_slot_id
    join public.subjects sub on sub.school_id = l.school_id and sub.id = l.subject_id
    left join public.teachers teacher on teacher.school_id = l.school_id and teacher.id = l.teacher_id
    where l.school_id = p_school and l.class_id = p_class), '[]'::jsonb)
  ) from public.classes c join public.schools s on s.id = c.school_id
  where c.school_id = p_school and c.id = p_class;
$$;
revoke all on function private.publication_source(uuid, uuid) from public, anon;
grant execute on function private.publication_source(uuid, uuid) to authenticated;

-- Preserve the existing draft version contract. Publishing does not invalidate a
-- pending save, but all reads/saves now include real per-class publication status.
create or replace function public.teacher_workspace_read(p_school uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('data', snapshot, 'version', md5(snapshot::text),
    'publications', coalesce((select jsonb_agg(jsonb_build_object(
      'class_id', c.id, 'public_id', c.public_id, 'revision', p.revision,
      'published_at', p.published_at,
      'is_current', coalesce(p.draft_snapshot = private.publication_source(p_school, c.id), false)
    ) order by c.id)
    from public.classes c left join lateral (
      select revision, published_at, draft_snapshot from public.schedule_publications
      where school_id = p_school and class_id = c.id order by revision desc limit 1
    ) p on true where c.school_id = p_school), '[]'::jsonb))
  from (select jsonb_build_object(
    'school', (select to_jsonb(s) from public.schools s where s.id = p_school),
    'classes', coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from public.classes t where t.school_id = p_school), '[]'::jsonb),
    'time_slots', coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from public.time_slots t where t.school_id = p_school), '[]'::jsonb),
    'subjects', coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from public.subjects t where t.school_id = p_school), '[]'::jsonb),
    'teachers', coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from public.teachers t where t.school_id = p_school), '[]'::jsonb),
    'lessons', coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from public.lessons t where t.school_id = p_school), '[]'::jsonb)
  ) as snapshot) q where private.is_school_member(p_school);
$$;

create function public.publish_schedule(p_school uuid, p_class uuid, p_version text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare draft jsonb; current_workspace jsonb; latest public.schedule_publications;
  public_class uuid; schedule jsonb;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('teacher:' || p_school::text, 0));
  if not private.has_school_role(p_school, array['admin'::public.school_role, 'scheduler'::public.school_role]) then
    raise exception using errcode = '42501', message = 'school_membership_required';
  end if;
  current_workspace := public.teacher_workspace_read(p_school);
  if p_version is null or p_version is distinct from current_workspace->>'version' then
    raise exception using errcode = '40001', message = 'workspace_conflict';
  end if;
  select public_id into public_class from public.classes
    where school_id = p_school and id = p_class and active;
  if not found then
    raise exception using errcode = '22023', message = 'publication_class_unavailable';
  end if;
  -- FK/unique/exclusion constraints enforce links, teacher conflicts and times.
  -- Archiving an existing linked subject/teacher also prevents new publication.
  if exists (select 1 from public.lessons l
    join public.subjects s on s.school_id = l.school_id and s.id = l.subject_id
    left join public.teachers t on t.school_id = l.school_id and t.id = l.teacher_id
    where l.school_id = p_school and l.class_id = p_class and (not s.active or not coalesce(t.active, true))) then
    raise exception using errcode = '23514', message = 'publication_inactive_reference';
  end if;
  draft := private.publication_source(p_school, p_class);
  select * into latest from public.schedule_publications
    where school_id = p_school and class_id = p_class order by revision desc limit 1;
  -- Retrying an acknowledged-or-lost request does not duplicate its revision.
  if latest.id is null or latest.draft_snapshot is distinct from draft then
    select jsonb_object_agg(day.name, coalesce((select jsonb_agg(jsonb_build_object(
      'start', l->>'start', 'end', l->>'end', 'lesson', l->>'lesson') order by l->>'start')
      from jsonb_array_elements(draft->'lessons') l where (l->>'weekday')::integer = day.number), '[]'::jsonb))
    into schedule from (values (1,'Երկուշաբթի'), (2,'Երեքշաբթի'), (3,'Չորեքշաբթի'),
      (4,'Հինգշաբթի'), (5,'Ուրբաթ'), (6,'Շաբաթ'), (7,'Կիրակի')) day(number, name);
    insert into public.schedule_publications(school_id, class_id, revision, format_version, payload, draft_snapshot, published_by)
    values (p_school, p_class, coalesce(latest.revision, 0) + 1, 1,
      jsonb_build_object('publicId', public_class, 'schoolName', draft->'school'->>'name',
        'className', draft->>'className', 'timezone', draft->'school'->>'timezone', 'schedule', schedule),
      draft, auth.uid()) returning * into latest;
  end if;
  return jsonb_build_object('revision', latest.revision, 'publishedAt', latest.published_at,
    'workspace', public.teacher_workspace_read(p_school));
end $$;
revoke all on function public.publish_schedule(uuid, uuid, text) from public, anon;
grant execute on function public.publish_schedule(uuid, uuid, text) to authenticated;

-- A public UUID is a shareable capability. No enumeration, history, draft,
-- teacher names, comments, internal UUIDs or publisher identity are exposed.
create function public.get_published_schedule(p_public_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select p.payload || jsonb_build_object('formatVersion', p.format_version,
    'revision', p.revision, 'publishedAt', p.published_at)
  from public.classes c join public.schedule_publications p on p.class_id = c.id and p.school_id = c.school_id
  where c.public_id = p_public_id and c.active and p.draft_snapshot is not null
  order by p.revision desc limit 1;
$$;
revoke all on function public.get_published_schedule(uuid) from public;
grant execute on function public.get_published_schedule(uuid) to anon, authenticated;
