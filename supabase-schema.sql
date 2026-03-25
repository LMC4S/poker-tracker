-- Run this in your Supabase project's SQL Editor
-- (supabase.com → your project → SQL Editor → New query)

create table poker_data (
  key text primary key,
  value text not null,
  updated_at timestamptz default now()
);

-- Allow anyone to read/write (since this is a personal app with no auth)
alter table poker_data enable row level security;

create policy "Public read" on poker_data for select using (true);
create policy "Public insert" on poker_data for insert with check (true);
create policy "Public update" on poker_data for update using (true);
