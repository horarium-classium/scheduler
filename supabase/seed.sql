-- Local-only fixtures. Password for every account: local-password
-- These deterministic users are development data and must never be sent to a hosted project automatically.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values
('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'admin-a@local.test', extensions.crypt('local-password', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Դպրոց Ա admin"}', now(), now(), '', '', '', ''),
('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'scheduler-a@local.test', extensions.crypt('local-password', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Դպրոց Ա scheduler"}', now(), now(), '', '', '', ''),
('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'admin-b@local.test', extensions.crypt('local-password', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Դպրոց Բ admin"}', now(), now(), '', '', '', ''),
('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'no-school@local.test', extensions.crypt('local-password', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Առանց դպրոցի"}', now(), now(), '', '', '', '')
on conflict (id) do nothing;

insert into auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at) values
('20000000-0000-0000-0000-000000000001', 'admin-a@local.test', '10000000-0000-0000-0000-000000000001', '{"sub":"10000000-0000-0000-0000-000000000001","email":"admin-a@local.test"}', 'email', now(), now(), now()),
('20000000-0000-0000-0000-000000000002', 'scheduler-a@local.test', '10000000-0000-0000-0000-000000000002', '{"sub":"10000000-0000-0000-0000-000000000002","email":"scheduler-a@local.test"}', 'email', now(), now(), now()),
('20000000-0000-0000-0000-000000000003', 'admin-b@local.test', '10000000-0000-0000-0000-000000000003', '{"sub":"10000000-0000-0000-0000-000000000003","email":"admin-b@local.test"}', 'email', now(), now(), now()),
('20000000-0000-0000-0000-000000000004', 'no-school@local.test', '10000000-0000-0000-0000-000000000004', '{"sub":"10000000-0000-0000-0000-000000000004","email":"no-school@local.test"}', 'email', now(), now(), now())
on conflict (provider_id, provider) do nothing;

insert into public.schools (id, name, timezone) values
('aaaaaaaa-0000-0000-0000-000000000001', 'Փորձնական դպրոց Ա', 'Asia/Yerevan'),
('bbbbbbbb-0000-0000-0000-000000000001', 'Փորձնական դպրոց Բ', 'Europe/Paris');

insert into public.school_members (school_id, user_id, role) values
('aaaaaaaa-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'admin'),
('aaaaaaaa-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'scheduler'),
('bbbbbbbb-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003', 'admin');

insert into public.classes (id, school_id, name, sort_order, public_id) values
('aaaaaaaa-1000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', '5Ա', 1, 'aaaaaaaa-1100-0000-0000-000000000001'),
('aaaaaaaa-1000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', '5Բ', 2, 'aaaaaaaa-1100-0000-0000-000000000002'),
('bbbbbbbb-1000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', '5Ա', 1, 'bbbbbbbb-1100-0000-0000-000000000001');

insert into public.time_slots (id, school_id, start_time, end_time, sort_order) values
('aaaaaaaa-2000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', '09:00', '09:45', 1),
('aaaaaaaa-2000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', '10:00', '10:45', 2),
('bbbbbbbb-2000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', '09:00', '09:45', 1);

insert into public.subjects (id, school_id, name, color) values
('aaaaaaaa-3000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Մաթեմատիկա', '#DBEAFE'),
('aaaaaaaa-3000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'Հայոց լեզու', '#DCFCE7'),
('bbbbbbbb-3000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', 'Մաթեմատիկա', '#DBEAFE');

insert into public.teachers (id, school_id, name) values
('aaaaaaaa-4000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Անի Սարգսյան'),
('aaaaaaaa-4000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'Անի Սարգսյան'),
('bbbbbbbb-4000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', 'Անի Սարգսյան');

insert into public.lessons (id, school_id, class_id, weekday, time_slot_id, subject_id, teacher_id, comment) values
('aaaaaaaa-5000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1000-0000-0000-000000000001', 1, 'aaaaaaaa-2000-0000-0000-000000000001', 'aaaaaaaa-3000-0000-0000-000000000001', 'aaaaaaaa-4000-0000-0000-000000000001', ''),
('aaaaaaaa-5000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1000-0000-0000-000000000001', 2, 'aaaaaaaa-2000-0000-0000-000000000002', 'aaaaaaaa-3000-0000-0000-000000000002', null, 'Թելադրություն'),
('bbbbbbbb-5000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', 'bbbbbbbb-1000-0000-0000-000000000001', 1, 'bbbbbbbb-2000-0000-0000-000000000001', 'bbbbbbbb-3000-0000-0000-000000000001', 'bbbbbbbb-4000-0000-0000-000000000001', '');
