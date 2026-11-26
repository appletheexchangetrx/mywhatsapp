alter table public.products
  drop column if exists gtin,
  drop column if exists mpn;
