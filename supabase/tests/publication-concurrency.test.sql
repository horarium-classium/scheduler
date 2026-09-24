-- Local Supabase only. Dedicated fixture, cleaned up after both sessions close.
begin;
create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;
set local search_path = public, extensions;
select plan(5);
select dblink_connect_u('pub_setup','host=127.0.0.1 port=5432 dbname=postgres user=supabase_admin password=postgres');
select dblink_exec('pub_setup', $$
  insert into public.schools(id,name) values ('cccccccc-0000-0000-0000-000000000099','Publication concurrency');
  insert into public.school_members(school_id,user_id,role) values ('cccccccc-0000-0000-0000-000000000099','10000000-0000-0000-0000-000000000001','admin');
  insert into public.classes(id,school_id,name) values ('cccccccc-1000-0000-0000-000000000099','cccccccc-0000-0000-0000-000000000099','Publication test');
$$);
select dblink_connect_u('pub1','host=127.0.0.1 port=5432 dbname=postgres user=supabase_admin password=postgres');
select dblink_connect_u('pub2','host=127.0.0.1 port=5432 dbname=postgres user=supabase_admin password=postgres');
select dblink_exec('pub1',$$set role authenticated; set "request.jwt.claim.sub"='10000000-0000-0000-0000-000000000001'; begin;$$);
select dblink_exec('pub2',$$set role authenticated; set "request.jwt.claim.sub"='10000000-0000-0000-0000-000000000001'; set lock_timeout='100ms';$$);
select set_config('test.pub_version',(select version from dblink('pub2',$$select public.teacher_workspace_read('cccccccc-0000-0000-0000-000000000099')->>'version'$$) as t(version text)),true);
select is((select (value->>'revision')::integer from dblink('pub1',format($$select public.publish_schedule('cccccccc-0000-0000-0000-000000000099','cccccccc-1000-0000-0000-000000000099',%L)$$,current_setting('test.pub_version'))) as t(value jsonb)),1,'first publication is staged');
select throws_ok($q$select * from dblink('pub2',format($$select public.publish_schedule('cccccccc-0000-0000-0000-000000000099','cccccccc-1000-0000-0000-000000000099',%L)$$,current_setting('test.pub_version'))) as t(value jsonb)$q$,'55P03',null,'concurrent publisher waits on workspace lock');
select dblink_exec('pub1','commit');
select is((select (value->>'revision')::integer from dblink('pub2',format($$select public.publish_schedule('cccccccc-0000-0000-0000-000000000099','cccccccc-1000-0000-0000-000000000099',%L)$$,current_setting('test.pub_version'))) as t(value jsonb)),1,'concurrent retry reuses revision');
select dblink_exec('pub1',$$begin; update public.classes set name='Changed' where id='cccccccc-1000-0000-0000-000000000099';$$);
select throws_ok($q$select * from dblink('pub2',format($$select public.publish_schedule('cccccccc-0000-0000-0000-000000000099','cccccccc-1000-0000-0000-000000000099',%L)$$,current_setting('test.pub_version'))) as t(value jsonb)$q$,'55P03',null,'publisher waits for draft writer');
select dblink_exec('pub1','commit');
select throws_ok($q$select * from dblink('pub2',format($$select public.publish_schedule('cccccccc-0000-0000-0000-000000000099','cccccccc-1000-0000-0000-000000000099',%L)$$,current_setting('test.pub_version'))) as t(value jsonb)$q$,'40001','workspace_conflict','publisher sees committed version after waiting');
select dblink_disconnect('pub1'); select dblink_disconnect('pub2');
select dblink_exec('pub_setup',$$
  delete from public.schedule_publications where school_id='cccccccc-0000-0000-0000-000000000099';
  delete from public.classes where school_id='cccccccc-0000-0000-0000-000000000099';
  delete from public.school_members where school_id='cccccccc-0000-0000-0000-000000000099';
  delete from public.schools where id='cccccccc-0000-0000-0000-000000000099';
$$);
select dblink_disconnect('pub_setup');
select * from finish();
rollback;
