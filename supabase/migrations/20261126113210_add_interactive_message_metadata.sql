-- Preserve the original Meta payload while exposing common interactive metadata for querying.
alter table public.trx_messages
  add column if not exists interactive_type text,
  add column if not exists context_wamid text,
  add column if not exists from_user_id text;

comment on column public.trx_messages.interactive_type is
  'Meta WhatsApp interactive reply type, e.g. button_reply or list_reply.';
comment on column public.trx_messages.context_wamid is
  'WAMID of the WhatsApp message that the inbound message replies to.';
comment on column public.trx_messages.from_user_id is
  'Meta user identifier supplied in the inbound WhatsApp webhook payload.';
