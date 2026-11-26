BEGIN;

ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_variants_schema_check;

WITH expanded AS (
  SELECT p.item_group_id,
    GREATEST(COALESCE(p.quantity_to_sell_on_facebook, 0), 0)::bigint AS total_stock,
    v.ordinality, v.value AS variant, random() AS weight
  FROM public.products p
  CROSS JOIN LATERAL jsonb_array_elements(p.variants) WITH ORDINALITY AS v(value, ordinality)
),
weighted AS (
  SELECT *, SUM(weight) OVER (PARTITION BY item_group_id) AS total_weight FROM expanded
),
quotas AS (
  SELECT *, total_stock::numeric * weight / NULLIF(total_weight, 0) AS exact_share FROM weighted
),
floors AS (
  SELECT *, FLOOR(exact_share)::bigint AS base_stock,
    exact_share - FLOOR(exact_share) AS fractional_remainder FROM quotas
),
ranked AS (
  SELECT *, total_stock - SUM(base_stock) OVER (PARTITION BY item_group_id) AS remainder_units,
    ROW_NUMBER() OVER (PARTITION BY item_group_id ORDER BY fractional_remainder DESC, random()) AS remainder_rank
  FROM floors
),
allocated AS (
  SELECT item_group_id, ordinality, variant,
    base_stock + CASE WHEN remainder_rank <= remainder_units THEN 1 ELSE 0 END AS allocated_stock
  FROM ranked
),
rebuilt AS (
  SELECT item_group_id,
    jsonb_agg(jsonb_set(variant, '{quantity_to_sell_on_facebook}', to_jsonb(allocated_stock), true)
      ORDER BY ordinality) AS new_variants
  FROM allocated GROUP BY item_group_id
)
UPDATE public.products p
SET variants = rebuilt.new_variants, updated_at = NOW()
FROM rebuilt WHERE p.item_group_id = rebuilt.item_group_id;

ALTER TABLE public.products
  ADD CONSTRAINT products_variants_schema_check
  CHECK (jsonb_matches_schema(
    '{
      "type":"array",
      "items":{
        "type":"object",
        "additionalProperties":false,
        "required":["id","size","color","price","sale_price","image_link","additional_image_link","quantity_to_sell_on_facebook"],
        "properties":{
          "id":{"type":"string","minLength":1},
          "size":{"type":["string","null"]},
          "color":{"type":["string","null"]},
          "price":{"type":["number","null"]},
          "sale_price":{"type":["number","null"]},
          "image_link":{"type":["string","null"]},
          "additional_image_link":{"type":["array","null"],"items":{"type":"string"}},
          "quantity_to_sell_on_facebook":{"type":"integer","minimum":0}
        }
      }
    }'::json, variants
  ));

ALTER TABLE public.products
  ALTER COLUMN title SET NOT NULL,
  ALTER COLUMN brand SET NOT NULL,
  ALTER COLUMN sale_price_effective_date TYPE TEXT USING sale_price_effective_date::text;

ALTER TABLE public.products DROP COLUMN quantity_to_sell_on_facebook;

CREATE TABLE public.carts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_phone TEXT UNIQUE REFERENCES public.users(phone),
  items JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(items) = 'array'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number TEXT,
  user_phone TEXT REFERENCES public.users(phone),
  items JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(items) = 'array'),
  shipping_address JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(shipping_address) = 'object'),
  payment JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payment) = 'object'),
  tracking JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(tracking) = 'array'),
  subtotal NUMERIC,
  total NUMERIC,
  status TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.livechat (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_phone TEXT REFERENCES public.users(phone),
  conversation_number TEXT,
  subject TEXT,
  status TEXT,
  messages JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(messages) = 'array'),
  last_message_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_phone TEXT REFERENCES public.users(phone),
  type TEXT,
  title TEXT,
  message TEXT,
  data JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(data) = 'object'),
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.store_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE,
  value JSONB,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.store_contents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE,
  type TEXT,
  title TEXT,
  content JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(content) = 'object'),
  image_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.livechat ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_contents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read active store contents"
  ON public.store_contents FOR SELECT TO anon, authenticated USING (is_active = true);

COMMIT;
