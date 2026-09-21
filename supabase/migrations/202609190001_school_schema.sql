create extension if not exists btree_gist with schema extensions;
create extension if not exists pgcrypto with schema extensions;

create type public.school_role as enum ('admin', 'scheduler');

create table public.schools (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  timezone text not null default 'Asia/Yerevan',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '' check (display_name = '' or btrim(display_name) <> ''),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.school_members (
  school_id uuid not null references public.schools(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.school_role not null,
  created_at timestamptz not null default now(),
  primary key (school_id, user_id)
);

create table public.classes (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  name text not null check (btrim(name) <> ''),
  sort_order integer not null default 0,
  public_id uuid not null default gen_random_uuid() unique,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, id)
);

create table public.time_slots (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  start_time time without time zone not null,
  end_time time without time zone not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, id)
);

create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  name text not null check (btrim(name) <> ''),
  color text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, id)
);

create table public.teachers (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  name text not null check (btrim(name) <> ''),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, id)
);

create table public.lessons (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  class_id uuid not null,
  weekday smallint not null,
  time_slot_id uuid not null,
  subject_id uuid not null,
  teacher_id uuid,
  comment text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lessons_class_school_fk foreign key (school_id, class_id) references public.classes(school_id, id) on delete restrict,
  constraint lessons_slot_school_fk foreign key (school_id, time_slot_id) references public.time_slots(school_id, id) on delete restrict,
  constraint lessons_subject_school_fk foreign key (school_id, subject_id) references public.subjects(school_id, id) on delete restrict,
  constraint lessons_teacher_school_fk foreign key (school_id, teacher_id) references public.teachers(school_id, id) on delete restrict
);

create table public.schedule_publications (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  class_id uuid not null,
  revision integer not null,
  format_version integer not null,
  payload jsonb not null,
  published_at timestamptz not null default now(),
  published_by uuid references auth.users(id) on delete set null,
  constraint publications_class_school_fk foreign key (school_id, class_id) references public.classes(school_id, id) on delete restrict,
  constraint schedule_publications_class_revision_key unique (class_id, revision)
);

create index school_members_user_idx on public.school_members(user_id, school_id);
create index classes_school_idx on public.classes(school_id);
create index time_slots_school_idx on public.time_slots(school_id);
create index subjects_school_idx on public.subjects(school_id);
create index teachers_school_idx on public.teachers(school_id);
create index lessons_class_idx on public.lessons(school_id, class_id);
create index lessons_slot_idx on public.lessons(school_id, time_slot_id);
create index lessons_subject_idx on public.lessons(school_id, subject_id);
create index lessons_teacher_idx on public.lessons(school_id, teacher_id) where teacher_id is not null;
create index publications_school_idx on public.schedule_publications(school_id, class_id);
