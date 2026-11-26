create table public.products (
  id text primary key,
  title text not null,
  description text,
  brand text,
  gtin text,
  mpn text,
  identifier_exists boolean not null default true,
  item_group_id text,

  availability text not null default 'in stock'
    check (availability in ('in stock', 'out of stock', 'preorder', 'available for order', 'discontinued')),
  condition text not null default 'new'
    check (condition in ('new', 'refurbished', 'used')),
  price numeric(14,2) not null check (price >= 0),
  sale_price numeric(14,2) check (sale_price is null or sale_price >= 0),
  sale_price_effective_date text,
  inventory integer check (inventory is null or inventory >= 0),
  expiration_date timestamptz,

  link text,
  image_link text,
  image_link_2 text,
  image_link_3 text,
  additional_image_link text,

  google_product_category text,
  product_type text,

  color text,
  size text,
  gender text,
  age_group text,
  material text,
  pattern text,

  custom_label_0 text,
  custom_label_1 text,
  custom_label_2 text,
  custom_label_3 text,
  custom_label_4 text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index products_brand_idx on public.products (brand);
create index products_availability_idx on public.products (availability);
create index products_item_group_id_idx on public.products (item_group_id);
create index products_updated_at_idx on public.products (updated_at desc);

alter table public.products enable row level security;
