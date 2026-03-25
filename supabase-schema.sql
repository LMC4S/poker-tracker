-- Run this in your Supabase project's SQL Editor
-- (supabase.com → your project → SQL Editor → New query)

create table poker_data (
  key text primary key,
  value text not null,
  updated_at timestamptz default now()
);

alter table poker_data enable row level security;

-- Restrict all access to only the app's storage key
-- This prevents anyone from deleting data or accessing other rows
-- even if they obtain the anon key from the JS bundle

create policy "App read" on poker_data
  for select using (key = 'poker-sessions-v2');

create policy "App insert" on poker_data
  for insert with check (key = 'poker-sessions-v2');

create policy "App update" on poker_data
  for update using (key = 'poker-sessions-v2');
