begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(20);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select is((select count(*)::integer from schools), 1, 'admin sees only own school');
select is((select count(*)::integer from classes), 2, 'admin does not see other school classes');
select is((select count(*)::integer from school_members), 2, 'admin sees all own school members');
select lives_ok($$update schools set name='Փորձնական դպրոց Ա նոր' where id='aaaaaaaa-0000-0000-0000-000000000001'$$, 'admin updates own school');
select lives_ok($$insert into time_slots(id,school_id,start_time,end_time) values ('aaaaaaaa-2000-0000-0000-000000000088','aaaaaaaa-0000-0000-0000-000000000001','15:00','15:45')$$, 'admin creates own time slot');
select throws_ok($$insert into classes(school_id,name) values ('bbbbbbbb-0000-0000-0000-000000000001','Անթույլատրելի')$$, '42501', null, 'admin cannot insert into another school');
select is(private.has_school_role('bbbbbbbb-0000-0000-0000-000000000001', array['admin'::school_role]), false, 'helper does not grant another school');
select throws_ok($$insert into schedule_publications(school_id,class_id,revision,format_version,payload) values ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-1000-0000-0000-000000000001',10,1,'{}')$$, '42501', null, 'admin cannot directly publish');
select throws_ok($$insert into school_members(school_id,user_id,role) values ('bbbbbbbb-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','admin')$$, '42501', null, 'admin cannot self-enroll in another school');

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select is((select count(*)::integer from school_members), 1, 'scheduler sees only own membership');
select lives_ok($$insert into classes(id,school_id,name,public_id) values ('aaaaaaaa-1000-0000-0000-000000000088','aaaaaaaa-0000-0000-0000-000000000001','7Ա','aaaaaaaa-1100-0000-0000-000000000088')$$, 'scheduler manages own classes');
with changed as (update schools set name='Չպետք է փոխվի' where id='aaaaaaaa-0000-0000-0000-000000000001' returning 1)
select is((select count(*)::integer from changed), 0, 'scheduler cannot update school');
select throws_ok($$insert into time_slots(school_id,start_time,end_time) values ('aaaaaaaa-0000-0000-0000-000000000001','16:00','16:45')$$, '42501', null, 'scheduler cannot create time slots');
select throws_ok($$update school_members set role='admin' where user_id='10000000-0000-0000-0000-000000000002'$$, '42501', null, 'scheduler cannot elevate membership role');
select is((select count(*)::integer from schedule_publications), 0, 'scheduler can read own publications but none exist in seed');

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000004', true);
select is((select count(*)::integer from schools), 0, 'authenticated user without membership sees no schools');
select is((select count(*)::integer from lessons), 0, 'authenticated user without membership sees no lessons');
select throws_ok($$insert into subjects(school_id,name,color) values ('aaaaaaaa-0000-0000-0000-000000000001','Չի կարելի','#FFFFFF')$$, '42501', null, 'authenticated non-member cannot write drafts');
select is((select count(*)::integer from profiles), 1, 'user reads only own profile');

reset role;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select throws_ok($$select * from schools$$, '42501', null, 'anon has no draft table grants');

reset role;
select * from finish();
rollback;
