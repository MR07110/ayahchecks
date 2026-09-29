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

-- Fayl nomi ustuni (002-Baqara_oyat-255_soz-001-050)
alter table public.checks add column if not exists file_name text;

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

-- =====================================================================
-- 4) SERVER NAVBATI: brauzer yopiq bo'lsa ham ishlaydi
-- =====================================================================
alter table public.jobs add column if not exists image_path text;          -- Storage'dagi rasm yo'li
alter table public.jobs add column if not exists model text;
alter table public.jobs add column if not exists position bigint;          -- tartib (kichigi birinchi)
alter table public.jobs add column if not exists attempts int not null default 0;
alter table public.jobs add column if not exists started_at timestamptz;

-- Rasmlar uchun yopiq bucket (papka nomi = user id)
insert into storage.buckets (id, name, public, file_size_limit)
values ('images', 'images', false, 5242880) on conflict (id) do nothing;
drop policy if exists "images_own_insert" on storage.objects;
drop policy if exists "images_own_select" on storage.objects;
drop policy if exists "images_own_update" on storage.objects;
drop policy if exists "images_own_delete" on storage.objects;
create policy "images_own_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'images' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "images_own_select" on storage.objects for select to authenticated
  using (bucket_id = 'images' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "images_own_update" on storage.objects for update to authenticated
  using (bucket_id = 'images' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "images_own_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'images' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Har foydalanuvchining Start/Stop holati (hamma qurilma/tab shu yerdan o'qiydi)
create table if not exists public.user_state (
  user_id    uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  run_state  text not null default 'stopped' check (run_state in ('running', 'stopped')),
  updated_at timestamptz not null default now()
);
alter table public.user_state enable row level security;
grant select, insert, update on public.user_state to authenticated;
drop policy if exists "us_select_own" on public.user_state;
drop policy if exists "us_insert_own" on public.user_state;
drop policy if exists "us_update_own" on public.user_state;
create policy "us_select_own" on public.user_state for select to authenticated using ((select auth.uid()) = user_id);
create policy "us_insert_own" on public.user_state for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "us_update_own" on public.user_state for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Umumiy holat (bitta qator): worker qulfi, keyingi so'rov vaqti, Groq to'xtash sababi
create table if not exists public.app_state (
  id              int primary key default 1 check (id = 1),
  lease_until     timestamptz,
  heartbeat_at    timestamptz,
  next_request_at timestamptz,          -- shu vaqtdan oldin Groq'ga yangi so'rov yuborilmaydi (20 s pauza)
  fail_count      int not null default 0,
  halt_reason     text,                 -- null | groq_key | groq_quota | groq_down
  halt_message    text,
  halted_at       timestamptz,
  resume_at       timestamptz,          -- kunlik limit tugaganda qachon qayta urinish
  last_probe_at   timestamptz,
  updated_at      timestamptz not null default now()
);
insert into public.app_state (id) values (1) on conflict do nothing;
alter table public.app_state enable row level security;
grant select on public.app_state to authenticated;
drop policy if exists "as_select_all" on public.app_state;
create policy "as_select_all" on public.app_state for select to authenticated using (true);

-- Tartibni bitta so'rovda yozish (brauzer chaqiradi, RLS amal qiladi)
create or replace function public.set_job_order(p_ids uuid[]) returns void
language sql security invoker as $$
  update public.jobs j set position = t.ord
  from unnest(p_ids) with ordinality as t(id, ord)
  where j.id = t.id and j.status in ('uploading', 'queued');
$$;
grant execute on function public.set_job_order(uuid[]) to authenticated;

-- Worker qulfi: bir vaqtda faqat bitta worker ishlaydi
create or replace function public.claim_worker(p_seconds int) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  update public.app_state set lease_until = now() + make_interval(secs => p_seconds), heartbeat_at = now()
  where id = 1 and (lease_until is null or lease_until < now());
  return found;
end $$;
create or replace function public.release_worker() returns void
language sql security definer set search_path = public as $$
  update public.app_state set lease_until = null where id = 1;
$$;

-- Keyingi ishni oladi (faqat "running" foydalanuvchilarniki). p_dry=true bo'lsa faqat ko'rib qo'yadi.
-- Worker o'lib qolib uzilib qolgan (3 daqiqadan beri yangilanmagan) ishlarni navbatga qaytaradi.
create or replace function public.claim_next_job(p_dry boolean default false)
returns setof public.jobs language plpgsql security definer set search_path = public as $$
declare j public.jobs;
begin
  update public.jobs set
    status  = case when attempts >= 6 then 'error' else 'queued' end,
    message = case when attempts >= 6 then 'Bir necha marta uzildi. Qayta urinib ko''ring.' else 'Uzilgan ish qayta navbatga qo''yildi' end,
    updated_at = now()
  where status in ('preparing', 'analyzing', 'verifying', 'saving') and updated_at < now() - interval '3 minutes';

  select j2.* into j from public.jobs j2
  join public.user_state u on u.user_id = j2.user_id and u.run_state = 'running'
  where j2.status = 'queued' and j2.image_path is not null
  order by j2.position nulls last, j2.created_at
  limit 1 for update of j2 skip locked;
  if not found then return; end if;

  if p_dry then return next j; return; end if;
  update public.jobs set status = 'analyzing', attempts = attempts + 1, started_at = now(), updated_at = now(), message = null
  where id = j.id returning * into j;
  return next j;
end $$;
revoke all on function public.claim_worker(int), public.release_worker(), public.claim_next_job(boolean) from public, anon, authenticated;
grant execute on function public.claim_worker(int), public.release_worker(), public.claim_next_job(boolean) to service_role;

-- Realtime
do $$ begin alter publication supabase_realtime add table public.checks; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.user_state; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.app_state; exception when duplicate_object then null; end $$;

notify pgrst, 'reload schema';
