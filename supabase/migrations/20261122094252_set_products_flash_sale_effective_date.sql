ALTER TABLE public.products
  ALTER COLUMN sale_price_effective_date TYPE timestamptz
  USING sale_price_effective_date::timestamptz;

UPDATE public.products
SET
  custom_label_0 = 'flash_sale',
  sale_price_effective_date = now() + interval '14 days';
