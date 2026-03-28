create table poker_data (
  key text primary key,
  value text not null,
  updated_at text
);

alter table poker_data enable row level security;

create policy "deny all anon" on poker_data
  for all to anon using (false);

create table poker_public (
  key text primary key,
  value text not null,
  updated_at text
);

alter table poker_public enable row level security;

create policy "allow anon select" on poker_public
  for select to anon using (true);

alter publication supabase_realtime add table poker_public;
