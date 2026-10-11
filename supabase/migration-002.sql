-- Migration 002: consent-based sharing of rate-checker results.
-- Run once in the Supabase SQL Editor (paste, then Run). Safe to run again.
-- Everything else in this release (deals, invoices, proof pack, plan, profile photo) uses the existing tables.
--
-- Only an anonymous summary is stored: no name, no brand, no exact follower count. A row is written only when the
-- visitor ticks the consent box after seeing the result. Same security model as the other tables: row level security
-- on, no policies, no access for the browser roles. Only the server (service role) can write or read.

create table if not exists shared_checks (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  platform text not null check (platform in ('Instagram','LinkedIn')),
  followers_band text,
  deliverable text,
  usage text,
  exclusivity text,
  last_paid_inr int,
  range_low int,
  range_high int
);

alter table shared_checks enable row level security;
revoke all on table shared_checks from anon, authenticated;
