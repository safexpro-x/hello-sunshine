-- =========================================================
-- 1. company_app_keys: per-company secret keys for native apps
-- =========================================================
CREATE TABLE IF NOT EXISTS public.company_app_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT 'Default',
  app_key text NOT NULL UNIQUE DEFAULT ('zk_' || encode(extensions.gen_random_bytes(24), 'hex')),
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS company_app_keys_company_idx ON public.company_app_keys(company_id);
CREATE INDEX IF NOT EXISTS company_app_keys_key_idx ON public.company_app_keys(app_key) WHERE is_active = true;

ALTER TABLE public.company_app_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner manages app keys" ON public.company_app_keys
  FOR ALL USING (company_id = public.get_user_company_id(auth.uid()))
  WITH CHECK (company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "Admin views app keys" ON public.company_app_keys
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Server-side verifier (used by edge functions via service role; safe definer)
CREATE OR REPLACE FUNCTION public.verify_app_key(_key text)
RETURNS uuid
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE cid uuid;
BEGIN
  IF _key IS NULL OR length(_key) < 8 THEN RETURN NULL; END IF;
  SELECT company_id INTO cid FROM public.company_app_keys
    WHERE app_key = _key AND is_active = true LIMIT 1;
  RETURN cid;
END $$;

-- =========================================================
-- 2. brand_settings: site-wide white-label config
-- =========================================================
CREATE TABLE IF NOT EXISTS public.brand_settings (
  id integer PRIMARY KEY DEFAULT 1,
  brand_name text NOT NULL DEFAULT 'Zentord',
  logo_url text,
  favicon_url text,
  primary_hsl text NOT NULL DEFAULT '262 83% 58%',
  accent_hsl text NOT NULL DEFAULT '199 89% 48%',
  footer_text text DEFAULT '© Zentord. All rights reserved.',
  support_email text DEFAULT 'support@example.com',
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT brand_settings_singleton CHECK (id = 1)
);

ALTER TABLE public.brand_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone reads brand" ON public.brand_settings
  FOR SELECT USING (true);

CREATE POLICY "Admin updates brand" ON public.brand_settings
  FOR UPDATE USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

INSERT INTO public.brand_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

DROP TRIGGER IF EXISTS brand_settings_set_updated_at ON public.brand_settings;
CREATE TRIGGER brand_settings_set_updated_at
  BEFORE UPDATE ON public.brand_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- 3. device_tokens: FCM tokens for employee push notifications
-- =========================================================
CREATE TABLE IF NOT EXISTS public.device_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  fcm_token text NOT NULL,
  platform text NOT NULL DEFAULT 'android',
  is_active boolean NOT NULL DEFAULT true,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, fcm_token)
);

CREATE INDEX IF NOT EXISTS device_tokens_company_idx ON public.device_tokens(company_id) WHERE is_active = true;

ALTER TABLE public.device_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "User manages own device tokens" ON public.device_tokens
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admin views device tokens" ON public.device_tokens
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'::app_role));

-- =========================================================
-- 4. branding storage bucket (public-read for logo/favicon)
-- =========================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('branding', 'branding', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public reads branding" ON storage.objects;
CREATE POLICY "Public reads branding" ON storage.objects
  FOR SELECT USING (bucket_id = 'branding');

DROP POLICY IF EXISTS "Admin writes branding" ON storage.objects;
CREATE POLICY "Admin writes branding" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'branding' AND public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admin updates branding" ON storage.objects;
CREATE POLICY "Admin updates branding" ON storage.objects
  FOR UPDATE USING (bucket_id = 'branding' AND public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admin deletes branding" ON storage.objects;
CREATE POLICY "Admin deletes branding" ON storage.objects
  FOR DELETE USING (bucket_id = 'branding' AND public.has_role(auth.uid(), 'admin'::app_role));