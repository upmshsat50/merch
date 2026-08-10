-- UPM SHS AT 50 — ADMIN ACCESS
-- 1) First create each admin in Supabase:
--    Authentication > Users > Add user
--    Give each admin their OWN email and password.
--
-- 2) Replace the placeholder emails below, then run this file in SQL Editor.
--    You may keep gadollera@up.edu.ph if that is one of the admins.

insert into public.admin_users (user_id)
select id
from auth.users
where lower(email) in (
  lower('gadollera@up.edu.ph'),
  lower('ADMIN2_EMAIL_HERE'),
  lower('ADMIN3_EMAIL_HERE'),
  lower('ADMIN4_EMAIL_HERE')
)
on conflict (user_id) do nothing;

-- Check which admin emails are currently authorized:
select u.email, a.created_at as admin_added_at
from public.admin_users a
join auth.users u on u.id = a.user_id
order by u.email;
