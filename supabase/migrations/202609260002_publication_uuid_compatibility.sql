-- Keep already released Student builds working while they migrate to join codes.
create function public.get_published_schedule(p_public_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select (p.payload - 'joinCode') || jsonb_build_object(
    'formatVersion', 1, 'publicId', c.public_id,
    'revision', p.revision, 'publishedAt', p.published_at
  )
  from public.classes c join public.schedule_publications p on p.class_id = c.id and p.school_id = c.school_id
  where c.public_id = p_public_id and c.active and p.draft_snapshot is not null
  order by p.revision desc limit 1;
$$;
revoke all on function public.get_published_schedule(uuid) from public;
grant execute on function public.get_published_schedule(uuid) to anon, authenticated;