-- AyahChecks: Supabase SQL Editor'da bir marta ishga tushiring.
-- Oldin: Authentication > Sign In / Providers > "Allow anonymous sign-ins" ni yoqing.

-- 1) Tarix: har foydalanuvchi faqat o'z yozuvlarini ko'radi
create table if not exists public.checks (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at   timestamptz not null default now(),
  surah        text,
  surah_number int,
  ayah_count   int,
  score        int,
  data         jsonb not null
);
create index if not exists checks_user_created_idx on public.checks (user_id, created_at desc);

alter table public.checks enable row level security;
grant select, insert, delete on public.checks to authenticated;

drop policy if exists "checks_select_own" on public.checks;
drop policy if exists "checks_insert_own" on public.checks;
drop policy if exists "checks_delete_own" on public.checks;
create policy "checks_select_own" on public.checks for select to authenticated using ((select auth.uid()) = user_id);
create policy "checks_insert_own" on public.checks for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "checks_delete_own" on public.checks for delete to authenticated using ((select auth.uid()) = user_id);

-- 2) Kunlik limit hisobi: faqat server (service key) yozadi/o'qiydi.
--    RLS yoqilgan va policy yo'q, ya'ni brauzer bu jadvalga umuman kira olmaydi.
create table if not exists public.api_usage (
  id         bigint generated always as identity primary key,
  user_id    uuid not null,
  created_at timestamptz not null default now()
);
create index if not exists api_usage_user_created_idx on public.api_usage (user_id, created_at desc);
alter table public.api_usage enable row level security;
grant all on public.api_usage to service_role;

-- 3) Jarayon (jobs): "/" sahifasi jonli ko'rsatadi, "/input" sahifasi yangilaydi
create table if not exists public.jobs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  filename   text,
  status     text not null default 'queued',
  message    text,
  check_id   uuid references public.checks (id) on delete set null
);
create index if not exists jobs_user_created_idx on public.jobs (user_id, created_at desc);
alter table public.jobs enable row level security;
grant select, insert, update, delete on public.jobs to authenticated;
drop policy if exists "jobs_select_own" on public.jobs;
drop policy if exists "jobs_insert_own" on public.jobs;
drop policy if exists "jobs_update_own" on public.jobs;
drop policy if exists "jobs_delete_own" on public.jobs;
create policy "jobs_select_own" on public.jobs for select to authenticated using ((select auth.uid()) = user_id);
create policy "jobs_insert_own" on public.jobs for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "jobs_update_own" on public.jobs for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "jobs_delete_own" on public.jobs for delete to authenticated using ((select auth.uid()) = user_id);

-- Realtime (jonli yangilanish)
do $$ begin
  alter publication supabase_realtime add table public.jobs;
exception when duplicate_object then null; end $$;

notify pgrst, 'reload schema';
