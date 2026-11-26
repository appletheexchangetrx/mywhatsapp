-- Explicit public CRUD access requested for customer data tables.
-- WARNING: These policies allow any API client to read and modify every row.

DO $$
DECLARE
  tbl text;
  operation text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['carts', 'orders', 'livechat', 'notifications'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);

    EXECUTE format('DROP POLICY IF EXISTS "Public full access" ON public.%I', tbl);

    EXECUTE format(
      'CREATE POLICY "Public full access" ON public.%I FOR ALL TO anon, authenticated USING (true) WITH CHECK (true)',
      tbl
    );

    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', tbl);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO anon, authenticated', tbl);
  END LOOP;
END
$$;
