-- ============================================================
-- CampusQR - School Event Attendance System
-- 01_schema.sql : Enum types, tables, constraints, indexes, signup trigger
-- Run this FIRST in the Supabase SQL Editor.
-- ============================================================

-- ---------- Enum types (safe to re-run) ----------
do $$ begin
  create type public.user_role as enum ('student', 'teacher', 'admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.event_status as enum ('draft', 'open', 'closed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.attendance_status as enum ('present', 'late', 'absent', 'excused');
exception when duplicate_object then null; end $$;

-- ---------- profiles (one row per auth user, holds role + profile data) ----------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text unique not null,
  full_name   text not null default '',
  role        public.user_role not null default 'student',
  student_no  text,
  grade_class text,
  department  text,
  title       text,
  phone       text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);
comment on table public.profiles is 'Application profile + role for every authenticated user.';

-- ---------- events ----------
create table if not exists public.events (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  description    text not null default '',
  venue          text not null default '',
  start_datetime timestamptz not null,
  end_datetime   timestamptz,
  status         public.event_status not null default 'draft',
  qr_token       uuid not null default gen_random_uuid() unique,
  created_by     uuid not null references public.profiles(id) on delete cascade,
  created_at     timestamptz not null default now(),
  constraint events_time_check check (end_datetime is null or end_datetime >= start_datetime)
);

-- ---------- attendance (unique per event+student => duplicate prevention) ----------
create table if not exists public.attendance (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events(id) on delete cascade,
  student_id  uuid not null references public.profiles(id) on delete cascade,
  status      public.attendance_status not null default 'present',
  method      text not null default 'qr',
  recorded_at timestamptz not null default now(),
  recorded_by uuid references public.profiles(id) on delete set null,
  constraint attendance_unique_per_event unique (event_id, student_id)
);

-- ---------- audit_logs (system records / admin reports) ----------
create table if not exists public.audit_logs (
  id         bigint generated always as identity primary key,
  actor_id   uuid references public.profiles(id) on delete set null,
  action     text not null,
  entity     text,
  entity_id  text,
  details    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ---------- indexes ----------
create index if not exists idx_events_created_by   on public.events(created_by);
create index if not exists idx_events_status       on public.events(status);
create index if not exists idx_attendance_event    on public.attendance(event_id);
create index if not exists idx_attendance_student  on public.attendance(student_id);

-- ---------- auto-create a profile whenever a user signs up ----------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role, student_no, department, grade_class)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    'student',  -- public signups are ALWAYS students; an admin promotes roles later
    nullif(new.raw_user_meta_data->>'student_no', ''), -- from the registration form
    nullif(new.raw_user_meta_data->>'department', ''),  -- from registration dropdown
    nullif(new.raw_user_meta_data->>'grade_class', '')  -- from registration dropdown
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
