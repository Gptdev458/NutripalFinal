create table if not exists chat_sessions (
  user_id uuid references auth.users(id) primary key,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  current_mode text default 'idle' not null,
  buffer jsonb default '{}'::jsonb,
  missing_fields text[] default '{}',
  last_agent text,
  metadata jsonb default '{}'::jsonb
);

alter table chat_sessions enable row level security;

create policy "Users can view their own session"
  on chat_sessions for select
  using (auth.uid() = user_id);

create policy "Users can update their own session"
  on chat_sessions for update
  using (auth.uid() = user_id);

create policy "Users can insert their own session"
  on chat_sessions for insert
  with check (auth.uid() = user_id);

-- Add a trigger to auto-update updated_at
create or replace function update_updated_at_column()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language 'plpgsql';

create trigger update_chat_sessions_updated_at
    before update on chat_sessions
    for each row
    execute procedure update_updated_at_column();
