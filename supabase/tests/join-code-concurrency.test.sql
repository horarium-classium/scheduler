-- Local only: two independent transactions choose the same random candidate.
begin;
create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;
set local search_path = public, extensions;
select plan(4);
create temporary table join_code_fixture (id1 uuid, id2 uuid, code1 text, code2 text);
insert into join_code_fixture values (gen_random_uuid(), gen_random_uuid(), null, null);
select extensions.dblink_connect_u('code_c1', 'host=127.0.0.1 port=5432 dbname=postgres user=supabase_admin password=postgres');
select extensions.dblink_connect_u('code_c2', 'host=127.0.0.1 port=5432 dbname=postgres user=supabase_admin password=postgres');
select extensions.dblink_exec('code_c1', 'begin');
select extensions.dblink_exec('code_c1', 'do $$ begin perform setseed(0.4242); end $$');
select extensions.dblink_exec('code_c2', 'do $$ begin perform setseed(0.4242); end $$');
update join_code_fixture set code1 = (select code from extensions.dblink('code_c1',
  format('insert into public.classes(id,school_id,name) values (%L,%L,%L) returning join_code', id1,
  'aaaaaaaa-0000-0000-0000-000000000001', 'Join code concurrent A')) as result(code text));
select is(extensions.dblink_send_query('code_c2',
  (select format('insert into public.classes(id,school_id,name) values (%L,%L,%L) returning join_code', id2,
  'bbbbbbbb-0000-0000-0000-000000000001', 'Join code concurrent B') from join_code_fixture)), 1, 'second allocation starts concurrently');
select pg_sleep(0.2);
select is(extensions.dblink_is_busy('code_c2'), 1, 'colliding reservation waits for the first transaction');
select extensions.dblink_exec('code_c1', 'commit');
update join_code_fixture set code2 = (select code from extensions.dblink_get_result('code_c2') as result(code text));
select ok(code1 <> code2, 'second transaction retries and saves with a different code') from join_code_fixture;
select is((select count(*)::integer from public.classes where id in (select id1 from join_code_fixture union all select id2 from join_code_fixture)), 2, 'both inserts succeed');
select extensions.dblink_disconnect('code_c1');
select extensions.dblink_disconnect('code_c2');
-- Cleanup only the randomly identified fixtures, including their reservations.
select extensions.dblink_connect_u('code_cleanup', 'host=127.0.0.1 port=5432 dbname=postgres user=supabase_admin password=postgres');
select extensions.dblink_exec('code_cleanup', (select format('delete from public.classes where id in (%L,%L)', id1, id2) from join_code_fixture));
select extensions.dblink_exec('code_cleanup', (select format('delete from private.class_join_codes where class_id in (%L,%L)', id1, id2) from join_code_fixture));
select extensions.dblink_disconnect('code_cleanup');
select * from finish();
rollback;
