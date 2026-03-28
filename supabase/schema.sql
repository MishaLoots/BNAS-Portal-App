-- ============================================================
-- BNAS Portal — Supabase Schema
-- Run this in the Supabase SQL editor (Project > SQL Editor)
-- ============================================================

-- ── Artists ─────────────────────────────────────────────────
create table public.artists (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  email           text unique,
  escrow_account  text,
  default_comm    numeric default 0.20,
  default_warchest numeric default 0.20,
  opening_balance numeric default 0,
  loan_opening    numeric default 0,
  has_csr         boolean default false,
  created_at      timestamptz default now()
);

-- ── Shows ───────────────────────────────────────────────────
create table public.shows (
  id          uuid primary key default gen_random_uuid(),
  artist_id   uuid references public.artists(id) on delete cascade,
  show_date   date,
  event       text,
  show_type   text,
  gross       numeric default 0,
  pay_type    text default 'Escrow',   -- 'Escrow' | 'Direct'
  comm_pct    numeric default 0.20,
  sound       numeric default 0,
  mus1        numeric default 0,
  mus2        numeric default 0,
  mus3        numeric default 0,
  other_costs numeric default 0,
  warchest_pct numeric default 0.20,
  batch_num   text,
  status      text,                    -- 'All Paid' | 'Fee Received' | 'Pending' | 'Cancelled'
  dep_pct     numeric,                 -- 0-100; null = not set
  dep_is_pre  boolean default false,   -- true = pre-period deposit (in opening balance)
  notes       text,
  created_at  timestamptz default now()
);

-- ── Escrow Transfer Log ─────────────────────────────────────
create table public.transfers (
  id            uuid primary key default gen_random_uuid(),
  artist_id     uuid references public.artists(id) on delete cascade,
  transfer_date date,
  description   text,
  transfer_type text,   -- 'Batch Payout' | 'Warchest Dist.' | 'Loan/Other' | 'Refund' | 'Other'
  amount        numeric default 0,
  created_at    timestamptz default now()
);

-- ── Artist Nett Payout Log ──────────────────────────────────
create table public.payouts (
  id                  uuid primary key default gen_random_uuid(),
  artist_id           uuid references public.artists(id) on delete cascade,
  payout_date         date,
  batch_ref           text,
  amount              numeric default 0,
  notes               text,
  approved_by_artist  boolean default false,
  approved_at         timestamptz,
  created_at          timestamptz default now()
);

-- ── Loan Repayments ─────────────────────────────────────────
create table public.loan_repayments (
  id               uuid primary key default gen_random_uuid(),
  artist_id        uuid references public.artists(id) on delete cascade,
  repayment_date   date,
  description      text,
  amount           numeric default 0,
  notes            text,
  created_at       timestamptz default now()
);

-- ── Profiles (links auth.users → artist or admin) ───────────
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  artist_id   uuid references public.artists(id),  -- null for admin
  is_admin    boolean default false
);

-- Auto-create profile when user signs up
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table public.artists         enable row level security;
alter table public.shows           enable row level security;
alter table public.transfers       enable row level security;
alter table public.payouts         enable row level security;
alter table public.loan_repayments enable row level security;
alter table public.profiles        enable row level security;

-- Helper: is current user an admin?
create or replace function public.is_admin()
returns boolean language sql security definer as $$
  select coalesce(
    (select is_admin from public.profiles where id = auth.uid()),
    false
  );
$$;

-- Helper: get current user's artist_id
create or replace function public.my_artist_id()
returns uuid language sql security definer as $$
  select artist_id from public.profiles where id = auth.uid();
$$;

-- Profiles: users see only their own profile
create policy "profiles_own" on public.profiles
  for all using (id = auth.uid());

-- Artists: admin sees all; artist sees only themselves
create policy "artists_admin" on public.artists
  for all using (public.is_admin());

create policy "artists_own" on public.artists
  for select using (id = public.my_artist_id());

-- Shows: admin full access; artist sees own
create policy "shows_admin" on public.shows
  for all using (public.is_admin());

create policy "shows_own" on public.shows
  for select using (artist_id = public.my_artist_id());

-- Transfers: admin full access; artist sees own
create policy "transfers_admin" on public.transfers
  for all using (public.is_admin());

create policy "transfers_own" on public.transfers
  for select using (artist_id = public.my_artist_id());

-- Payouts: admin full access; artist can view + approve their own
create policy "payouts_admin" on public.payouts
  for all using (public.is_admin());

create policy "payouts_view_own" on public.payouts
  for select using (artist_id = public.my_artist_id());

create policy "payouts_approve_own" on public.payouts
  for update using (artist_id = public.my_artist_id())
  with check (artist_id = public.my_artist_id());

-- Loan repayments: admin full; artist sees own
create policy "loans_admin" on public.loan_repayments
  for all using (public.is_admin());

create policy "loans_own" on public.loan_repayments
  for select using (artist_id = public.my_artist_id());
