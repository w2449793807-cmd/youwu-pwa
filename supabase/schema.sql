-- 有物 PWA：Supabase 数据表与行级权限
-- 在 Supabase Dashboard → SQL Editor 中执行一次。

create table if not exists public.user_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  version bigint not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.user_state enable row level security;

drop policy if exists "youwu_own_state_select" on public.user_state;
create policy "youwu_own_state_select"
  on public.user_state for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "youwu_own_state_insert" on public.user_state;
create policy "youwu_own_state_insert"
  on public.user_state for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "youwu_own_state_update" on public.user_state;
create policy "youwu_own_state_update"
  on public.user_state for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "youwu_own_state_delete" on public.user_state;
create policy "youwu_own_state_delete"
  on public.user_state for delete
  to authenticated
  using (auth.uid() = user_id);

grant select, insert, update, delete on public.user_state to authenticated;
