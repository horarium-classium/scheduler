begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(37);

insert into public.schedule_publications(id,school_id,class_id,revision,format_version,payload) values
('aaaaaaaa-6000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-1000-0000-0000-000000000001',1,1,'{}'),
('bbbbbbbb-6000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000001','bbbbbbbb-1000-0000-0000-000000000001',1,1,'{}');

-- Snapshot expected IDs before RLS, allowing extra local development classes
-- while still checking the complete visible set (including cross-school leakage).
select set_config('test.expected_class_ids',
  (select coalesce(jsonb_agg(id order by id), '[]'::jsonb)::text from classes
   where school_id='aaaaaaaa-0000-0000-0000-000000000001'), true);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select is((select count(*)::integer from schools), 1, 'admin sees only own school');
select is((select coalesce(jsonb_agg(id order by id), '[]'::jsonb)::text from classes), current_setting('test.expected_class_ids'), 'admin sees every own-school class and no other school classes');
select is((select count(*)::integer from school_members), 2, 'admin sees all own school members');
select is((select count(*)::integer from schedule_publications), 1, 'admin reads only own school publications');
select lives_ok($$update schools set name='Փորձնական դպրոց Ա նոր' where id='aaaaaaaa-0000-0000-0000-000000000001'$$, 'admin updates own school');
select lives_ok($$insert into time_slots(id,school_id,start_time,end_time) values ('aaaaaaaa-2000-0000-0000-000000000088','aaaaaaaa-0000-0000-0000-000000000001','15:00','15:45')$$, 'admin creates own time slot');
with changed as (update classes set name='Չի կարելի' where school_id='bbbbbbbb-0000-0000-0000-000000000001' returning 1)
select is((select count(*)::integer from changed), 0, 'admin cannot update another school class');
with changed as (delete from classes where school_id='bbbbbbbb-0000-0000-0000-000000000001' returning 1)
select is((select count(*)::integer from changed), 0, 'admin cannot delete another school class');
select throws_ok($$update classes set public_id='aaaaaaaa-1100-0000-0000-0000000000ff' where id='aaaaaaaa-1000-0000-0000-000000000001'$$, '23514', null, 'admin cannot change class public_id');
select throws_ok($$update classes set school_id='bbbbbbbb-0000-0000-0000-000000000001' where id='aaaaaaaa-1000-0000-0000-000000000001'$$, '23514', null, 'admin cannot move class to another school');
select throws_ok($$insert into classes(school_id,name) values ('bbbbbbbb-0000-0000-0000-000000000001','Անթույլատրելի')$$, '42501', null, 'admin cannot insert into another school');
select is(private.has_school_role('bbbbbbbb-0000-0000-0000-000000000001', array['admin'::school_role]), false, 'helper does not grant another school');
select throws_ok($$insert into schedule_publications(school_id,class_id,revision,format_version,payload) values ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-1000-0000-0000-000000000001',10,1,'{}')$$, '42501', null, 'admin cannot directly publish');
select throws_ok($$update schedule_publications set revision=20 where school_id='aaaaaaaa-0000-0000-0000-000000000001'$$, '42501', null, 'admin cannot update publications');
select throws_ok($$delete from schedule_publications where school_id='aaaaaaaa-0000-0000-0000-000000000001'$$, '42501', null, 'admin cannot delete publications');
select throws_ok($$insert into school_members(school_id,user_id,role) values ('bbbbbbbb-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','admin')$$, '42501', null, 'admin cannot self-enroll in another school');

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select is((select count(*)::integer from school_members), 1, 'scheduler sees only own membership');
select lives_ok($$insert into classes(id,school_id,name,public_id) values ('aaaaaaaa-1000-0000-0000-000000000088','aaaaaaaa-0000-0000-0000-000000000001','7Ա','aaaaaaaa-1100-0000-0000-000000000088')$$, 'scheduler manages own classes');
with changed as (update schools set name='Չպետք է փոխվի' where id='aaaaaaaa-0000-0000-0000-000000000001' returning 1)
select is((select count(*)::integer from changed), 0, 'scheduler cannot update school');
select lives_ok($$insert into time_slots(school_id,start_time,end_time) values ('aaaaaaaa-0000-0000-0000-000000000001','16:00','16:45')$$, 'scheduler creates own time slots');
select throws_ok($$update school_members set role='admin' where user_id='10000000-0000-0000-0000-000000000002'$$, '42501', null, 'scheduler cannot elevate membership role');
select lives_ok($$insert into lessons(id,school_id,class_id,weekday,time_slot_id,subject_id) values ('aaaaaaaa-5000-0000-0000-000000000088','aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-1000-0000-0000-000000000002',4,'aaaaaaaa-2000-0000-0000-000000000001','aaaaaaaa-3000-0000-0000-000000000001')$$, 'scheduler creates own lesson');
select lives_ok($$update lessons set comment='նոր մեկնաբանություն' where id='aaaaaaaa-5000-0000-0000-000000000001'$$, 'scheduler updates own lesson');
select lives_ok($$delete from lessons where id='aaaaaaaa-5000-0000-0000-000000000088'$$, 'scheduler deletes own lesson');
with changed as (update lessons set comment='Չի կարելի' where school_id='bbbbbbbb-0000-0000-0000-000000000001' returning 1)
select is((select count(*)::integer from changed), 0, 'scheduler cannot update another school lesson');
with changed as (delete from lessons where school_id='bbbbbbbb-0000-0000-0000-000000000001' returning 1)
select is((select count(*)::integer from changed), 0, 'scheduler cannot delete another school lesson');
select throws_ok($$update lessons set school_id='bbbbbbbb-0000-0000-0000-000000000001' where id='aaaaaaaa-5000-0000-0000-000000000001'$$, '23514', null, 'scheduler cannot move lesson to another school');
select is((select count(*)::integer from schedule_publications), 1, 'scheduler reads only own school publications');
select throws_ok($$update schedule_publications set revision=20 where school_id='aaaaaaaa-0000-0000-0000-000000000001'$$, '42501', null, 'scheduler cannot update publications');
select throws_ok($$delete from schedule_publications where school_id='aaaaaaaa-0000-0000-0000-000000000001'$$, '42501', null, 'scheduler cannot delete publications');

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000004', true);
select is((select count(*)::integer from schools), 0, 'authenticated user without membership sees no schools');
select is((select count(*)::integer from lessons), 0, 'authenticated user without membership sees no lessons');
select is((select count(*)::integer from schedule_publications), 0, 'authenticated user without membership sees no publications');
select throws_ok($$insert into subjects(school_id,name,color) values ('aaaaaaaa-0000-0000-0000-000000000001','Չի կարելի','#FFFFFF')$$, '42501', null, 'authenticated non-member cannot write drafts');
select is((select count(*)::integer from profiles), 1, 'user reads only own profile');

reset role;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select throws_ok($$select * from schools$$, '42501', null, 'anon has no draft table grants');
select throws_ok($$select * from schedule_publications$$, '42501', null, 'anon cannot read publications');

reset role;
select * from finish();
rollback;