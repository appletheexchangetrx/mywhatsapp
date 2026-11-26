create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function private.invoke_trx_push_dispatch()
returns void
language plpgsql
set search_path = ''
as $$
declare
  dispatch_secret text;
begin
  select decrypted_secret
    into dispatch_secret
    from vault.decrypted_secrets
   where name = 'push_dispatch_secret'
   limit 1;

  -- Keep the scheduled job inert until the existing dispatcher secret is copied into Vault.
  if dispatch_secret is null or dispatch_secret = '' then
    return;
  end if;

  perform net.http_post(
    url := 'https://axednjikcambzbkxyqpp.supabase.co/functions/v1/trx-push-dispatch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-push-dispatch-secret', dispatch_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 5000
  );
end;
$$;

revoke all on function private.invoke_trx_push_dispatch() from public;

select cron.schedule(
  'trx-push-dispatch-every-minute',
  '* * * * *',
  'select private.invoke_trx_push_dispatch();'
);
