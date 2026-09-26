-- Preserve every existing code. Reservations outlive deleted classes so an old
-- Student connection can never silently resolve to a different class.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
lock table public.classes in share row exclusive mode;

create table private.class_join_codes (
  code text primary key check (code ~ '^[A-HJ-NP-RT-Z]{4}$'),
  class_id uuid not null unique
);
revoke all on private.class_join_codes from public, anon, authenticated;
insert into private.class_join_codes(code, class_id)
select join_code, id from public.classes;

alter table public.classes alter column join_code drop default;
drop function private.generate_join_code();

create function private.assign_class_join_code() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRTUVWXYZ';
  candidate text;
  inserted integer;
begin
  if new.join_code is not null then
    -- Explicit codes must reserve atomically too; no reuse of retired codes.
    insert into private.class_join_codes(code, class_id) values (new.join_code, new.id);
    return new;
  end if;
  for attempt in 1..1000 loop
    candidate := '';
    for position in 1..4 loop
      candidate := candidate || pg_catalog.substr(alphabet,
        pg_catalog.floor(pg_catalog.random() * pg_catalog.length(alphabet) + 1)::integer, 1);
    end loop;
    -- UNIQUE arbitration waits for concurrent transactions and retries the
    -- candidate on conflict, including conflicts invisible to our snapshot.
    insert into private.class_join_codes(code, class_id) values (candidate, new.id)
      on conflict (code) do nothing;
    get diagnostics inserted = row_count;
    if inserted = 1 then
      new.join_code := candidate;
      return new;
    end if;
  end loop;
  raise exception 'Could not allocate a class join code; retry or contact support'
    using errcode = '54000';
end;
$$;
revoke all on function private.assign_class_join_code() from public, anon, authenticated;
create trigger classes_assign_join_code before insert on public.classes
for each row execute function private.assign_class_join_code();

drop trigger classes_immutable on public.classes;
create trigger classes_immutable before update on public.classes
for each row execute function public.protect_immutable_columns('id', 'school_id', 'public_id', 'created_at', 'join_code');
commit;
