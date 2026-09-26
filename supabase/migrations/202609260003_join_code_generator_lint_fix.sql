create or replace function private.generate_join_code() returns text
language plpgsql security definer set search_path = '' as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRTUVWXYZ';
  candidate text;
begin
  loop
    candidate := '';
    for position in 1..4 loop
      candidate := candidate || pg_catalog.substr(
        alphabet,
        pg_catalog.floor(pg_catalog.random() * pg_catalog.length(alphabet) + 1)::integer,
        1
      );
    end loop;
    if not exists (select 1 from public.classes where join_code = candidate) then
      return candidate;
    end if;
  end loop;
  raise exception 'Could not generate a unique class join code';
end $$;
revoke all on function private.generate_join_code() from public, anon, authenticated;
grant execute on function private.generate_join_code() to authenticated;