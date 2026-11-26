BEGIN;

CREATE TEMP TABLE products_duplicate_flattened ON COMMIT DROP AS
SELECT
  p.title,
  p.description,
  p.brand,
  p.item_group_id,
  p.availability,
  p.condition,
  p.quantity_to_sell_on_facebook,
  p.link,
  p.google_product_category,
  p.product_type,
  p.created_at,
  p.updated_at,
  p.rich_text_description,
  p.custom_label_0,
  p.sale_price_effective_date,
  p.custom_label_1,
  p.custom_label_2,
  v.value->>'id' AS variant_id,
  v.value->>'size' AS size,
  v.value->>'color' AS color,
  CASE WHEN jsonb_typeof(v.value->'price') = 'number'
       THEN (v.value->>'price')::numeric ELSE NULL END AS price,
  CASE WHEN jsonb_typeof(v.value->'sale_price') = 'number'
       THEN (v.value->>'sale_price')::numeric ELSE NULL END AS sale_price,
  v.value->>'image_link' AS image_link,
  CASE WHEN jsonb_typeof(v.value->'additional_image_link') = 'array'
       THEN v.value->'additional_image_link' ELSE NULL END AS additional_image_link
FROM public.products_duplicate p
CROSS JOIN LATERAL jsonb_array_elements(p.variants) AS v(value);

ALTER TABLE public.products_duplicate
  ADD COLUMN variant_id text,
  ADD COLUMN size text,
  ADD COLUMN color text,
  ADD COLUMN price numeric,
  ADD COLUMN sale_price numeric,
  ADD COLUMN image_link text,
  ADD COLUMN additional_image_link jsonb;

ALTER TABLE public.products_duplicate
  DROP CONSTRAINT products_duplicate_pkey;

DELETE FROM public.products_duplicate;

ALTER TABLE public.products_duplicate
  DROP COLUMN variants;

INSERT INTO public.products_duplicate (
  title, description, brand, item_group_id, availability, condition,
  quantity_to_sell_on_facebook, link, google_product_category, product_type,
  created_at, updated_at, rich_text_description, custom_label_0,
  sale_price_effective_date, custom_label_1, custom_label_2,
  variant_id, size, color, price, sale_price, image_link, additional_image_link
)
SELECT
  title, description, brand, item_group_id, availability, condition,
  quantity_to_sell_on_facebook, link, google_product_category, product_type,
  created_at, updated_at, rich_text_description, custom_label_0,
  sale_price_effective_date, custom_label_1, custom_label_2,
  variant_id, size, color, price, sale_price, image_link, additional_image_link
FROM products_duplicate_flattened;

ALTER TABLE public.products_duplicate
  ALTER COLUMN variant_id SET NOT NULL,
  ADD CONSTRAINT products_duplicate_pkey PRIMARY KEY (variant_id);

COMMENT ON COLUMN public.products_duplicate.variant_id IS 'Unique variant identifier; primary key, sourced from the former variants.id.';
COMMENT ON COLUMN public.products_duplicate.item_group_id IS 'Parent product identifier shared by all variants belonging to the same product.';

COMMIT;
