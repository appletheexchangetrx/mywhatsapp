CREATE TABLE IF NOT EXISTS public.users (
  phone TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  password TEXT NOT NULL,
  avatar_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  preferences JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(preferences) = 'object'),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  user_addresses JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(user_addresses) = 'array'),
  user_wishlist JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(user_wishlist) = 'array'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON TABLE public.users TO anon, authenticated;

DROP POLICY IF EXISTS "users_public_select" ON public.users;
CREATE POLICY "users_public_select"
  ON public.users FOR SELECT
  TO anon, authenticated
  USING (TRUE);

DROP POLICY IF EXISTS "users_public_insert" ON public.users;
CREATE POLICY "users_public_insert"
  ON public.users FOR INSERT
  TO anon, authenticated
  WITH CHECK (TRUE);

DROP POLICY IF EXISTS "users_public_update" ON public.users;
CREATE POLICY "users_public_update"
  ON public.users FOR UPDATE
  TO anon, authenticated
  USING (TRUE)
  WITH CHECK (TRUE);
