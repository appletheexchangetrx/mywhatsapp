create table if not exists public.trx_message_send_requests (
  idempotency_key text primary key,
  payload_hash text not null,
  payload jsonb not null,
  state text not null default 'sending'
    check (state in ('sending', 'accepted', 'accepted_unstored', 'failed', 'unknown')),
  wamid text,
  meta_response jsonb,
  error_details jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists trx_message_send_requests_state_created_idx
  on public.trx_message_send_requests (state, created_at);

alter table public.trx_message_send_requests enable row level security;

create table if not exists public.trx_message_status_events (
  id bigint generated always as identity primary key,
  wamid text not null,
  status text not null,
  status_timestamp timestamptz not null,
  error_details jsonb,
  raw_status jsonb not null,
  created_at timestamptz not null default now(),
  unique (wamid, status, status_timestamp)
);

create index if not exists trx_message_status_events_wamid_timestamp_idx
  on public.trx_message_status_events (wamid, status_timestamp desc);

alter table public.trx_message_status_events enable row level security;

create or replace function public.trx_message_status_rank(p_status text)
returns integer
language sql immutable
as $$
  select case lower(p_status)
    when 'accepted' then 0
    when 'sent' then 1
    when 'failed' then 2
    when 'delivered' then 2
    when 'read' then 3
    else 0
  end;
$$;

create or replace function public.record_trx_message_status_event(
  p_wamid text,
  p_status text,
  p_status_timestamp timestamptz,
  p_error_details jsonb,
  p_raw_status jsonb
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer;
begin
  insert into public.trx_message_status_events
    (wamid, status, status_timestamp, error_details, raw_status)
  values (p_wamid, p_status, p_status_timestamp, p_error_details, coalesce(p_raw_status, '{}'::jsonb))
  on conflict (wamid, status, status_timestamp) do nothing;

  update public.trx_messages
     set status = p_status,
         error_details = p_error_details
   where wamid = p_wamid
     and (
       public.trx_message_status_rank(p_status) > public.trx_message_status_rank(coalesce(status, 'accepted'))
       or (
         public.trx_message_status_rank(p_status) = public.trx_message_status_rank(coalesce(status, 'accepted'))
         and coalesce(message_timestamp, '-infinity'::timestamptz) <= p_status_timestamp
         and lower(coalesce(status, '')) not in ('read')
       )
     );
  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$$;

create or replace function public.complete_trx_message_send_request(
  p_idempotency_key text,
  p_wamid text,
  p_row jsonb,
  p_meta_response jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event record;
begin
  insert into public.trx_messages (
    wamid, from_phone, profile_name, phone_number_id, display_phone_number,
    recipient_phone, direction, status, message_type, text_body,
    message_timestamp, raw_message
  ) values (
    p_wamid,
    p_row->>'from_phone',
    null,
    p_row->>'phone_number_id',
    p_row->>'display_phone_number',
    p_row->>'recipient_phone',
    'outbound',
    'accepted',
    p_row->>'message_type',
    p_row->>'text_body',
    coalesce((p_row->>'message_timestamp')::timestamptz, now()),
    coalesce(p_row->'raw_message', '{}'::jsonb)
  )
  on conflict (wamid) do nothing;

  select status, status_timestamp, error_details
    into v_event
    from public.trx_message_status_events
   where wamid = p_wamid
   order by status_timestamp desc, public.trx_message_status_rank(status) desc, id desc
   limit 1;

  if found then
    update public.trx_messages
       set status = v_event.status,
           error_details = v_event.error_details,
           message_timestamp = greatest(coalesce(message_timestamp, v_event.status_timestamp), v_event.status_timestamp)
     where wamid = p_wamid
       and public.trx_message_status_rank(v_event.status) >= public.trx_message_status_rank(coalesce(status, 'accepted'));
  end if;

  update public.trx_message_send_requests
     set state = 'accepted',
         wamid = p_wamid,
         meta_response = coalesce(p_meta_response, '{}'::jsonb),
         error_details = null,
         updated_at = now()
   where idempotency_key = p_idempotency_key;
  if not found then
    raise exception 'Idempotency request not found';
  end if;
end;
$$;

revoke all on function public.record_trx_message_status_event(text, text, timestamptz, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.complete_trx_message_send_request(text, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.record_trx_message_status_event(text, text, timestamptz, jsonb, jsonb) to service_role;
grant execute on function public.complete_trx_message_send_request(text, text, jsonb, jsonb) to service_role;
