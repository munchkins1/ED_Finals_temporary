-- ============================================================
-- CampusQR - School Event Attendance System
-- 09_registration_student_no.sql : save the student number captured at signup
--
-- The registration form (index.html -> js/authPage.js -> js/auth.js) now sends
-- `student_no` inside the auth user metadata (options.data). handle_new_user()
-- must copy it into public.profiles.student_no, otherwise the profile page
-- would always show "N/A" for the student number.
--
-- Run this file in the Supabase SQL Editor. It is safe to re-run.
-- The same definition lives in sql/01_schema.sql and sql/07_security_hardening.sql,
-- so fresh installs and full re-runs behave the same way.
-- ============================================================

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
    coalesce(
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      split_part(new.email, '@', 1)
    ),
    'student',  -- public signups are ALWAYS students, whatever metadata claims
    nullif(new.raw_user_meta_data ->> 'student_no', ''),   -- from the registration form
    nullif(new.raw_user_meta_data ->> 'department', ''),  -- from registration dropdown
    nullif(new.raw_user_meta_data ->> 'grade_class', '')   -- from registration dropdown
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
