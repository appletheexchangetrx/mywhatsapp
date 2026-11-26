create or replace function private.invoke_trx_push_dispatch()
returns void
language plpgsql
set search_path = ''
as $function$
begin
  perform net.http_post(
    url := 'https://axednjikcambzbkxyqpp.supabase.co/functions/v1/trx-push-dispatch',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 5000
  );
end;
$function$;
