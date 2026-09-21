begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(18);

select has_table('public', 'schools', 'schools table exists');
select has_table('public', 'profiles', 'profiles table exists');
select has_table('public', 'school_members', 'school_members table exists');
select has_table('public', 'classes', 'classes table exists');
select has_table('public', 'time_slots', 'time_slots table exists');
select has_table('public', 'subjects', 'subjects table exists');
select has_table('public', 'teachers', 'teachers table exists');
select has_table('public', 'lessons', 'lessons table exists');
select has_table('public', 'schedule_publications', 'schedule_publications table exists');
select col_type_is('public', 'schools', 'id', 'uuid', 'school id is uuid');
select col_type_is('public', 'schools', 'created_at', 'timestamp with time zone', 'audit timestamp uses timestamptz');
select col_type_is('public', 'time_slots', 'start_time', 'time without time zone', 'slot time is local time without timezone');
select col_is_pk('public', 'profiles', 'id', 'profile id is its primary key');
select col_is_fk('public', 'profiles', 'id', 'profile id references auth user');
select col_has_default('public', 'classes', 'public_id', 'class public id has generated default');
select has_index('public', 'lessons', 'lessons_cell_key', 'one-cell unique constraint has an index');
select has_index('public', 'lessons', 'lessons_teacher_slot_key', 'teacher occupancy partial unique index exists');
select is((select count(*)::integer from pg_catalog.pg_tables where schemaname = 'public' and rowsecurity), 9, 'RLS is enabled on all browser-facing tables');

select * from finish();
rollback;
