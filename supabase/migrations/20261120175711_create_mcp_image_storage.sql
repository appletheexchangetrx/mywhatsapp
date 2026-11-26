create table if not exists public.mcp_image_uploads (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  storage_path text not null unique,
  public_url text not null,
  content_type text not null,
  size_bytes bigint not null check (size_bytes > 0),
  description text,
  created_at timestamptz not null default now()
);

alter table public.mcp_image_uploads enable row level security;

revoke all on table public.mcp_image_uploads from anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'mcp-images',
  'mcp-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
