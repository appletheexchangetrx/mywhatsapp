-- Run after applying 20261126130000_add_cloud_tools_p1_reliability.sql.
-- Transactional regression checks; all fixture rows are rolled back.
begin;

do $$
declare
  v_status text;
  v_key text := 'p1-test-early-webhook-' || gen_random_uuid()::text;
  v_wamid text := 'wamid.p1.' || gen_random_uuid()::text;
  v_fail_key text := 'p1-test-persist-failure-' || gen_random_uuid()::text;
  v_fail_wamid text := 'wamid.p1.fail.' || gen_random_uuid()::text;
  v_time timestamptz := '2026-01-01T00:00:00Z';
begin
  -- An early read webhook is durable even before the outbound WAMID row exists.
  perform public.record_trx_message_status_event(
    v_wamid, 'read', v_time + interval '3 minutes', null, '{"status":"read"}'::jsonb
  );
  insert into public.trx_message_send_requests(idempotency_key, payload_hash, payload, state)
  values (v_key, repeat('a', 64), '{"type":"text"}'::jsonb, 'sending');

  perform public.complete_trx_message_send_request(
    v_key, v_wamid,
    jsonb_build_object(
      'from_phone', '0000000000', 'phone_number_id', 'test-phone-id',
      'display_phone_number', '0000000000', 'recipient_phone', '6281234567890',
      'message_type', 'text', 'text_body', 'test',
      'message_timestamp', v_time, 'raw_message', '{"direction":"outbound"}'::jsonb
    ),
    '{"messages":[{"id":"test"}]}'::jsonb
  );
  select status into v_status from public.trx_messages where wamid = v_wamid;
  if v_status <> 'read' then raise exception 'Early webhook status was not reconciled: %', v_status; end if;

  -- A later-arriving older status must not regress read -> sent.
  perform public.record_trx_message_status_event(
    v_wamid, 'sent', v_time + interval '1 minute', null, '{"status":"sent"}'::jsonb
  );
  select status into v_status from public.trx_messages where wamid = v_wamid;
  if v_status <> 'read' then raise exception 'Out-of-order status regressed read to %', v_status; end if;

  -- Completion and message persistence are atomic: invalid row data rolls back both.
  insert into public.trx_message_send_requests(idempotency_key, payload_hash, payload, state)
  values (v_fail_key, repeat('b', 64), '{"type":"text"}'::jsonb, 'sending');
  begin
    perform public.complete_trx_message_send_request(
      v_fail_key, v_fail_wamid,
      jsonb_build_object(
        'from_phone', '0000000000', 'phone_number_id', 'test-phone-id',
        'display_phone_number', '0000000000', 'recipient_phone', '6281234567890',
        'message_type', 'text', 'text_body', 'test',
        'message_timestamp', 'not-a-timestamp', 'raw_message', '{}'::jsonb
      ),
      '{}'::jsonb
    );
    raise exception 'Expected invalid timestamp to fail persistence';
  exception when others then
    if sqlerrm = 'Expected invalid timestamp to fail persistence' then raise; end if;
  end;
  select state into v_status from public.trx_message_send_requests where idempotency_key = v_fail_key;
  if v_status <> 'sending' then raise exception 'Failed transaction changed request state to %', v_status; end if;
  if exists (select 1 from public.trx_messages where wamid = v_fail_wamid) then
    raise exception 'Failed transaction left a partial outbound message';
  end if;


  -- A stale sending record is recoverable as unknown, never as an automatic resend.
  insert into public.trx_message_send_requests
    (idempotency_key, payload_hash, payload, state, created_at, updated_at)
  values
    ('p1-test-stale-' || gen_random_uuid()::text, repeat('e', 64), '{"type":"text"}'::jsonb,
     'sending', now() - interval '5 minutes', now() - interval '5 minutes');
  update public.trx_message_send_requests
     set state = 'unknown', updated_at = now()
   where state = 'sending' and updated_at < now() - interval '2 minutes'
     and payload_hash = repeat('e', 64);
  if not exists (
    select 1 from public.trx_message_send_requests
    where state = 'unknown' and payload_hash = repeat('e', 64)
  ) then raise exception 'Stale sending request was not marked unknown'; end if;

  -- A repeated key with different payload is prevented by the unique key and checked by API fingerprint logic.
  begin
    insert into public.trx_message_send_requests(idempotency_key, payload_hash, payload, state)
    values (v_key, repeat('c', 64), '{"type":"different"}'::jsonb, 'sending');
    raise exception 'Expected duplicate idempotency key to fail';
  exception when unique_violation then
    null;
  end;
end;
$$;

rollback;
