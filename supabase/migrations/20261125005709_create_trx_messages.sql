create table if not exists public.trx_messages (
  id uuid primary key default gen_random_uuid(),
  wamid text not null unique,
  from_phone text not null,
  profile_name text,
  phone_number_id text,
  display_phone_number text,
  message_type text not null,
  text_body text,
  message_timestamp timestamptz,
  raw_message jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists trx_messages_from_phone_idx
  on public.trx_messages (from_phone);

create index if not exists trx_messages_timestamp_idx
  on public.trx_messages (message_timestamp desc);

alter table public.trx_messages enable row level security;
