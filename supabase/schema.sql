-- CreVa schema. Paste into the Supabase SQL Editor and run. Safe to run more than once.
--
-- SECURITY MODEL
-- The browser never talks to Supabase. Only the serverless functions do, using the service_role key
-- from an environment variable. service_role bypasses row level security (RLS).
-- RLS is enabled on every table below and NO policies are created, so direct access with the
-- anon or authenticated roles is denied by default. We also revoke their table privileges.
-- This is a single-demo-user prototype: every row belongs to user 'demo-ananya'. There is no login.

create table if not exists profiles (
  id text primary key,
  name text not null,
  gender text,
  email text,
  phone text,
  dob date,
  city text,
  state text,
  bio text,
  niche text,
  min_fee_inr int,
  topics text[] not null default '{}',
  languages text[] not null default '{}',
  audience jsonb not null default '{}'::jsonb,
  instagram_handle text,
  instagram_followers int,
  linkedin_handle text,
  linkedin_followers int,
  social jsonb not null default '[]'::jsonb,   -- the other platforms and their active flags
  invoicing jsonb not null default '{}'::jsonb,
  preferences jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists contracts (
  id text primary key,
  user_id text not null references profiles(id),
  brand text not null,
  filename text not null,
  body text not null,
  message text,                                 -- the brand message that came with it, if any
  status text not null default 'Needs review',
  issue_states jsonb not null default '{}'::jsonb,  -- reviewed / cleared / dismissed per issue key
  created_at timestamptz not null default now()
);

create table if not exists opportunities (
  id text primary key,
  user_id text not null references profiles(id),
  brand text not null,
  brand_website text,
  amount_inr int,                               -- cash fee; for barter this is the product value
  deliverables text not null,
  channel text,
  received_days_ago int,
  message text,
  contract_id text references contracts(id),
  kind text not null check (kind in ('paid','barter')),
  severity text not null check (severity in ('high','amber','neutral')),
  preassessment text
);

create table if not exists analyses (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references profiles(id),
  opportunity_id text references opportunities(id),
  input_hash text not null,
  source text not null check (source in ('live','fallback')),
  model text,
  result jsonb not null,
  latency_ms int,
  created_at timestamptz not null default now()
);
create index if not exists analyses_user_created_idx on analyses (user_id, created_at desc);
create index if not exists analyses_input_hash_idx on analyses (input_hash);

create table if not exists deals (
  id text primary key,
  user_id text not null references profiles(id),
  brand text not null,
  status text not null,
  deliverables text,
  opening_offer int,
  our_counter int,
  closed_amount int,
  terms jsonb not null default '{}'::jsonb,
  requirements jsonb not null default '[]'::jsonb
);

create table if not exists payments (
  id text primary key,
  deal_id text not null references deals(id),
  expected int not null,
  invoiced int not null default 0,
  received int not null default 0,
  due_date date,
  status text not null
);

-- Anonymised comparable deals ("Tier 2"). SYNTHETIC in this prototype: is_synthetic stays true
-- until real network data replaces it. The app must never present these as real market data.
create table if not exists network_deals (
  id int primary key,
  niche text not null,
  band text not null,
  deliverable text not null,
  usage text not null,
  exclusivity_months int not null default 0,
  final_amount_inr int not null,
  is_synthetic boolean not null default true
);

create table if not exists eval_runs (
  id uuid primary key default gen_random_uuid(),
  prompt text not null,
  source text,
  passed boolean not null,
  notes text,
  created_at timestamptz not null default now()
);

-- Row level security on every table, no policies (deny by default for anon and authenticated).
alter table profiles enable row level security;
alter table contracts enable row level security;
alter table opportunities enable row level security;
alter table analyses enable row level security;
alter table deals enable row level security;
alter table payments enable row level security;
alter table network_deals enable row level security;
alter table eval_runs enable row level security;

-- Defence in depth: remove table privileges from the browser-facing roles.
revoke all on table profiles, contracts, opportunities, analyses, deals, payments, network_deals, eval_runs
  from anon, authenticated;
