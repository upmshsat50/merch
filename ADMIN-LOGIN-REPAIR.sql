-- UPM SHS AT 50 — SAFE ADMIN LOGIN REPAIR
-- Safe to run if the admin login/database setup was incomplete.

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;

drop policy if exists "Admins can read own admin row" on public.admin_users;
create policy "Admins can read own admin row"
on public.admin_users
for select
to authenticated
using (user_id = (select auth.uid()));

grant select on public.admin_users to authenticated;

create or replace function public.is_merch_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_users
    where user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_merch_admin() from public;
grant execute on function public.is_merch_admin() to authenticated;

-- Keep the admin-only order policies in place.
alter table public.merch_orders enable row level security;
alter table public.merch_order_items enable row level security;

drop policy if exists "Admins can read orders" on public.merch_orders;
create policy "Admins can read orders"
on public.merch_orders for select to authenticated
using ((select public.is_merch_admin()));

drop policy if exists "Admins can update orders" on public.merch_orders;
create policy "Admins can update orders"
on public.merch_orders for update to authenticated
using ((select public.is_merch_admin()))
with check ((select public.is_merch_admin()));

drop policy if exists "Admins can read order items" on public.merch_order_items;
create policy "Admins can read order items"
on public.merch_order_items for select to authenticated
using ((select public.is_merch_admin()));

grant select, update on public.merch_orders to authenticated;
grant select on public.merch_order_items to authenticated;
