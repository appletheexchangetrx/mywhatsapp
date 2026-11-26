alter table public.products
  drop column if exists expiration_date,
  add column if not exists custom_label_1 text,
  add column if not exists custom_label_2 text;
