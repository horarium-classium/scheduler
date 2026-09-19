begin;
create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;
set local search_path = public, extensions;

select plan(8);

-- Both conflicts are proven deterministically with lock_timeout: the second,
-- concurrent insert cannot complete while the first transaction is still open,
-- so it blocks on the constraint lock and is cancelled after 100ms with
-- SQLSTATE 55P03 (lock timeout). After the first transaction commits, the very
-- same insert is rejected by the (now visible) committed row with the
-- constraint's own error code (23505 unique / 23P01 exclusion).

select extensions.dblink_connect_u('teacher_c1', 'host=127.0.0.1 port=5432 dbname=postgres user=supabase_admin password=postgres application_name=hc_teacher_c1');
select extensions.dblink_connect_u('teacher_c2', 'host=127.0.0.1 port=5432 dbname=postgres user=supabase_admin password=postgres application_name=hc_teacher_c2');
select extensions.dblink_exec('teacher_c1', 'begin');
select is(extensions.dblink_exec('teacher_c1', $$insert into public.lessons(id,school_id,class_id,weekday,time_slot_id,subject_id,teacher_id) values ('aaaaaaaa-5000-0000-0000-000000000081','aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-1000-0000-0000-000000000001',6,'aaaaaaaa-2000-0000-0000-000000000002','aaaaaaaa-3000-0000-0000-000000000001','aaaaaaaa-4000-0000-0000-000000000002')$$), 'INSERT 0 1', 'first teacher assignment inserts on its own connection');
select extensions.dblink_exec('teacher_c2', 'set lock_timeout to 100');
select throws_ok($outer$select extensions.dblink_exec('teacher_c2', $$insert into public.lessons(id,school_id,class_id,weekday,time_slot_id,subject_id,teacher_id) values ('aaaaaaaa-5000-0000-0000-000000000082','aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-1000-0000-0000-000000000002',6,'aaaaaaaa-2000-0000-0000-000000000002','aaaaaaaa-3000-0000-0000-000000000001','aaaaaaaa-4000-0000-0000-000000000002')$$)$outer$, '55P03', NULL, 'second concurrent teacher assignment blocks on the unique constraint while the first is uncommitted');
select extensions.dblink_exec('teacher_c1', 'commit');
select throws_ok($outer$select extensions.dblink_exec('teacher_c2', $$insert into public.lessons(id,school_id,class_id,weekday,time_slot_id,subject_id,teacher_id) values ('aaaaaaaa-5000-0000-0000-000000000082','aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-1000-0000-0000-000000000002',6,'aaaaaaaa-2000-0000-0000-000000000002','aaaaaaaa-3000-0000-0000-000000000001','aaaaaaaa-4000-0000-0000-000000000002')$$)$outer$, '23505', NULL, 'once the first assignment is committed the concurrent one is rejected by the unique constraint');
select is((select count(*)::integer from public.lessons where teacher_id='aaaaaaaa-4000-0000-0000-000000000002' and weekday=6 and time_slot_id='aaaaaaaa-2000-0000-0000-000000000002'), 1, 'exactly one conflicting teacher assignment remains');
select extensions.dblink_disconnect('teacher_c1');
select extensions.dblink_disconnect('teacher_c2');

select extensions.dblink_connect_u('slot_c1', 'host=127.0.0.1 port=5432 dbname=postgres user=supabase_admin password=postgres application_name=hc_slot_c1');
select extensions.dblink_connect_u('slot_c2', 'host=127.0.0.1 port=5432 dbname=postgres user=supabase_admin password=postgres application_name=hc_slot_c2');
select extensions.dblink_exec('slot_c1', 'begin');
select is(extensions.dblink_exec('slot_c1', $$insert into public.time_slots(id,school_id,start_time,end_time) values ('aaaaaaaa-2000-0000-0000-000000000081','aaaaaaaa-0000-0000-0000-000000000001','16:00','16:45')$$), 'INSERT 0 1', 'first time slot inserts on its own connection');
select extensions.dblink_exec('slot_c2', 'set lock_timeout to 100');
select throws_ok($outer$select extensions.dblink_exec('slot_c2', $$insert into public.time_slots(id,school_id,start_time,end_time) values ('aaaaaaaa-2000-0000-0000-000000000082','aaaaaaaa-0000-0000-0000-000000000001','16:30','17:00')$$)$outer$, '55P03', NULL, 'second concurrent overlapping slot blocks on the exclusion constraint while the first is uncommitted');
select extensions.dblink_exec('slot_c1', 'commit');
select throws_ok($outer$select extensions.dblink_exec('slot_c2', $$insert into public.time_slots(id,school_id,start_time,end_time) values ('aaaaaaaa-2000-0000-0000-000000000082','aaaaaaaa-0000-0000-0000-000000000001','16:30','17:00')$$)$outer$, '23P01', NULL, 'once the first slot is committed the overlapping one is rejected by the exclusion constraint');
select is((select count(*)::integer from public.time_slots where school_id='aaaaaaaa-0000-0000-0000-000000000001' and start_time >= '16:00'), 1, 'exactly one overlapping time slot remains');
select extensions.dblink_disconnect('slot_c1');
select extensions.dblink_disconnect('slot_c2');

select extensions.dblink_connect_u('cleanup', 'host=127.0.0.1 port=5432 dbname=postgres user=supabase_admin password=postgres application_name=hc_cleanup');
select extensions.dblink_exec('cleanup', $$delete from public.lessons where id in ('aaaaaaaa-5000-0000-0000-000000000081','aaaaaaaa-5000-0000-0000-000000000082')$$);
select extensions.dblink_exec('cleanup', $$delete from public.time_slots where id in ('aaaaaaaa-2000-0000-0000-000000000081','aaaaaaaa-2000-0000-0000-000000000082')$$);
select extensions.dblink_disconnect('cleanup');

select * from finish();
rollback;