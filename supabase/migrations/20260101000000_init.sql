create table poker_data (
  key text primary key,
  value text not null,
  updated_at text
);

alter table poker_data enable row level security;

create policy "deny all anon" on poker_data
  for all to anon using (false);
