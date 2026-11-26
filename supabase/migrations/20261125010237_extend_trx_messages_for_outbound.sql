alter table public.trx_messages
  add column if not exists direction text not null default 'inbound'
    check (direction in ('inbound', 'outbound')),
  add column if not exists status text,
  add column if not exists recipient_phone text,
  add column if not exists error_details jsonb;

create index if not exists trx_messages_direction_created_idx
  on public.trx_messages (direction, created_at desc);

create index if not exists trx_messages_status_idx
  on public.trx_messages (status);
