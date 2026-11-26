create table public.master_prompt (
  id uuid primary key default gen_random_uuid(),
  subject text,
  headline text,
  subheadline text,
  feature_items jsonb not null default '[]'::jsonb,
  background text,
  composition text,
  style text,
  quality text,
  ratio text not null default '4:5 portrait',
  created_at timestamptz not null default now()
);

alter table public.master_prompt enable row level security;
